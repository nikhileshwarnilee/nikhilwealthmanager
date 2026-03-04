<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('auth_forgot_password', 40, 600);
Request::enforceMethod('POST');

$input = Request::body();
$email = Validator::email($input['email'] ?? '');

PasswordResetService::requestReset($email);

Response::success(
    'If the email is registered, a password reset link has been sent.'
);
