<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_register', 12, 600);
Request::enforceMethod('POST');

$input = Request::body();
$name = Validator::string($input['name'] ?? '', 120);
$email = Validator::email($input['email'] ?? '');
$password = Validator::password($input['password'] ?? '');

if ($name === '') {
    Response::error('Name is required.', 422);
}

$user = AuthService::register($name, $email, $password);
TokenService::cleanupExpiredTokens((int) $user['id']);
$settings = PermissionService::decorateSettings($user, UserSettingsService::get((int) $user['id']));
$accessToken = TokenService::issueAccessToken($user);
$refreshToken = TokenService::issueRefreshToken((int) $user['id']);

Response::success('Registration successful.', [
    'user' => $user,
    'settings' => $settings,
    'access_token' => $accessToken,
    'refresh_token' => $refreshToken,
    'access_expires_in' => (int) env('ACCESS_TOKEN_TTL', '900'),
], 201);

