<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

$settings = PermissionService::decorateSettings($user, UserSettingsService::get($userId));

Response::success('Settings loaded.', [
    'settings' => $settings,
]);

