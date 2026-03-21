<?php

declare(strict_types=1);

require_once dirname(__DIR__, 3) . '/bootstrap.php';

if (!in_array(Request::method(), ['POST', 'DELETE'], true)) {
    Response::error('Method not allowed.', 405);
}

$actor = AuthMiddleware::user();
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? Request::query('id', 0), 'id');

UserAdminService::deleteUser($id, $actor);

Response::success('User deleted.');
