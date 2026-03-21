<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('assets_update_value', 200, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();

$assetTypeId = Validator::positiveInt($input['asset_type_id'] ?? 0, 'asset_type_id');
if (!is_numeric($input['current_value'] ?? null)) {
    Response::error('current_value must be numeric.', 422);
}
$currentValue = round((float) $input['current_value'], 2);
$recordedAt = Validator::dateTime($input['recorded_at'] ?? null, true);
$note = Validator::string($input['note'] ?? '', 255);

$updated = AssetService::updateCurrentValue(
    $userId,
    $assetTypeId,
    $currentValue,
    $recordedAt,
    $note
);

Response::success('Asset current value updated.', $updated);
