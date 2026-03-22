<?php

declare(strict_types=1);

final class TransactionService
{
    public static function create(int $userId, array $input, ?int $actorUserId = null): array
    {
        $data = self::normalizeInput($userId, $input, null, $actorUserId);
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $id = self::insertTransaction($pdo, $userId, $data, $actorUserId);
            if (($data['ledger_entry_id'] ?? null) !== null) {
                LedgerService::markConverted($userId, (int) $data['ledger_entry_id'], $id, $pdo);
            }
            AssetService::applyTransactionDelta($pdo, $userId, null, $data);
            BalanceRecalculationService::recalculate($userId, $pdo, false);
            $pdo->commit();

            return self::findById($id, $userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function update(int $userId, int $transactionId, array $input, ?array $actorUser = null): array
    {
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $existing = self::findRawById($transactionId, $userId, true, $pdo);
            if (!$existing || (int) ($existing['is_deleted'] ?? 0) === 1) {
                Response::error('Transaction not found.', 404);
            }
            $actorUserId = (int) ($actorUser['id'] ?? 0);
            if (!self::rowAllowedForActor($existing, $actorUserId > 0 ? $actorUserId : null, $pdo)) {
                Response::error('Transaction not found.', 404);
            }
            if (self::isSystemTransaction($existing)) {
                Response::error('System transactions cannot be edited.', 422);
            }
            if (!self::actorHasMutationScope($existing, $actorUser, 'edit', $pdo)) {
                Response::error('You do not have permission to edit this transaction.', 403);
            }

            $next = self::normalizeInput($userId, $input, $existing, $actorUserId);

            $stmt = $pdo->prepare(
                'UPDATE transactions
                 SET from_account_id = :from_account_id,
                     to_account_id = :to_account_id,
                     from_asset_type_id = :from_asset_type_id,
                     to_asset_type_id = :to_asset_type_id,
                     category_id = :category_id,
                     business_id = :business_id,
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
                ':from_asset_type_id' => $next['from_asset_type_id'],
                ':to_asset_type_id' => $next['to_asset_type_id'],
                ':category_id' => $next['category_id'],
                ':business_id' => $next['business_id'],
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

            AssetService::applyTransactionDelta($pdo, $userId, $existing, $next);
            BalanceRecalculationService::recalculate($userId, $pdo, false);
            $pdo->commit();

            return self::findById($transactionId, $userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function delete(int $userId, int $transactionId, ?array $actorUser = null): void
    {
        $pdo = db();
        $pdo->beginTransaction();

        try {
            $existing = self::findRawById($transactionId, $userId, true, $pdo);
            if (!$existing || (int) ($existing['is_deleted'] ?? 0) === 1) {
                Response::error('Transaction not found.', 404);
            }
            $actorUserId = (int) ($actorUser['id'] ?? 0);
            if (!self::rowAllowedForActor($existing, $actorUserId > 0 ? $actorUserId : null, $pdo)) {
                Response::error('Transaction not found.', 404);
            }
            if (self::isSystemTransaction($existing)) {
                Response::error('System transactions cannot be deleted.', 422);
            }
            if (!self::actorHasMutationScope($existing, $actorUser, 'delete', $pdo)) {
                Response::error('You do not have permission to delete this transaction.', 403);
            }

            $stmt = $pdo->prepare(
                'UPDATE transactions
                 SET is_deleted = 1
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );
            $stmt->execute([':id' => $transactionId, ':user_id' => $userId]);

            AssetService::applyTransactionDelta($pdo, $userId, $existing, null);
            BalanceRecalculationService::recalculate($userId, $pdo, false);
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
            ], null);

            if ($recalculate) {
                BalanceRecalculationService::recalculate($userId, $db, false);
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
                t.created_by_user_id,
                t.from_account_id,
                t.to_account_id,
                t.from_asset_type_id,
                t.to_asset_type_id,
                t.category_id,
                t.business_id,
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
                creator.name AS created_by_name,
                fa.name AS from_account_name,
                ta.name AS to_account_name,
                fasset.name AS from_asset_type_name,
                fasset.icon AS from_asset_type_icon,
                tasset.name AS to_asset_type_name,
                tasset.icon AS to_asset_type_icon,
                c.name AS category_name,
                c.type AS category_type,
                b.name AS business_name
             FROM transactions t
             LEFT JOIN accounts fa
               ON fa.id = t.from_account_id
              AND fa.user_id = t.user_id
              AND fa.is_deleted = 0
             LEFT JOIN accounts ta
               ON ta.id = t.to_account_id
              AND ta.user_id = t.user_id
              AND ta.is_deleted = 0
             LEFT JOIN asset_types fasset
               ON fasset.id = t.from_asset_type_id
              AND fasset.user_id = t.user_id
              AND fasset.is_deleted = 0
             LEFT JOIN asset_types tasset
               ON tasset.id = t.to_asset_type_id
              AND tasset.user_id = t.user_id
              AND tasset.is_deleted = 0
             LEFT JOIN categories c
               ON c.id = t.category_id
              AND c.user_id = t.user_id
              AND c.is_deleted = 0
             LEFT JOIN businesses b
               ON b.id = t.business_id
              AND b.user_id = t.user_id
              AND b.is_deleted = 0
             LEFT JOIN users creator
               ON creator.id = t.created_by_user_id
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

    public static function mutationAccessSummary(array $transaction, ?array $actorUser, ?PDO $pdo = null): array
    {
        $actorUserId = (int) ($actorUser['id'] ?? 0);
        $rowAllowed = self::rowAllowedForActor(
            $transaction,
            $actorUserId > 0 ? $actorUserId : null,
            $pdo
        );
        $systemTransaction = self::isSystemTransaction($transaction);

        return [
            'can_edit' => $rowAllowed && !$systemTransaction && self::actorHasMutationScope($transaction, $actorUser, 'edit', $pdo),
            'can_delete' => $rowAllowed && !$systemTransaction && self::actorHasMutationScope($transaction, $actorUser, 'delete', $pdo),
        ];
    }

    private static function normalizeInput(int $userId, array $input, ?array $fallback, ?int $actorUserId = null): array
    {
        $type = Validator::enum(
            $input['type'] ?? $fallback['type'] ?? '',
            ['income', 'expense', 'transfer', 'asset'],
            'transaction type'
        );

        $amount = Validator::amount($input['amount'] ?? $fallback['amount'] ?? null);
        $fromAccountId = Validator::nullablePositiveInt($input['from_account_id'] ?? $fallback['from_account_id'] ?? null);
        $toAccountId = Validator::nullablePositiveInt($input['to_account_id'] ?? $fallback['to_account_id'] ?? null);
        $fromAssetTypeId = Validator::nullablePositiveInt($input['from_asset_type_id'] ?? $fallback['from_asset_type_id'] ?? null);
        $toAssetTypeId = Validator::nullablePositiveInt($input['to_asset_type_id'] ?? $fallback['to_asset_type_id'] ?? null);
        $categoryId = Validator::nullablePositiveInt($input['category_id'] ?? $fallback['category_id'] ?? null);
        $businessId = Validator::nullablePositiveInt($input['business_id'] ?? $fallback['business_id'] ?? null);
        $businessesEnabled = UserSettingsService::isModuleEnabled($userId, 'businesses');
        $assetsEnabled = UserSettingsService::isModuleEnabled($userId, 'assets');
        $ledgerEntryId = Validator::nullablePositiveInt($input['ledger_entry_id'] ?? null);
        $referenceType = Validator::string($input['reference_type'] ?? $fallback['reference_type'] ?? 'manual', 60);
        $referenceId = Validator::nullablePositiveInt($input['reference_id'] ?? $fallback['reference_id'] ?? null);
        $note = Validator::string($input['note'] ?? $fallback['note'] ?? '', 255);
        $location = Validator::string($input['location'] ?? $fallback['location'] ?? '', 255);
        $receiptPath = Validator::string($input['receipt_path'] ?? $fallback['receipt_path'] ?? '', 255);
        $transactionDate = Validator::dateTime($input['transaction_date'] ?? $fallback['transaction_date'] ?? null) ?? date('Y-m-d H:i:s');

        if (!$businessesEnabled) {
            $businessId = null;
        }
        if ($ledgerEntryId !== null && $fallback !== null) {
            Response::error('Ledger conversion is only available when creating a transaction.', 422);
        }

        if ($type === 'income') {
            if ($toAccountId === null) {
                Response::error('to_account_id is required for income.', 422);
            }
            if ($categoryId === null) {
                Response::error('category_id is required for income.', 422);
            }
            $fromAccountId = null;
            $fromAssetTypeId = null;
            $toAssetTypeId = null;
            self::assertCategory($categoryId, $userId, 'income');
            self::assertAccount($toAccountId, $userId, null, $actorUserId);
            if ($businessId !== null) {
                self::assertBusiness($businessId, $userId);
            }
        } elseif ($type === 'expense') {
            if ($fromAccountId === null) {
                Response::error('from_account_id is required for expense.', 422);
            }
            if ($categoryId === null) {
                Response::error('category_id is required for expense.', 422);
            }
            $toAccountId = null;
            $fromAssetTypeId = null;
            $toAssetTypeId = null;
            self::assertCategory($categoryId, $userId, 'expense');
            self::assertAccount($fromAccountId, $userId, null, $actorUserId);
            if ($businessId !== null) {
                self::assertBusiness($businessId, $userId);
            }
        } elseif ($type === 'transfer') {
            if ($fromAccountId === null || $toAccountId === null) {
                Response::error('from_account_id and to_account_id are required for transfer.', 422);
            }
            if ($fromAccountId === $toAccountId) {
                Response::error('Transfer accounts must be different.', 422);
            }
            $fromAccount = self::assertAccount($fromAccountId, $userId, null, $actorUserId);
            $toAccount = self::assertAccount($toAccountId, $userId, null, $actorUserId);

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
            $businessId = null;
            $fromAssetTypeId = null;
            $toAssetTypeId = null;
        } else {
            if (!$assetsEnabled) {
                Response::error('Assets / Wealth module is disabled.', 403);
            }
            $isAccountToAsset = $fromAccountId !== null
                && $toAssetTypeId !== null
                && $toAccountId === null
                && $fromAssetTypeId === null;
            $isAssetToAccount = $fromAssetTypeId !== null
                && $toAccountId !== null
                && $fromAccountId === null
                && $toAssetTypeId === null;
            $isDirectAssetCredit = $fromAccountId === null
                && $toAccountId === null
                && $fromAssetTypeId === null
                && $toAssetTypeId !== null;

            if (!$isAccountToAsset && !$isAssetToAccount && !$isDirectAssetCredit) {
                Response::error(
                    'Asset transaction must be Account -> Asset Type, Asset Type -> Account, or Direct Asset Entry.',
                    422
                );
            }

            if ($isAccountToAsset) {
                $fromAccount = self::assertAccount($fromAccountId, $userId, null, $actorUserId);
                if ((string) ($fromAccount['type'] ?? '') === 'people') {
                    Response::error('People accounts cannot be used for asset investments.', 422);
                }
                self::assertAssetType($toAssetTypeId, $userId);
                $referenceType = $referenceType !== '' ? $referenceType : 'asset_investment';
                $referenceId = $referenceId ?? $toAssetTypeId;
            } elseif ($isAssetToAccount) {
                $toAccount = self::assertAccount($toAccountId, $userId, null, $actorUserId);
                if ((string) ($toAccount['type'] ?? '') === 'people') {
                    Response::error('People accounts cannot be used for asset liquidation.', 422);
                }
                self::assertAssetType($fromAssetTypeId, $userId);
                $referenceType = $referenceType !== '' ? $referenceType : 'asset_liquidation';
                $referenceId = $referenceId ?? $fromAssetTypeId;
            } else {
                self::assertAssetType($toAssetTypeId, $userId);
                $referenceType = $referenceType !== '' ? $referenceType : 'asset_opening';
                $referenceId = $referenceId ?? $toAssetTypeId;
            }

            $categoryId = null;
            $businessId = null;
        }

        if ($ledgerEntryId !== null) {
            if (!UserSettingsService::isModuleEnabled($userId, 'ledger')) {
                Response::error('Ledger module is disabled.', 403);
            }
            if (!in_array($type, ['income', 'expense'], true)) {
                Response::error('Ledger entries can only be converted to income or expense transactions.', 422);
            }

            $ledgerEntry = LedgerService::assertOpenEntry($ledgerEntryId, $userId);
            $expectedType = (string) ($ledgerEntry['direction'] ?? '') === 'receivable' ? 'income' : 'expense';
            if ($type !== $expectedType) {
                Response::error('Ledger entry direction does not match transaction type.', 422);
            }

            $amount = round((float) ($ledgerEntry['amount'] ?? $amount), 2);
            if (!empty($ledgerEntry['attachment_path'])) {
                $receiptPath = (string) $ledgerEntry['attachment_path'];
            }
            $note = LedgerService::buildTransactionNote(
                $ledgerEntry,
                $note !== '' ? $note : (string) ($ledgerEntry['note'] ?? '')
            );
            $referenceType = 'ledger_conversion';
            $referenceId = $ledgerEntryId;
        }

        return [
            'type' => $type,
            'amount' => $amount,
            'from_account_id' => $fromAccountId,
            'to_account_id' => $toAccountId,
            'from_asset_type_id' => $fromAssetTypeId,
            'to_asset_type_id' => $toAssetTypeId,
            'category_id' => $categoryId,
            'business_id' => $businessId,
            'reference_type' => $referenceType !== '' ? $referenceType : 'manual',
            'reference_id' => $referenceId,
            'note' => $note !== '' ? $note : null,
            'location' => $location !== '' ? $location : null,
            'receipt_path' => $receiptPath !== '' ? $receiptPath : null,
            'transaction_date' => $transactionDate,
            'ledger_entry_id' => $ledgerEntryId,
        ];
    }

    private static function insertTransaction(PDO $pdo, int $userId, array $data, ?int $actorUserId = null): int
    {
        $insert = $pdo->prepare(
            'INSERT INTO transactions (
                user_id, created_by_user_id, from_account_id, to_account_id, from_asset_type_id, to_asset_type_id,
                category_id, business_id, amount, type, running_balance,
                reference_type, reference_id, note, location, receipt_path, transaction_date
            ) VALUES (
                :user_id, :created_by_user_id, :from_account_id, :to_account_id, :from_asset_type_id, :to_asset_type_id,
                :category_id, :business_id, :amount, :type, :running_balance,
                :reference_type, :reference_id, :note, :location, :receipt_path, :transaction_date
            )'
        );

        $insert->execute([
            ':user_id' => $userId,
            ':created_by_user_id' => $actorUserId && $actorUserId > 0 ? $actorUserId : $userId,
            ':from_account_id' => $data['from_account_id'] ?? null,
            ':to_account_id' => $data['to_account_id'] ?? null,
            ':from_asset_type_id' => $data['from_asset_type_id'] ?? null,
            ':to_asset_type_id' => $data['to_asset_type_id'] ?? null,
            ':category_id' => $data['category_id'] ?? null,
            ':business_id' => $data['business_id'] ?? null,
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
        $sql = 'SELECT id, user_id, created_by_user_id, from_account_id, to_account_id, from_asset_type_id, to_asset_type_id,
                       category_id, business_id, amount, type, running_balance,
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

    private static function assertAccount(int $accountId, int $userId, ?PDO $pdo = null, ?int $actorUserId = null): array
    {
        $db = $pdo ?? db();
        UserAccountAccessService::assertAllowedAccount(
            $accountId,
            UserAccountAccessService::allowedAccountIdsForUserId($actorUserId ?? $userId, $db)
        );
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

    private static function rowAllowedForActor(array $transaction, ?int $actorUserId, ?PDO $pdo = null): bool
    {
        if ($actorUserId === null || $actorUserId <= 0) {
            return true;
        }

        $allowedAccountIds = UserAccountAccessService::allowedAccountIdsForUserId($actorUserId, $pdo ?? db());
        return UserAccountAccessService::transactionRowAllowed($transaction, $allowedAccountIds);
    }

    private static function actorHasMutationScope(
        array $transaction,
        ?array $actorUser,
        string $action,
        ?PDO $pdo = null
    ): bool {
        if ($actorUser === null) {
            return true;
        }

        $actorUserId = (int) ($actorUser['id'] ?? 0);
        if ($actorUserId <= 0) {
            return true;
        }

        if (!self::rowAllowedForActor($transaction, $actorUserId, $pdo)) {
            return false;
        }

        $scope = PermissionService::transactionMutationScope($actorUser, $action);
        if ($scope === 'any') {
            return true;
        }
        if ($scope === 'none') {
            return false;
        }

        return $actorUserId === (int) ($transaction['created_by_user_id'] ?? 0);
    }

    private static function assertAssetType(int $assetTypeId, int $userId): array
    {
        return AssetService::assertAssetType($assetTypeId, $userId);
    }

    private static function assertBusiness(int $businessId, int $userId): array
    {
        return BusinessService::assertBusiness($businessId, $userId);
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
