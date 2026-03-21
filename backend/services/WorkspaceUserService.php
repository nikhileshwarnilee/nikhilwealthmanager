<?php

declare(strict_types=1);

final class WorkspaceUserService
{
    public static function usersAccessModuleEnabledForWorkspace(array $user, ?PDO $pdo = null): bool
    {
        $pdo = $pdo ?? db();
        $workspaceOwnerId = AuthService::workspaceOwnerId($user);
        return UserSettingsService::isModuleEnabled($workspaceOwnerId, 'users_access', $pdo);
    }

    public static function activeWorkspaceUserCount(array $user, ?PDO $pdo = null): int
    {
        $pdo = $pdo ?? db();
        $workspaceOwnerId = AuthService::workspaceOwnerId($user);
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM users
             WHERE COALESCE(workspace_owner_user_id, id) = :workspace_owner_user_id
               AND is_active = 1
               AND deleted_at IS NULL'
        );
        $stmt->execute([':workspace_owner_user_id' => $workspaceOwnerId]);
        return (int) (($stmt->fetch()['total'] ?? 0));
    }

    public static function shouldShowTransactionAttribution(array $user, ?PDO $pdo = null): bool
    {
        if (!self::usersAccessModuleEnabledForWorkspace($user, $pdo)) {
            return false;
        }

        return max(
            self::activeWorkspaceUserCount($user, $pdo),
            self::workspaceContributorCount($user, $pdo)
        ) > 1;
    }

    public static function listWorkspaceUsers(array $user, ?PDO $pdo = null): array
    {
        $pdo = $pdo ?? db();
        if (!self::shouldShowTransactionAttribution($user, $pdo)) {
            return [];
        }

        $workspaceOwnerId = AuthService::workspaceOwnerId($user);
        $stmt = $pdo->prepare(
            'SELECT
                u.id,
                u.name,
                u.role,
                u.is_active,
                u.deleted_at,
                u.created_at,
                EXISTS(
                    SELECT 1
                        FROM transactions t
                    WHERE t.user_id = :workspace_owner_user_id_history
                      AND t.is_deleted = 0
                      AND t.created_by_user_id = u.id
                    LIMIT 1
                ) AS has_transactions
             FROM users u
             WHERE COALESCE(u.workspace_owner_user_id, u.id) = :workspace_owner_user_id
               AND (
                    u.deleted_at IS NULL
                    OR EXISTS(
                        SELECT 1
                        FROM transactions tx
                        WHERE tx.user_id = :workspace_owner_user_id_deleted
                          AND tx.is_deleted = 0
                          AND tx.created_by_user_id = u.id
                        LIMIT 1
                    )
               )
             ORDER BY
                CASE
                    WHEN u.deleted_at IS NULL AND u.is_active = 1 THEN 0
                    WHEN u.deleted_at IS NULL THEN 1
                    ELSE 2
                END ASC,
                u.created_at ASC,
                u.id ASC'
        );
        $stmt->execute([
            ':workspace_owner_user_id' => $workspaceOwnerId,
            ':workspace_owner_user_id_history' => $workspaceOwnerId,
            ':workspace_owner_user_id_deleted' => $workspaceOwnerId,
        ]);

        $rows = $stmt->fetchAll() ?: [];
        return array_map(
            static fn (array $row): array => [
                'id' => (int) ($row['id'] ?? 0),
                'name' => (string) ($row['name'] ?? ''),
                'role' => (string) ($row['role'] ?? 'user'),
                'is_active' => (bool) ($row['is_active'] ?? true) && empty($row['deleted_at']),
                'is_deleted' => !empty($row['deleted_at']),
                'has_transactions' => (bool) ($row['has_transactions'] ?? false),
                'created_at' => $row['created_at'] ?? null,
            ],
            $rows
        );
    }

    public static function resolveTransactionCreatorFilter(array $user, mixed $rawValue, string $fieldName = 'created_by_user_id', ?PDO $pdo = null): ?int
    {
        $raw = trim((string) ($rawValue ?? ''));
        if ($raw === '') {
            return null;
        }

        if (!self::shouldShowTransactionAttribution($user, $pdo)) {
            return null;
        }

        $candidate = Validator::positiveInt($raw, $fieldName);
        $pdo = $pdo ?? db();
        $workspaceOwnerId = AuthService::workspaceOwnerId($user);
        $stmt = $pdo->prepare(
            'SELECT id
             FROM users
             WHERE id = :id
               AND COALESCE(workspace_owner_user_id, id) = :workspace_owner_user_id
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $candidate,
            ':workspace_owner_user_id' => $workspaceOwnerId,
        ]);

        if (!$stmt->fetch()) {
            Response::error('Invalid user filter selected.', 422);
        }

        return $candidate;
    }

    public static function workspaceContributorCount(array $user, ?PDO $pdo = null): int
    {
        $pdo = $pdo ?? db();
        $workspaceOwnerId = AuthService::workspaceOwnerId($user);
        $stmt = $pdo->prepare(
            'SELECT COUNT(DISTINCT created_by_user_id) AS total
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND created_by_user_id IS NOT NULL'
        );
        $stmt->execute([':user_id' => $workspaceOwnerId]);
        return (int) (($stmt->fetch()['total'] ?? 0));
    }
}
