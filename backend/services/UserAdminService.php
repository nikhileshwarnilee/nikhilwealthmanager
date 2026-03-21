<?php

declare(strict_types=1);

final class UserAdminService
{
    public static function listUsers(array $actorUser): array
    {
        $workspaceOwnerId = AuthService::workspaceOwnerId($actorUser);
        $stmt = db()->prepare(
            'SELECT id, name, email, role, permissions_json, is_active, allowed_account_ids_json, default_account_id, workspace_owner_user_id, transaction_access_json, created_at, updated_at
             FROM users
             WHERE COALESCE(workspace_owner_user_id, id) = :workspace_owner_user_id
             ORDER BY created_at ASC, id ASC'
        );
        $stmt->execute([':workspace_owner_user_id' => $workspaceOwnerId]);

        return array_map(
            static fn (array $row): array => AuthService::hydrateUserRow($row),
            $stmt->fetchAll() ?: []
        );
    }

    public static function createUser(array $actorUser, array $input): array
    {
        $name = Validator::string($input['name'] ?? '', 120);
        if ($name === '') {
            Response::error('Name is required.', 422);
        }

        $email = Validator::email($input['email'] ?? '');
        $password = Validator::password($input['password'] ?? '');
        $role = PermissionService::normalizeRole((string) ($input['role'] ?? 'user'));
        $permissions = PermissionService::normalizeFeaturePermissions($input['permissions'] ?? null);
        $transactionAccess = PermissionService::normalizeTransactionMutationScopes($input['transaction_access'] ?? null);
        $isActive = (bool) ($input['is_active'] ?? true);

        $createdUser = AuthService::createManagedUser(
            $name,
            $email,
            $password,
            $role,
            $permissions,
            $isActive,
            AuthService::workspaceOwnerId($actorUser),
            $transactionAccess
        );

        if ($role === 'super_admin') {
            return $createdUser;
        }

        $accountAccess = UserAccountAccessService::sanitizeAssignments(
            (int) $createdUser['id'],
            $input['allowed_account_ids'] ?? [],
            $input['default_account_id'] ?? ($createdUser['default_account_id'] ?? null),
            db()
        );

        $stmt = db()->prepare(
            'UPDATE users
             SET allowed_account_ids_json = :allowed_account_ids_json,
                 default_account_id = :default_account_id
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([
            ':allowed_account_ids_json' => json_encode($accountAccess['allowed_account_ids']),
            ':default_account_id' => $accountAccess['default_account_id'],
            ':id' => (int) $createdUser['id'],
        ]);

        return AuthService::findUserById((int) $createdUser['id']);
    }

    public static function updateUser(int $targetUserId, array $actorUser, array $input): array
    {
        $current = AuthService::findUserById($targetUserId);
        if (!$current) {
            Response::error('User not found.', 404);
        }

        if (AuthService::workspaceOwnerId($current) !== AuthService::workspaceOwnerId($actorUser)) {
            Response::error('User not found.', 404);
        }

        $name = array_key_exists('name', $input)
            ? Validator::string($input['name'] ?? '', 120)
            : (string) $current['name'];
        if ($name === '') {
            Response::error('Name is required.', 422);
        }

        $email = array_key_exists('email', $input)
            ? Validator::email($input['email'] ?? '')
            : (string) $current['email'];
        $role = array_key_exists('role', $input)
            ? PermissionService::normalizeRole((string) $input['role'])
            : (string) $current['role'];
        $permissions = array_key_exists('permissions', $input)
            ? PermissionService::normalizeFeaturePermissions($input['permissions'])
            : PermissionService::normalizeFeaturePermissions($current['permissions'] ?? null);
        $transactionAccess = array_key_exists('transaction_access', $input)
            ? PermissionService::normalizeTransactionMutationScopes($input['transaction_access'])
            : PermissionService::normalizeTransactionMutationScopes($current['transaction_access'] ?? null);
        $isActive = array_key_exists('is_active', $input)
            ? (bool) $input['is_active']
            : (bool) ($current['is_active'] ?? true);
        $accountAccess = UserAccountAccessService::sanitizeAssignments(
            $targetUserId,
            $input['allowed_account_ids'] ?? ($current['allowed_account_ids'] ?? []),
            array_key_exists('default_account_id', $input)
                ? $input['default_account_id']
                : ($current['default_account_id'] ?? null),
            db()
        );
        $newPassword = Validator::string($input['password'] ?? '', 255);

        if ((int) $actorUser['id'] === $targetUserId && !$isActive) {
            Response::error('You cannot deactivate your own account.', 422);
        }

        if (
            PermissionService::isSuperAdmin($current)
            && (!$isActive || $role !== 'super_admin')
            && !self::hasAnotherActiveSuperAdmin($targetUserId)
        ) {
            Response::error('At least one active super admin is required.', 422);
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            AuthService::assertEmailAvailable($email, $targetUserId, $pdo);

            $stmt = $pdo->prepare(
                'UPDATE users
                 SET name = :name,
                     email = :email,
                     role = :role,
                     permissions_json = :permissions_json,
                     transaction_access_json = :transaction_access_json,
                     is_active = :is_active,
                     allowed_account_ids_json = :allowed_account_ids_json,
                     default_account_id = :default_account_id
                 WHERE id = :id
                 LIMIT 1'
            );
            $stmt->execute([
                ':name' => $name,
                ':email' => $email,
                ':role' => $role,
                ':permissions_json' => json_encode(
                    $role === 'super_admin' ? PermissionService::allFeaturePermissions() : $permissions
                ),
                ':transaction_access_json' => json_encode(
                    $role === 'super_admin'
                        ? PermissionService::allTransactionMutationScopes()
                        : $transactionAccess
                ),
                ':is_active' => $isActive ? 1 : 0,
                ':allowed_account_ids_json' => $role === 'super_admin'
                    ? null
                    : json_encode($accountAccess['allowed_account_ids']),
                ':default_account_id' => $role === 'super_admin'
                    ? null
                    : $accountAccess['default_account_id'],
                ':id' => $targetUserId,
            ]);

            if ($newPassword !== '') {
                AuthService::setPasswordDirect($targetUserId, $newPassword);
            }

            $pdo->commit();
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }

        if (!$isActive || $newPassword !== '') {
            TokenService::revokeAllForUser($targetUserId);
        }

        return AuthService::findUserById($targetUserId);
    }

    private static function hasAnotherActiveSuperAdmin(int $excludedUserId): bool
    {
        $stmt = db()->prepare(
            'SELECT id
             FROM users
             WHERE role = :role
               AND is_active = 1
               AND id <> :id
             LIMIT 1'
        );
        $stmt->execute([
            ':role' => 'super_admin',
            ':id' => $excludedUserId,
        ]);

        return (bool) $stmt->fetch();
    }
}
