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
               AND is_active = 1'
        );
        $stmt->execute([':workspace_owner_user_id' => $workspaceOwnerId]);
        return (int) (($stmt->fetch()['total'] ?? 0));
    }

    public static function shouldShowTransactionAttribution(array $user, ?PDO $pdo = null): bool
    {
        return self::usersAccessModuleEnabledForWorkspace($user, $pdo)
            && self::activeWorkspaceUserCount($user, $pdo) > 1;
    }

    public static function listWorkspaceUsers(array $user, ?PDO $pdo = null): array
    {
        $pdo = $pdo ?? db();
        if (!self::shouldShowTransactionAttribution($user, $pdo)) {
            return [];
        }

        $workspaceOwnerId = AuthService::workspaceOwnerId($user);
        $stmt = $pdo->prepare(
            'SELECT id, name, role, is_active, created_at
             FROM users
             WHERE COALESCE(workspace_owner_user_id, id) = :workspace_owner_user_id
             ORDER BY is_active DESC, created_at ASC, id ASC'
        );
        $stmt->execute([':workspace_owner_user_id' => $workspaceOwnerId]);

        $rows = $stmt->fetchAll() ?: [];
        return array_map(
            static fn (array $row): array => [
                'id' => (int) ($row['id'] ?? 0),
                'name' => (string) ($row['name'] ?? ''),
                'role' => (string) ($row['role'] ?? 'user'),
                'is_active' => (bool) ($row['is_active'] ?? true),
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
}
