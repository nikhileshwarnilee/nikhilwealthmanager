<?php

declare(strict_types=1);

final class BalanceRecalculationService
{
    public static function recalculate(int $userId, ?PDO $pdo = null, bool $enforceNonNegative = true): void
    {
        $db = $pdo ?? db();

        $accountsStmt = $db->prepare(
            'SELECT id, name, type, initial_balance
             FROM accounts
             WHERE user_id = :user_id
               AND is_deleted = 0
             ORDER BY id ASC
             FOR UPDATE'
        );
        $accountsStmt->execute([':user_id' => $userId]);
        $accounts = $accountsStmt->fetchAll();

        $balances = [];
        $accountMeta = [];
        foreach ($accounts as $account) {
            $accountId = (int) $account['id'];
            $balances[$accountId] = round((float) $account['initial_balance'], 2);
            $accountMeta[$accountId] = [
                'name' => (string) $account['name'],
                'type' => (string) $account['type'],
            ];
        }

        $txnStmt = $db->prepare(
            'SELECT id, type, amount, from_account_id, to_account_id
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0
             ORDER BY transaction_date ASC, id ASC
             FOR UPDATE'
        );
        $txnStmt->execute([':user_id' => $userId]);
        $transactions = $txnStmt->fetchAll();

        $updateRunningStmt = $db->prepare(
            'UPDATE transactions
             SET running_balance = :running_balance
             WHERE id = :id
               AND user_id = :user_id'
        );

        foreach ($transactions as $txn) {
            $changes = self::buildAccountChanges($txn);
            foreach ($changes as $accountId => $delta) {
                if (!array_key_exists($accountId, $balances)) {
                    Response::error('Transaction references a deleted account.', 422);
                }

                $next = round($balances[$accountId] + $delta, 2);
                $accountType = $accountMeta[$accountId]['type'] ?? '';
                if ($enforceNonNegative && $accountType !== 'credit' && $next < 0) {
                    $accountName = $accountMeta[$accountId]['name'] ?? ('#' . $accountId);
                    Response::error('Insufficient balance in account: ' . $accountName, 422);
                }
                $balances[$accountId] = $next;
            }

            $primaryAccountId = self::primaryAccountId($txn);
            $runningBalance = 0.0;
            if ($primaryAccountId !== null && array_key_exists($primaryAccountId, $balances)) {
                $runningBalance = round((float) $balances[$primaryAccountId], 2);
            }

            $updateRunningStmt->execute([
                ':running_balance' => $runningBalance,
                ':id' => (int) $txn['id'],
                ':user_id' => $userId,
            ]);
        }

        $updateAccountStmt = $db->prepare(
            'UPDATE accounts
             SET current_balance = :current_balance
             WHERE id = :id
               AND user_id = :user_id'
        );

        foreach ($balances as $accountId => $balance) {
            $updateAccountStmt->execute([
                ':current_balance' => round((float) $balance, 2),
                ':id' => (int) $accountId,
                ':user_id' => $userId,
            ]);
        }
    }

    private static function buildAccountChanges(array $txn): array
    {
        $type = (string) ($txn['type'] ?? '');
        $amount = round((float) ($txn['amount'] ?? 0), 2);
        $fromId = isset($txn['from_account_id']) && $txn['from_account_id'] !== null ? (int) $txn['from_account_id'] : null;
        $toId = isset($txn['to_account_id']) && $txn['to_account_id'] !== null ? (int) $txn['to_account_id'] : null;

        $changes = [];
        if ($type === 'income') {
            if ($toId !== null) {
                $changes[$toId] = ($changes[$toId] ?? 0) + $amount;
            }
        } elseif ($type === 'expense') {
            if ($fromId !== null) {
                $changes[$fromId] = ($changes[$fromId] ?? 0) - $amount;
            }
        } elseif ($type === 'transfer') {
            if ($fromId !== null) {
                $changes[$fromId] = ($changes[$fromId] ?? 0) - $amount;
            }
            if ($toId !== null) {
                $changes[$toId] = ($changes[$toId] ?? 0) + $amount;
            }
        } elseif ($type === 'opening_adjustment') {
            if ($toId !== null) {
                $changes[$toId] = ($changes[$toId] ?? 0) + $amount;
            }
        }

        return $changes;
    }

    private static function primaryAccountId(array $txn): ?int
    {
        $type = (string) ($txn['type'] ?? '');
        if ($type === 'income') {
            return isset($txn['to_account_id']) && $txn['to_account_id'] !== null
                ? (int) $txn['to_account_id']
                : null;
        }
        if ($type === 'expense' || $type === 'transfer') {
            return isset($txn['from_account_id']) && $txn['from_account_id'] !== null
                ? (int) $txn['from_account_id']
                : null;
        }
        if ($type === 'opening_adjustment') {
            return isset($txn['to_account_id']) && $txn['to_account_id'] !== null
                ? (int) $txn['to_account_id']
                : null;
        }
        return null;
    }
}
