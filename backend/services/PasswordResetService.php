<?php

declare(strict_types=1);

final class PasswordResetService
{
    public static function requestReset(string $email): void
    {
        self::ensureTable();

        $normalizedEmail = Validator::email($email);
        $stmt = db()->prepare(
            'SELECT id, name, email
             FROM users
             WHERE email = :email
             LIMIT 1'
        );
        $stmt->execute([':email' => $normalizedEmail]);
        $user = $stmt->fetch();
        if (!$user) {
            return;
        }

        $userId = (int) $user['id'];
        $token = self::randomToken();
        $tokenHash = hash('sha256', $token);
        $ttl = max(300, (int) env('PASSWORD_RESET_TTL', '1800'));

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $invalidateStmt = $pdo->prepare(
                'UPDATE password_reset_tokens
                 SET used_at = NOW()
                 WHERE user_id = :user_id
                   AND used_at IS NULL'
            );
            $invalidateStmt->execute([':user_id' => $userId]);

            $insertStmt = $pdo->prepare(
                'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                 VALUES (:user_id, :token_hash, DATE_ADD(NOW(), INTERVAL ' . $ttl . ' SECOND))'
            );
            $insertStmt->execute([
                ':user_id' => $userId,
                ':token_hash' => $tokenHash,
            ]);

            $cleanupStmt = $pdo->prepare(
                'DELETE FROM password_reset_tokens
                 WHERE user_id = :user_id
                   AND (
                     expires_at < NOW()
                     OR (used_at IS NOT NULL AND used_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
                   )'
            );
            $cleanupStmt->execute([':user_id' => $userId]);

            $pdo->commit();
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }

        $frontendBase = rtrim((string) env('APP_FRONTEND_URL', 'http://localhost:5173'), '/');
        $appName = Validator::string(env('APP_NAME', 'Expense Manager'), 120);
        $resetUrl = $frontendBase . '/reset-password?token=' . urlencode($token);

        $subject = $appName . ' Password Reset';
        $safeName = htmlspecialchars((string) ($user['name'] ?? 'User'), ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($resetUrl, ENT_QUOTES, 'UTF-8');
        $html = '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">'
            . '<h2 style="margin-bottom:8px">' . htmlspecialchars($appName, ENT_QUOTES, 'UTF-8') . '</h2>'
            . '<p>Hello ' . $safeName . ',</p>'
            . '<p>Click the button below to reset your password. This link expires in '
            . (string) floor(max(300, $ttl) / 60) . ' minutes.</p>'
            . '<p><a href="' . $safeUrl . '" '
            . 'style="display:inline-block;padding:10px 16px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px">'
            . 'Reset Password</a></p>'
            . '<p>If the button does not work, open this link:</p>'
            . '<p><a href="' . $safeUrl . '">' . $safeUrl . '</a></p>'
            . '<p>If you did not request this, you can ignore this email.</p>'
            . '</div>';
        $text = "Hello {$user['name']},\n\nReset your password using this link:\n{$resetUrl}\n\n"
            . 'If you did not request this, ignore this email.';

        $sent = MailService::send((string) $user['email'], $subject, $html, $text);
        if (!$sent) {
            Response::error('Unable to send reset email right now. Please try again.', 500);
        }
    }

    public static function resetWithToken(string $token, string $newPassword): void
    {
        self::ensureTable();
        $rawToken = Validator::string($token, 500);
        if ($rawToken === '') {
            Response::error('Reset token is required.', 422);
        }

        $tokenHash = hash('sha256', $rawToken);
        $stmt = db()->prepare(
            'SELECT id, user_id
             FROM password_reset_tokens
             WHERE token_hash = :token_hash
               AND used_at IS NULL
               AND expires_at >= NOW()
             LIMIT 1'
        );
        $stmt->execute([':token_hash' => $tokenHash]);
        $row = $stmt->fetch();

        if (!$row) {
            Response::error('Reset link is invalid or expired.', 400);
        }

        $userId = (int) $row['user_id'];
        AuthService::setPasswordDirect($userId, $newPassword);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $markUsedStmt = $pdo->prepare(
                'UPDATE password_reset_tokens
                 SET used_at = NOW()
                 WHERE id = :id'
            );
            $markUsedStmt->execute([':id' => (int) $row['id']]);

            $invalidateStmt = $pdo->prepare(
                'UPDATE password_reset_tokens
                 SET used_at = NOW()
                 WHERE user_id = :user_id
                   AND used_at IS NULL'
            );
            $invalidateStmt->execute([':user_id' => $userId]);

            TokenService::revokeAllForUser($userId);
            $pdo->commit();
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function ensureTable(): void
    {
        $userIdColumnType = self::resolveUsersIdColumnType();
        db()->exec(
            'CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id ' . $userIdColumnType . ' NOT NULL,
                token_hash VARCHAR(255) NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_password_reset_tokens_user
                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_password_reset_user (user_id),
                INDEX idx_password_reset_expires (expires_at),
                INDEX idx_password_reset_used (used_at)
            ) ENGINE=InnoDB'
        );
    }

    private static function resolveUsersIdColumnType(): string
    {
        $stmt = db()->query("SHOW COLUMNS FROM users LIKE 'id'");
        $column = $stmt ? $stmt->fetch() : null;
        $rawType = strtolower(trim((string) ($column['Type'] ?? '')));

        if (
            $rawType !== ''
            && preg_match('/^(tinyint|smallint|mediumint|int|bigint)(\\([0-9]+\\))?( unsigned)?$/', $rawType) === 1
        ) {
            return strtoupper($rawType);
        }

        return 'BIGINT UNSIGNED';
    }

    private static function randomToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(48)), '+/', '-_'), '=');
    }
}
