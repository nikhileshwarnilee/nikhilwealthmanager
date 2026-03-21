<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('assets_delete', 120, 600);
if (!in_array(Request::method(), ['DELETE', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? Request::query('id', 0), 'id');
$replacementAssetTypeId = Validator::nullablePositiveInt($input['replacement_asset_type_id'] ?? null);

$result = AssetService::deleteType($userId, $id, $replacementAssetTypeId);

Response::success('Asset type deleted.', $result);
