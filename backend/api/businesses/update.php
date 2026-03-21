<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('businesses_update', 160, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? 0, 'id');

$business = BusinessService::update($userId, $id, $input);

Response::success('Business updated.', [
    'business' => $business,
]);
