<?php

declare(strict_types=1);

require_once dirname(__DIR__, 3) . '/bootstrap.php';

RateLimitMiddleware::enforce('admin_users_create', 60, 600);
Request::enforceMethod('POST');
$actor = AuthMiddleware::user();

$input = Request::body();
$created = UserAdminService::createUser($actor, $input);

Response::success('User created.', [
    'user' => $created,
], 201);
