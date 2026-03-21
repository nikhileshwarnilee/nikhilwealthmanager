<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('accounts_adjust_opening', 120, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);
$input = Request::body();

$accountId = Validator::positiveInt($input['account_id'] ?? 0, 'account_id');
if (!is_numeric($input['new_initial_balance'] ?? null)) {
    Response::error('new_initial_balance must be numeric.', 422);
}
$newInitialBalance = round((float) $input['new_initial_balance'], 2);

if ($allowedAccountIds !== []) {
    UserAccountAccessService::assertAllowedAccount($accountId, $allowedAccountIds);
}

$pdo = db();
$pdo->beginTransaction();

try {
    $accountStmt = $pdo->prepare(
        'SELECT id, name, initial_balance
         FROM accounts
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0
         LIMIT 1
         FOR UPDATE'
    );
    $accountStmt->execute([
        ':id' => $accountId,
        ':user_id' => $userId,
    ]);
    $account = $accountStmt->fetch();
    if (!$account) {
        Response::error('Account not found.', 404);
    }

    $updateStmt = $pdo->prepare(
        'UPDATE accounts
         SET initial_balance = :initial_balance
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0'
    );
    $updateStmt->execute([
        ':initial_balance' => $newInitialBalance,
        ':id' => $accountId,
        ':user_id' => $userId,
    ]);

    // Legacy versions created system opening_adjustment transactions.
    // Opening balance is now a direct account field edit, so remove those entries.
    $cleanupStmt = $pdo->prepare(
        'DELETE FROM transactions
         WHERE user_id = :user_id
           AND is_deleted = 0
           AND type = :type
           AND reference_type = :reference_type
           AND to_account_id = :account_id'
    );
    $cleanupStmt->execute([
        ':user_id' => $userId,
        ':type' => 'opening_adjustment',
        ':reference_type' => 'system',
        ':account_id' => $accountId,
    ]);

    BalanceRecalculationService::recalculate($userId, $pdo, false);

    $freshStmt = $pdo->prepare(
        'SELECT id, name, type, initial_balance, current_balance, currency, is_archived, created_at, updated_at
         FROM accounts
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0
         LIMIT 1'
    );
    $freshStmt->execute([
        ':id' => $accountId,
        ':user_id' => $userId,
    ]);

    $pdo->commit();

    Response::success('Opening balance adjusted.', [
        'account' => $freshStmt->fetch(),
    ]);
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}
