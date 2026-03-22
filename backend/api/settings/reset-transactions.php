<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';
require_once dirname(__DIR__, 2) . '/services/WorkspaceResetService.php';

RateLimitMiddleware::enforce('settings_reset_transactions', 8, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
if (!PermissionService::isSuperAdmin($user)) {
    Response::error('Only super admin can reset workspace transactions.', 403);
}

$input = Request::body();
$currentPassword = (string) ($input['current_password'] ?? '');
AuthService::assertCurrentPassword((int) ($user['id'] ?? 0), $currentPassword);

$workspaceUserId = AuthService::workspaceOwnerId($user);
$result = WorkspaceResetService::resetTransactionsToOpeningBalances($workspaceUserId);

Response::success(
    'Transactions reset. Current account balances are now your opening balances.',
    $result
);
