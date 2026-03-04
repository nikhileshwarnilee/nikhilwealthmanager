<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_change_password', 100, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();

$currentPassword = (string) ($input['current_password'] ?? '');
$newPassword = (string) ($input['new_password'] ?? '');
$confirmPassword = (string) ($input['confirm_password'] ?? '');

if ($newPassword === '') {
    Response::error('New password is required.', 422);
}
if ($confirmPassword === '') {
    Response::error('Confirm password is required.', 422);
}
if ($newPassword !== $confirmPassword) {
    Response::error('Confirm password does not match.', 422);
}

AuthService::changePassword($userId, $currentPassword, $newPassword);

Response::success('Password updated.');
