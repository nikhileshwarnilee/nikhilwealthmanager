<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('accounts_delete', 80, 600);
if (!in_array(Request::method(), ['DELETE', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? Request::query('id', 0), 'id');

$countStmt = db()->prepare(
    'SELECT COUNT(*) AS total
     FROM accounts
     WHERE user_id = :user_id
       AND is_deleted = 0'
);
$countStmt->execute([':user_id' => $userId]);
$activeAccounts = (int) (($countStmt->fetch()['total'] ?? 0));
if ($activeAccounts <= 1) {
    Response::error('You cannot delete the last account.', 422);
}

$accountStmt = db()->prepare(
    'SELECT id, name, type, current_balance
     FROM accounts
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$accountStmt->execute([':id' => $id, ':user_id' => $userId]);
$account = $accountStmt->fetch();
if (!$account) {
    Response::error('Account not found.', 404);
}

$currentBalance = round((float) ($account['current_balance'] ?? 0), 2);
if (abs($currentBalance) >= 0.01) {
    Response::error('Only zero-balance accounts can be deleted.', 422, [
        'current_balance' => $currentBalance,
    ]);
}

$txCountStmt = db()->prepare(
    'SELECT COUNT(*) AS total
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND (from_account_id = :from_account_id OR to_account_id = :to_account_id)'
);
$txCountStmt->execute([
    ':user_id' => $userId,
    ':from_account_id' => $id,
    ':to_account_id' => $id,
]);
$transactionCount = (int) (($txCountStmt->fetch()['total'] ?? 0));

$pdo = db();
$pdo->beginTransaction();

try {
    $detachFromStmt = $pdo->prepare(
        'UPDATE transactions
         SET from_account_id = NULL
         WHERE user_id = :user_id
           AND is_deleted = 0
           AND from_account_id = :source_account_id'
    );
    $detachFromStmt->execute([
        ':user_id' => $userId,
        ':source_account_id' => $id,
    ]);

    $detachToStmt = $pdo->prepare(
        'UPDATE transactions
         SET to_account_id = NULL
         WHERE user_id = :user_id
           AND is_deleted = 0
           AND to_account_id = :source_account_id'
    );
    $detachToStmt->execute([
        ':user_id' => $userId,
        ':source_account_id' => $id,
    ]);

    $softDeleteStmt = $pdo->prepare(
        'UPDATE accounts
         SET is_deleted = 1,
             is_archived = 1
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0'
    );
    $softDeleteStmt->execute([
        ':id' => $id,
        ':user_id' => $userId,
    ]);

    // For account deletion, enforce only the deleted account zero-balance rule.
    // Legacy imported histories may temporarily cross negative in other accounts.
    BalanceRecalculationService::recalculate($userId, $pdo, false);
    $pdo->commit();

    Response::success('Account deleted.', [
        'detached_transactions' => $transactionCount,
        'account_removed' => true,
    ]);
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}
