<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();

$settings = PermissionService::decorateSettings($user, UserSettingsService::get((int) $user['id']));

Response::success('Profile loaded.', [
    'user' => $user,
    'settings' => $settings,
]);

