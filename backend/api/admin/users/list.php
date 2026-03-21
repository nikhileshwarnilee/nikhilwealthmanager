<?php

declare(strict_types=1);

require_once dirname(__DIR__, 3) . '/bootstrap.php';

Request::enforceMethod('GET');
$actor = AuthMiddleware::user();

Response::success('Users fetched.', [
    'users' => UserAdminService::listUsers($actor),
]);
