<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('assets_update', 160, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? 0, 'id');

$assetType = AssetService::updateType($userId, $id, $input);

Response::success('Asset type updated.', [
    'asset' => $assetType,
]);
