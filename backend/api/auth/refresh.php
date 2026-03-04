<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_refresh', 60, 600);
Request::enforceMethod('POST');

$input = Request::body();
$refreshToken = Validator::string($input['refresh_token'] ?? '', 500);
if ($refreshToken === '') {
    Response::error('refresh_token is required.', 422);
}

$rotated = TokenService::rotateRefreshToken($refreshToken);
if ($rotated === null) {
    Response::error('Invalid or expired refresh token.', 401);
}

$user = AuthService::findUserById((int) $rotated['user_id']);
$accessToken = TokenService::issueAccessToken($user);

Response::success('Token refreshed.', [
    'access_token' => $accessToken,
    'refresh_token' => $rotated['refresh_token'],
    'access_expires_in' => (int) env('ACCESS_TOKEN_TTL', '900'),
]);

