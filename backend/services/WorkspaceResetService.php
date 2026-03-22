<?php

declare(strict_types=1);

final class WorkspaceResetService
{
    public static function resetTransactionsToOpeningBalances(int $workspaceUserId): array
    {
        $pdo = db();
        $pdo->beginTransaction();

        $receiptPaths = [];
        $transactionCount = 0;
        $receiptReferenceCount = 0;
        $assetTransactionCount = 0;
        $accountsUpdated = 0;

        try {
            $transactionStmt = $pdo->prepare(
                'SELECT id, type, receipt_path
                 FROM transactions
                 WHERE user_id = :user_id
                   AND is_deleted = 0
                 FOR UPDATE'
            );
            $transactionStmt->execute([':user_id' => $workspaceUserId]);
            $transactions = $transactionStmt->fetchAll();
            $transactionCount = count($transactions);

            foreach ($transactions as $transaction) {
                if ((string) ($transaction['type'] ?? '') === 'asset') {
                    $assetTransactionCount++;
                }

                $receiptPath = self::normalizeReceiptPath((string) ($transaction['receipt_path'] ?? ''));
                if ($receiptPath === null) {
                    continue;
                }

                $receiptReferenceCount++;
                $receiptPaths[$receiptPath] = $receiptPath;
            }

            $accountStmt = $pdo->prepare(
                'SELECT id, current_balance
                 FROM accounts
                 WHERE user_id = :user_id
                   AND is_deleted = 0
                 FOR UPDATE'
            );
            $accountStmt->execute([':user_id' => $workspaceUserId]);
            $accounts = $accountStmt->fetchAll();
            $accountsUpdated = count($accounts);

            $updateAccountStmt = $pdo->prepare(
                'UPDATE accounts
                 SET initial_balance = :initial_balance
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );

            foreach ($accounts as $account) {
                $updateAccountStmt->execute([
                    ':initial_balance' => round((float) ($account['current_balance'] ?? 0), 2),
                    ':id' => (int) $account['id'],
                    ':user_id' => $workspaceUserId,
                ]);
            }

            $deleteTransactionsStmt = $pdo->prepare(
                'UPDATE transactions
                 SET is_deleted = 1
                 WHERE user_id = :user_id
                   AND is_deleted = 0'
            );
            $deleteTransactionsStmt->execute([':user_id' => $workspaceUserId]);

            BalanceRecalculationService::recalculate($workspaceUserId, $pdo, false);
            $pdo->commit();
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }

        $deletedReceiptCount = self::deleteReceiptFiles(array_values($receiptPaths));

        return [
            'transactions_deleted' => $transactionCount,
            'asset_transactions_deleted' => $assetTransactionCount,
            'receipt_references_cleared' => $receiptReferenceCount,
            'receipt_files_deleted' => $deletedReceiptCount,
            'accounts_rebased' => $accountsUpdated,
            'ledger_left_intact' => true,
        ];
    }

    private static function normalizeReceiptPath(string $receiptPath): ?string
    {
        $normalized = ltrim(str_replace('\\', '/', trim($receiptPath)), '/');
        if ($normalized === '' || str_contains($normalized, '..')) {
            return null;
        }
        if (strpos($normalized, 'uploads/receipts/') !== 0) {
            return null;
        }
        return $normalized;
    }

    private static function deleteReceiptFiles(array $receiptPaths): int
    {
        $deletedCount = 0;
        foreach ($receiptPaths as $receiptPath) {
            $absolutePath = dirname(__DIR__) . '/' . $receiptPath;
            if (!is_file($absolutePath)) {
                continue;
            }
            if (@unlink($absolutePath)) {
                $deletedCount++;
            }
        }

        return $deletedCount;
    }
}
