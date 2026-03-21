<?php

declare(strict_types=1);

require_once dirname(__DIR__, 3) . '/bootstrap.php';

RateLimitMiddleware::enforce('admin_users_update', 120, 600);
Request::enforceMethod('POST');
$actor = AuthMiddleware::user();
$input = Request::body();

$targetUserId = Validator::positiveInt($input['id'] ?? 0, 'id');
$updated = UserAdminService::updateUser($targetUserId, $actor, $input);

Response::success('User updated.', [
    'user' => $updated,
]);
