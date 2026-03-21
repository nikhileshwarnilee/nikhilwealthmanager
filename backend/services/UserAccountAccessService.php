<?php

declare(strict_types=1);

final class UserAccountAccessService
{
    public static function normalizeAccountIds($accountIds): array
    {
        if (!is_array($accountIds)) {
            return [];
        }

        $normalized = [];
        foreach ($accountIds as $value) {
            if (!is_numeric($value)) {
                continue;
            }

            $id = (int) $value;
            if ($id > 0) {
                $normalized[$id] = $id;
            }
        }

        return array_values($normalized);
    }

    public static function defaultAccountIdFromUser(array $user): ?int
    {
        $value = $user['default_account_id'] ?? null;
        if ($value === null || $value === '') {
            return null;
        }

        $id = (int) $value;
        return $id > 0 ? $id : null;
    }

    public static function allowedAccountIds(array $user): array
    {
        $normalized = self::normalizeAccountIds($user['allowed_account_ids'] ?? null);
        if ($normalized === []) {
            return [];
        }

        return self::filterValidAccountIds(AuthService::workspaceOwnerId($user), $normalized);
    }

    public static function allowedAccountIdsForUserId(int $userId, ?PDO $pdo = null): array
    {
        $pdo = $pdo ?? db();
        $stmt = $pdo->prepare(
            'SELECT allowed_account_ids_json
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            return [];
        }

        $normalized = self::normalizeAccountIds(self::decodeJsonArray($row['allowed_account_ids_json'] ?? null));
        if ($normalized === []) {
            return [];
        }

        return self::filterValidAccountIds(AuthService::workspaceOwnerIdForUserId($userId, $pdo), $normalized, $pdo);
    }

    public static function sanitizeAssignments(
        int $userId,
        $allowedAccountIds,
        $defaultAccountId,
        ?PDO $pdo = null
    ): array {
        $pdo = $pdo ?? db();
        $normalizedAllowed = self::normalizeAccountIds($allowedAccountIds);
        $defaultId = Validator::nullablePositiveInt($defaultAccountId);
        $workspaceOwnerId = AuthService::workspaceOwnerIdForUserId($userId, $pdo);

        if ($normalizedAllowed !== []) {
            $placeholders = [];
            $params = [':user_id' => $workspaceOwnerId];
            foreach ($normalizedAllowed as $index => $accountId) {
                $key = ':account_' . $index;
                $placeholders[] = $key;
                $params[$key] = $accountId;
            }

            $stmt = $pdo->prepare(
                'SELECT id
                 FROM accounts
                 WHERE user_id = :user_id
                   AND is_deleted = 0
                   AND id IN (' . implode(', ', $placeholders) . ')'
            );
            $stmt->execute($params);
            $existingIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));
            sort($existingIds);

            $expectedIds = $normalizedAllowed;
            sort($expectedIds);
            if ($existingIds !== $expectedIds) {
                Response::error('Some selected accounts are invalid for this user.', 422);
            }
        }

        if ($defaultId !== null) {
            $defaultStmt = $pdo->prepare(
                'SELECT id
                 FROM accounts
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0
                 LIMIT 1'
            );
            $defaultStmt->execute([
                ':id' => $defaultId,
                ':user_id' => $workspaceOwnerId,
            ]);
            if (!$defaultStmt->fetch()) {
                Response::error('Default account is invalid for this user.', 422);
            }

            if ($normalizedAllowed !== [] && !in_array($defaultId, $normalizedAllowed, true)) {
                Response::error('Default account must be inside the allowed account list.', 422);
            }
        }

        return [
            'allowed_account_ids' => $normalizedAllowed,
            'default_account_id' => $defaultId,
        ];
    }

    public static function buildAccountsFilterSql(string $columnName, array $accountIds, array &$params, string $prefix): string
    {
        $normalized = self::normalizeAccountIds($accountIds);
        if ($normalized === []) {
            return '';
        }

        $placeholders = [];
        foreach ($normalized as $index => $accountId) {
            $key = ':' . $prefix . '_' . $index;
            $placeholders[] = $key;
            $params[$key] = $accountId;
        }

        return ' AND ' . $columnName . ' IN (' . implode(', ', $placeholders) . ')';
    }

    public static function buildTransactionScopeSql(
        string $alias,
        array $accountIds,
        array &$params,
        string $prefix,
        bool $includeNoAccount = true
    ): string {
        $normalized = self::normalizeAccountIds($accountIds);
        if ($normalized === []) {
            return '';
        }

        $fromPlaceholders = [];
        $toPlaceholders = [];
        foreach ($normalized as $index => $accountId) {
            $fromKey = ':' . $prefix . '_from_' . $index;
            $toKey = ':' . $prefix . '_to_' . $index;
            $fromPlaceholders[] = $fromKey;
            $toPlaceholders[] = $toKey;
            $params[$fromKey] = $accountId;
            $params[$toKey] = $accountId;
        }

        $clauses = [
            $alias . '.from_account_id IN (' . implode(', ', $fromPlaceholders) . ')',
            $alias . '.to_account_id IN (' . implode(', ', $toPlaceholders) . ')',
        ];
        if ($includeNoAccount) {
            $clauses[] = '(' . $alias . '.from_account_id IS NULL AND ' . $alias . '.to_account_id IS NULL)';
        }

        return ' AND (' . implode(' OR ', $clauses) . ')';
    }

    public static function transactionRowAllowed(array $row, array $accountIds): bool
    {
        $normalized = self::normalizeAccountIds($accountIds);
        if ($normalized === []) {
            return true;
        }

        $fromId = isset($row['from_account_id']) ? (int) $row['from_account_id'] : 0;
        $toId = isset($row['to_account_id']) ? (int) $row['to_account_id'] : 0;

        if ($fromId <= 0 && $toId <= 0) {
            return true;
        }

        return in_array($fromId, $normalized, true) || in_array($toId, $normalized, true);
    }

    public static function assertAllowedAccount(int $accountId, array $allowedAccountIds): void
    {
        $normalized = self::normalizeAccountIds($allowedAccountIds);
        if ($normalized === []) {
            return;
        }

        if (!in_array($accountId, $normalized, true)) {
            Response::error('This user cannot use the selected account.', 403);
        }
    }

    private static function decodeJsonArray($raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private static function filterValidAccountIds(int $workspaceOwnerUserId, array $accountIds, ?PDO $pdo = null): array
    {
        $normalized = self::normalizeAccountIds($accountIds);
        if ($normalized === []) {
            return [];
        }

        $pdo = $pdo ?? db();
        $placeholders = [];
        $params = [':user_id' => $workspaceOwnerUserId];
        foreach ($normalized as $index => $accountId) {
            $key = ':account_' . $index;
            $placeholders[] = $key;
            $params[$key] = $accountId;
        }

        $stmt = $pdo->prepare(
            'SELECT id
             FROM accounts
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND id IN (' . implode(', ', $placeholders) . ')'
        );
        $stmt->execute($params);

        return array_map('intval', array_column($stmt->fetchAll(), 'id'));
    }
}
