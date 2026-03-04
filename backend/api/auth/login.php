<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_login', 20, 600);
Request::enforceMethod('POST');

$input = Request::body();
$email = Validator::email($input['email'] ?? '');
$password = (string) ($input['password'] ?? '');

if ($password === '') {
    Response::error('Password is required.', 422);
}

$user = AuthService::login($email, $password);
TokenService::cleanupExpiredTokens((int) $user['id']);

$accessToken = TokenService::issueAccessToken($user);
$refreshToken = TokenService::issueRefreshToken((int) $user['id']);

Response::success('Login successful.', [
    'user' => $user,
    'access_token' => $accessToken,
    'refresh_token' => $refreshToken,
    'access_expires_in' => (int) env('ACCESS_TOKEN_TTL', '900'),
]);

