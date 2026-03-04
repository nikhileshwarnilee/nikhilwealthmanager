<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_update_profile', 120, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();

$name = Validator::string($input['name'] ?? '', 120);
$email = Validator::email($input['email'] ?? '');
$currentPassword = (string) ($input['current_password'] ?? '');

$updated = AuthService::updateProfile(
    $userId,
    $name,
    $email,
    $currentPassword !== '' ? $currentPassword : null
);

Response::success('Profile updated.', [
    'user' => $updated,
]);
