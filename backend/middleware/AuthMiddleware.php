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

        return AuthService::findUserById((int) $payload['uid']);
    }
}

