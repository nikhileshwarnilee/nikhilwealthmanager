<?php

declare(strict_types=1);

final class TokenService
{
    public static function issueAccessToken(array $user): string
    {
        $secret = (string) env('APP_JWT_SECRET', 'change-this-secret');
        $ttl = (int) env('ACCESS_TOKEN_TTL', '900');

        return Jwt::encode([
            'typ' => 'access',
            'uid' => (int) $user['id'],
            'email' => (string) $user['email'],
            'name' => (string) $user['name'],
        ], $secret, $ttl);
    }

    public static function issueRefreshToken(int $userId): string
    {
        $token = self::randomToken();
        $tokenHash = hash('sha256', $token);
        $ttl = (int) env('REFRESH_TOKEN_TTL', '315360000');
        $expiresAt = date('Y-m-d H:i:s', time() + $ttl);

        $stmt = db()->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
             VALUES (:user_id, :token_hash, :expires_at, :user_agent, :ip_address)'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':token_hash' => $tokenHash,
            ':expires_at' => $expiresAt,
            ':user_agent' => Request::userAgent(),
            ':ip_address' => Request::ip(),
        ]);

        return $token;
    }

    public static function verifyAccessToken(string $token): ?array
    {
        $secret = (string) env('APP_JWT_SECRET', 'change-this-secret');
        $payload = Jwt::decode($token, $secret);
        if (!is_array($payload)) {
            return null;
        }

        if (($payload['typ'] ?? null) !== 'access' || !isset($payload['uid'])) {
            return null;
        }

        return $payload;
    }

    public static function rotateRefreshToken(string $refreshToken): ?array
    {
        $hash = hash('sha256', $refreshToken);
        $stmt = db()->prepare(
            'SELECT id, user_id, expires_at, revoked_at
             FROM refresh_tokens
             WHERE token_hash = :token_hash
             LIMIT 1'
        );
        $stmt->execute([':token_hash' => $hash]);
        $row = $stmt->fetch();

        if (!$row) {
            return null;
        }

        if ($row['revoked_at'] !== null || strtotime((string) $row['expires_at']) < time()) {
            return null;
        }

        // Keep refresh token stable across refresh calls to avoid multi-tab race invalidations.
        $ttl = (int) env('REFRESH_TOKEN_TTL', '315360000');
        $nextExpiry = date('Y-m-d H:i:s', time() + $ttl);
        $touchStmt = db()->prepare(
            'UPDATE refresh_tokens
             SET expires_at = :expires_at,
                 user_agent = :user_agent,
                 ip_address = :ip_address
             WHERE id = :id
               AND revoked_at IS NULL'
        );
        $touchStmt->execute([
            ':expires_at' => $nextExpiry,
            ':user_agent' => Request::userAgent(),
            ':ip_address' => Request::ip(),
            ':id' => (int) $row['id'],
        ]);

        return [
            'user_id' => (int) $row['user_id'],
            'refresh_token' => $refreshToken,
        ];
    }

    public static function revokeRefreshToken(string $refreshToken): void
    {
        $hash = hash('sha256', $refreshToken);
        $stmt = db()->prepare(
            'UPDATE refresh_tokens
             SET revoked_at = NOW()
             WHERE token_hash = :token_hash AND revoked_at IS NULL'
        );
        $stmt->execute([':token_hash' => $hash]);
    }

    public static function cleanupExpiredTokens(int $userId): void
    {
        $stmt = db()->prepare(
            'DELETE FROM refresh_tokens
             WHERE user_id = :user_id
               AND (expires_at < NOW() OR revoked_at IS NOT NULL)'
        );
        $stmt->execute([':user_id' => $userId]);
    }

    public static function revokeAllForUser(int $userId): void
    {
        $stmt = db()->prepare(
            'UPDATE refresh_tokens
             SET revoked_at = NOW()
             WHERE user_id = :user_id AND revoked_at IS NULL'
        );
        $stmt->execute([':user_id' => $userId]);
    }

    private static function randomToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    }
}
