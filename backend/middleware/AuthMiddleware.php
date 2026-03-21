<?php

declare(strict_types=1);

final class AuthMiddleware
{
    public static function user(): array
    {
        $token = Request::bearerToken();
        if ($token === null) {
            Response::error('Unauthorized.', 401);
        }

        $payload = TokenService::verifyAccessToken($token);
        if ($payload === null || !isset($payload['uid'])) {
            Response::error('Invalid or expired access token.', 401);
        }

        $user = AuthService::findUserById((int) $payload['uid']);
        if (!empty($user['deleted_at'])) {
            Response::error('This account has been removed. Contact your super admin.', 403);
        }
        if (!(bool) ($user['is_active'] ?? true)) {
            Response::error('This account is inactive. Contact your super admin.', 403);
        }

        PermissionService::authorizeRequest($user);

        return $user;
    }
}

