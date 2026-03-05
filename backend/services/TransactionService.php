<?php

declare(strict_types=1);

final class TransactionService
{
    public static function create(int $userId, array $input): array
    {
        $data = self::normalizeInput($userId, $input, null);
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $balanceSnapshot = self::snapshotAccountBalances($pdo, $userId);
            $id = self::insertTransaction($pdo, $userId, $data);
            $recalculated = BalanceRecalculationService::recalculate($userId, $pdo, false);
            self::assertNonCreditFinalBalances(
                $balanceSnapshot,
                (array) ($recalculated['balances'] ?? []),
                (array) ($recalculated['account_meta'] ?? [])
            );
            $pdo->commit();

            return self::findById($id, $userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function update(int $userId, int $transactionId, array $input): array
    {
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $balanceSnapshot = self::snapshotAccountBalances($pdo, $userId);
            $existing = self::findRawById($transactionId, $userId, true, $pdo);
            if (!$existing || (int) ($existing['is_deleted'] ?? 0) === 1) {
                Response::error('Transaction not found.', 404);
            }
            if (self::isSystemTransaction($existing)) {
                Response::error('System transactions cannot be edited.', 422);
            }

            $next = self::normalizeInput($userId, $input, $existing);

            $stmt = $pdo->prepare(
                'UPDATE transactions
                 SET from_account_id = :from_account_id,
                     to_account_id = :to_account_id,
                     category_id = :category_id,
                     amount = :amount,
                     type = :type,
                     reference_type = :reference_type,
                     reference_id = :reference_id,
                     note = :note,
                     location = :location,
                     receipt_path = :receipt_path,
                     transaction_date = :transaction_date
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );
            $stmt->execute([
                ':from_account_id' => $next['from_account_id'],
                ':to_account_id' => $next['to_account_id'],
                ':category_id' => $next['category_id'],
                ':amount' => $next['amount'],
                ':type' => $next['type'],
                ':reference_type' => $next['reference_type'],
                ':reference_id' => $next['reference_id'],
                ':note' => $next['note'],
                ':location' => $next['location'],
                ':receipt_path' => $next['receipt_path'],
                ':transaction_date' => $next['transaction_date'],
                ':id' => $transactionId,
                ':user_id' => $userId,
            ]);

            $recalculated = BalanceRecalculationService::recalculate($userId, $pdo, false);
            self::assertNonCreditFinalBalances(
                $balanceSnapshot,
                (array) ($recalculated['balances'] ?? []),
                (array) ($recalculated['account_meta'] ?? [])
            );
            $pdo->commit();

            return self::findById($transactionId, $userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function delete(int $userId, int $transactionId): void
    {
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $balanceSnapshot = self::snapshotAccountBalances($pdo, $userId);
            $existing = self::findRawById($transactionId, $userId, true, $pdo);
            if (!$existing || (int) ($existing['is_deleted'] ?? 0) === 1) {
                Response::error('Transaction not found.', 404);
            }
            if (self::isSystemTransaction($existing)) {
                Response::error('System transactions cannot be deleted.', 422);
            }

            $stmt = $pdo->prepare(
                'UPDATE transactions
                 SET is_deleted = 1
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );
            $stmt->execute([':id' => $transactionId, ':user_id' => $userId]);

            $recalculated = BalanceRecalculationService::recalculate($userId, $pdo, false);
            self::assertNonCreditFinalBalances(
                $balanceSnapshot,
                (array) ($recalculated['balances'] ?? []),
                (array) ($recalculated['account_meta'] ?? [])
            );
            $pdo->commit();
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function createOpeningAdjustment(
        int $userId,
        int $accountId,
        float $delta,
        string $note = '',
        ?PDO $pdo = null,
        bool $recalculate = true
    ): ?array {
        $delta = round($delta, 2);
        if (abs($delta) < 0.01) {
            return null;
        }

        $db = $pdo ?? db();
        $ownsTransaction = $pdo === null;
        if ($ownsTransaction) {
            $db->beginTransaction();
        }

        try {
            self::assertAccount($accountId, $userId, $db);

            $id = self::insertTransaction($db, $userId, [
                'from_account_id' => null,
                'to_account_id' => $accountId,
                'category_id' => null,
                'amount' => $delta,
                'type' => 'opening_adjustment',
                'reference_type' => 'system',
                'reference_id' => null,
                'note' => $note !== '' ? $note : 'Opening balance adjustment',
                'transaction_date' => date('Y-m-d H:i:s'),
            ]);

            if ($recalculate) {
                BalanceRecalculationService::recalculate($userId, $db);
            }

            if ($ownsTransaction) {
                $db->commit();
            }

            return self::findById($id, $userId);
        } catch (Throwable $exception) {
            if ($ownsTransaction) {
                $db->rollBack();
            }
            throw $exception;
        }
    }

    public static function findById(int $id, int $userId): array
    {
        $stmt = db()->prepare(
            'SELECT
                t.id,
                t.user_id,
                t.from_account_id,
                t.to_account_id,
                t.category_id,
                t.amount,
                t.type,
                t.running_balance,
                t.reference_type,
                t.reference_id,
                t.note,
                t.location,
                t.receipt_path,
                t.transaction_date,
                t.created_at,
                t.updated_at,
                fa.name AS from_account_name,
                ta.name AS to_account_name,
                c.name AS category_name,
                c.type AS category_type
             FROM transactions t
             LEFT JOIN accounts fa
               ON fa.id = t.from_account_id
              AND fa.user_id = t.user_id
              AND fa.is_deleted = 0
             LEFT JOIN accounts ta
               ON ta.id = t.to_account_id
              AND ta.user_id = t.user_id
              AND ta.is_deleted = 0
             LEFT JOIN categories c
               ON c.id = t.category_id
              AND c.user_id = t.user_id
              AND c.is_deleted = 0
             WHERE t.id = :id
               AND t.user_id = :user_id
               AND t.is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([':id' => $id, ':user_id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Transaction not found.', 404);
        }
        return $row;
    }

    private static function normalizeInput(int $userId, array $input, ?array $fallback): array
    {
        $type = Validator::enum(
            $input['type'] ?? $fallback['type'] ?? '',
            ['income', 'expense', 'transfer'],
            'transaction type'
        );

        $amount = Validator::amount($input['amount'] ?? $fallback['amount'] ?? null);
        $fromAccountId = Validator::nullablePositiveInt($input['from_account_id'] ?? $fallback['from_account_id'] ?? null);
        $toAccountId = Validator::nullablePositiveInt($input['to_account_id'] ?? $fallback['to_account_id'] ?? null);
        $categoryId = Validator::nullablePositiveInt($input['category_id'] ?? $fallback['category_id'] ?? null);
        $referenceType = Validator::string($input['reference_type'] ?? $fallback['reference_type'] ?? 'manual', 60);
        $referenceId = Validator::nullablePositiveInt($input['reference_id'] ?? $fallback['reference_id'] ?? null);
        $note = Validator::string($input['note'] ?? $fallback['note'] ?? '', 255);
        $location = Validator::string($input['location'] ?? $fallback['location'] ?? '', 255);
        $receiptPath = Validator::string($input['receipt_path'] ?? $fallback['receipt_path'] ?? '', 255);
        $transactionDate = Validator::dateTime($input['transaction_date'] ?? $fallback['transaction_date'] ?? null) ?? date('Y-m-d H:i:s');

        if ($type === 'income') {
            if ($toAccountId === null) {
                Response::error('to_account_id is required for income.', 422);
            }
            if ($categoryId === null) {
                Response::error('category_id is required for income.', 422);
            }
            $fromAccountId = null;
            self::assertCategory($categoryId, $userId, 'income');
            self::assertAccount($toAccountId, $userId);
        } elseif ($type === 'expense') {
            if ($fromAccountId === null) {
                Response::error('from_account_id is required for expense.', 422);
            }
            if ($categoryId === null) {
                Response::error('category_id is required for expense.', 422);
            }
            $toAccountId = null;
            self::assertCategory($categoryId, $userId, 'expense');
            self::assertAccount($fromAccountId, $userId);
        } else {
            if ($fromAccountId === null || $toAccountId === null) {
                Response::error('from_account_id and to_account_id are required for transfer.', 422);
            }
            if ($fromAccountId === $toAccountId) {
                Response::error('Transfer accounts must be different.', 422);
            }
            $fromAccount = self::assertAccount($fromAccountId, $userId);
            $toAccount = self::assertAccount($toAccountId, $userId);

            if (self::isPeopleReferenceType($referenceType)) {
                $peopleAction = self::normalizePeopleAction($referenceType);
                self::assertPeopleRouting(
                    $peopleAction,
                    (string) ($fromAccount['type'] ?? ''),
                    (string) ($toAccount['type'] ?? '')
                );
                $referenceType = 'people_' . $peopleAction;
            }
            $categoryId = null;
        }

        return [
            'type' => $type,
            'amount' => $amount,
            'from_account_id' => $fromAccountId,
            'to_account_id' => $toAccountId,
            'category_id' => $categoryId,
            'reference_type' => $referenceType !== '' ? $referenceType : 'manual',
            'reference_id' => $referenceId,
            'note' => $note !== '' ? $note : null,
            'location' => $location !== '' ? $location : null,
            'receipt_path' => $receiptPath !== '' ? $receiptPath : null,
            'transaction_date' => $transactionDate,
        ];
    }

    private static function insertTransaction(PDO $pdo, int $userId, array $data): int
    {
        $insert = $pdo->prepare(
            'INSERT INTO transactions (
                user_id, from_account_id, to_account_id, category_id, amount, type, running_balance,
                reference_type, reference_id, note, location, receipt_path, transaction_date
            ) VALUES (
                :user_id, :from_account_id, :to_account_id, :category_id, :amount, :type, :running_balance,
                :reference_type, :reference_id, :note, :location, :receipt_path, :transaction_date
            )'
        );

        $insert->execute([
            ':user_id' => $userId,
            ':from_account_id' => $data['from_account_id'] ?? null,
            ':to_account_id' => $data['to_account_id'] ?? null,
            ':category_id' => $data['category_id'] ?? null,
            ':amount' => $data['amount'],
            ':type' => $data['type'],
            ':running_balance' => 0,
            ':reference_type' => $data['reference_type'] ?? 'manual',
            ':reference_id' => $data['reference_id'] ?? null,
            ':note' => $data['note'] ?? null,
            ':location' => $data['location'] ?? null,
            ':receipt_path' => $data['receipt_path'] ?? null,
            ':transaction_date' => $data['transaction_date'] ?? date('Y-m-d H:i:s'),
        ]);

        return (int) $pdo->lastInsertId();
    }

    private static function findRawById(int $id, int $userId, bool $forUpdate, PDO $pdo): ?array
    {
        $sql = 'SELECT id, user_id, from_account_id, to_account_id, category_id, amount, type, running_balance,
                       reference_type, reference_id, note, location, receipt_path, transaction_date, is_deleted
                FROM transactions
                WHERE id = :id
                  AND user_id = :user_id';
        if ($forUpdate) {
            $sql .= ' FOR UPDATE';
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute([':id' => $id, ':user_id' => $userId]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    private static function isSystemTransaction(array $transaction): bool
    {
        return (string) ($transaction['type'] ?? '') === 'opening_adjustment'
            || (string) ($transaction['reference_type'] ?? '') === 'system';
    }

    private static function snapshotAccountBalances(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare(
            'SELECT id, current_balance
             FROM accounts
             WHERE user_id = :user_id
               AND is_deleted = 0'
        );
        $stmt->execute([':user_id' => $userId]);

        $snapshot = [];
        foreach ($stmt->fetchAll() as $row) {
            $snapshot[(int) $row['id']] = round((float) ($row['current_balance'] ?? 0), 2);
        }

        return $snapshot;
    }

    private static function assertNonCreditFinalBalances(array $beforeBalances, array $afterBalances, array $accountMeta): void
    {
        foreach ($afterBalances as $accountId => $afterBalanceRaw) {
            $id = (int) $accountId;
            $meta = $accountMeta[$id] ?? [];
            if ((string) ($meta['type'] ?? '') === 'credit') {
                continue;
            }

            $beforeBalance = round((float) ($beforeBalances[$id] ?? 0), 2);
            $afterBalance = round((float) $afterBalanceRaw, 2);

            $wasNonNegative = $beforeBalance >= 0;
            $isNegativeNow = $afterBalance < 0;
            $worsenedNegative = $beforeBalance < 0 && $afterBalance < $beforeBalance;
            if (($wasNonNegative && $isNegativeNow) || $worsenedNegative) {
                $accountName = (string) ($meta['name'] ?? ('#' . $id));
                Response::error('Insufficient balance in account: ' . $accountName, 422);
            }
        }
    }

    private static function assertAccount(int $accountId, int $userId, ?PDO $pdo = null): array
    {
        $db = $pdo ?? db();
        $stmt = $db->prepare(
            'SELECT id, type
             FROM accounts
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([':id' => $accountId, ':user_id' => $userId]);
        $account = $stmt->fetch();
        if (!$account) {
            Response::error('Invalid account selected.', 422);
        }

        return $account;
    }

    private static function isPeopleReferenceType(string $referenceType): bool
    {
        return strpos(strtolower($referenceType), 'people') === 0;
    }

    private static function normalizePeopleAction(string $referenceType): string
    {
        $normalized = strtolower(trim($referenceType));
        if ($normalized === 'people') {
            return 'lend';
        }

        if (preg_match('/^people_(pay|receive|lend|borrow)$/', $normalized, $matches) === 1) {
            return (string) $matches[1];
        }

        Response::error('Invalid people transaction action.', 422);
    }

    private static function assertPeopleRouting(string $action, string $fromType, string $toType): void
    {
        $fromIsPeople = $fromType === 'people';
        $toIsPeople = $toType === 'people';

        if ($fromIsPeople === $toIsPeople) {
            Response::error('People transactions require one regular account and one people account.', 422);
        }

        if (in_array($action, ['pay', 'lend'], true)) {
            if ($fromIsPeople || !$toIsPeople) {
                Response::error('For lend/pay, from account must be regular and to account must be people.', 422);
            }
            return;
        }

        if (!$fromIsPeople || $toIsPeople) {
            Response::error('For receive/borrow, from account must be people and to account must be regular.', 422);
        }
    }

    private static function assertCategory(int $categoryId, int $userId, string $expectedType): void
    {
        $stmt = db()->prepare(
            'SELECT id, type
             FROM categories
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([':id' => $categoryId, ':user_id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Invalid category selected.', 422);
        }

        if ((string) $row['type'] !== $expectedType) {
            Response::error('Category type does not match transaction type.', 422);
        }
    }
}
