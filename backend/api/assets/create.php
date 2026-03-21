<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('assets_create', 120, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();

$assetType = AssetService::createType($userId, $input);

Response::success('Asset type created.', [
    'asset' => $assetType,
], 201);
