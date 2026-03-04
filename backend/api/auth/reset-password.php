<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_reset_password', 40, 600);
Request::enforceMethod('POST');

$input = Request::body();
$token = Validator::string($input['token'] ?? '', 500);
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

PasswordResetService::resetWithToken($token, $newPassword);

Response::success('Password reset successful. You can now login.');
