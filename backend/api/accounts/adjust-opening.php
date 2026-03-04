<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('accounts_adjust_opening', 120, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();

$accountId = Validator::positiveInt($input['account_id'] ?? 0, 'account_id');
if (!is_numeric($input['new_initial_balance'] ?? null)) {
    Response::error('new_initial_balance must be numeric.', 422);
}
$newInitialBalance = round((float) $input['new_initial_balance'], 2);
$note = Validator::string($input['note'] ?? '', 255);

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

    $oldInitial = round((float) $account['initial_balance'], 2);
    $delta = round($newInitialBalance - $oldInitial, 2);

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

    $adjustment = null;
    if (abs($delta) >= 0.01) {
        $autoNote = sprintf(
            'Opening balance adjusted from %.2f to %.2f',
            $oldInitial,
            $newInitialBalance
        );
        $adjustment = TransactionService::createOpeningAdjustment(
            $userId,
            $accountId,
            $delta,
            $note !== '' ? $note : $autoNote,
            $pdo,
            false
        );
    }

    BalanceRecalculationService::recalculate($userId, $pdo);

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
        'adjustment_transaction' => $adjustment,
        'delta' => $delta,
    ]);
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}

