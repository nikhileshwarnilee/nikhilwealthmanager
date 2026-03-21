<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
[$targetUserId, $allowedAccountIds] = [AuthService::workspaceOwnerId($user), UserAccountAccessService::allowedAccountIds($user)];

$includeArchived = (int) Request::query('include_archived', 0) === 1;
$managedUserId = Validator::nullablePositiveInt(Request::query('managed_user_id', ''));

if ($managedUserId !== null) {
    if (!PermissionService::isSuperAdmin($user)) {
        Response::error('Only super admin can inspect another user account setup.', 403);
    }
    $targetUserId = AuthService::workspaceOwnerIdForUserId($managedUserId);
    $allowedAccountIds = [];
}

$sql = 'SELECT id, name, type, initial_balance, current_balance, currency, is_archived, created_at, updated_at
        FROM accounts
        WHERE user_id = :user_id
          AND is_deleted = 0';
$params = [':user_id' => $targetUserId];

$sql .= UserAccountAccessService::buildAccountsFilterSql('id', $allowedAccountIds, $params, 'allowed_account');

if (!$includeArchived) {
    $sql .= ' AND is_archived = 0';
}
$sql .= ' ORDER BY created_at DESC';

$stmt = db()->prepare($sql);
$stmt->execute($params);
$accounts = $stmt->fetchAll();

Response::success('Accounts fetched.', [
    'accounts' => $accounts,
]);
