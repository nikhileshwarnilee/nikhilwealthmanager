<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_logout', 80, 600);
Request::enforceMethod('POST');

$input = Request::body();
$refreshToken = Validator::string($input['refresh_token'] ?? '', 500);

if ($refreshToken !== '') {
    TokenService::revokeRefreshToken($refreshToken);
}

$token = Request::bearerToken();
if ($token !== null) {
    $payload = TokenService::verifyAccessToken($token);
    if (is_array($payload) && isset($payload['uid'])) {
        TokenService::revokeAllForUser((int) $payload['uid']);
    }
}

Response::success('Logged out successfully.');

