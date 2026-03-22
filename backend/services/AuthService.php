<?php

declare(strict_types=1);

final class AuthService
{
    public static function register(string $name, string $email, string $password): array
    {
        if (self::userCount() > 0) {
            Response::error('Self-registration is disabled. Contact your super admin.', 403);
        }

        return self::createManagedUser(
            $name,
            $email,
            $password,
            'super_admin',
            PermissionService::allFeaturePermissions(),
            true,
            null,
            PermissionService::allTransactionMutationScopes()
        );
    }

    public static function createManagedUser(
        string $name,
        string $email,
        string $password,
        string $role = 'user',
        ?array $permissions = null,
        bool $isActive = true,
        ?int $workspaceOwnerUserId = null,
        ?array $transactionAccess = null
    ): array {
        $name = Validator::string($name, 120);
        if ($name === '') {
            Response::error('Name is required.', 422);
        }

        $email = Validator::email($email);
        $password = Validator::password($password);
        $role = PermissionService::normalizeRole($role);
        $permissions = PermissionService::normalizeFeaturePermissions($permissions);
        $transactionAccess = PermissionService::normalizeTransactionMutationScopes($transactionAccess);

        $pdo = db();
        self::assertEmailAvailable($email, null, $pdo);

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO users (
                    name,
                    email,
                    role,
                    permissions_json,
                    is_active,
                    workspace_owner_user_id,
                    transaction_access_json,
                    password_hash
                 ) VALUES (
                    :name,
                    :email,
                    :role,
                    :permissions_json,
                    :is_active,
                    :workspace_owner_user_id,
                    :transaction_access_json,
                    :password_hash
                 )'
            );
            $workspaceOwnerId = $workspaceOwnerUserId !== null && $workspaceOwnerUserId > 0
                ? $workspaceOwnerUserId
                : null;
            $stmt->execute([
                ':name' => $name,
                ':email' => $email,
                ':role' => $role,
                ':permissions_json' => json_encode(
                    $role === 'super_admin' ? PermissionService::allFeaturePermissions() : $permissions
                ),
                ':is_active' => $isActive ? 1 : 0,
                ':workspace_owner_user_id' => $workspaceOwnerId,
                ':transaction_access_json' => json_encode(
                    $role === 'super_admin'
                        ? PermissionService::allTransactionMutationScopes()
                        : $transactionAccess
                ),
                ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);

            $userId = (int) $pdo->lastInsertId();
            $workspaceOwnerId = $workspaceOwnerId ?: $userId;

            if ($workspaceOwnerId !== $userId) {
                $workspaceStmt = $pdo->prepare(
                    'UPDATE users
                     SET workspace_owner_user_id = :workspace_owner_user_id
                     WHERE id = :id
                     LIMIT 1'
                );
                $workspaceStmt->execute([
                    ':workspace_owner_user_id' => $workspaceOwnerId,
                    ':id' => $userId,
                ]);
            }

            UserSettingsService::get($userId, $pdo);

            $defaultAccountId = null;
            if ($workspaceOwnerId === $userId) {
                $accountStmt = $pdo->prepare(
                    'INSERT INTO accounts (user_id, name, type, initial_balance, current_balance, currency)
                     VALUES (:user_id, :name, :type, :initial_balance, :current_balance, :currency)'
                );
                $accountStmt->execute([
                    ':user_id' => $userId,
                    ':name' => 'Cash Wallet',
                    ':type' => 'cash',
                    ':initial_balance' => 0,
                    ':current_balance' => 0,
                    ':currency' => 'INR',
                ]);
                $defaultAccountId = (int) $pdo->lastInsertId();
            } else {
                $defaultAccountId = self::firstWorkspaceAccountId($workspaceOwnerId, $pdo);
            }

            $userAccessStmt = $pdo->prepare(
                'UPDATE users
                 SET default_account_id = :default_account_id
                 WHERE id = :id
                 LIMIT 1'
            );
            $userAccessStmt->execute([
                ':default_account_id' => $defaultAccountId,
                ':id' => $userId,
            ]);

            if ($workspaceOwnerId === $userId) {
                CategoryService::seedDefaultCategories($userId);
            }
            $pdo->commit();

            return self::findUserById($userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function login(string $email, string $password): array
    {
        $stmt = db()->prepare(
            'SELECT id, name, email, role, permissions_json, is_active, deleted_at, allowed_account_ids_json, default_account_id, workspace_owner_user_id, transaction_access_json, password_hash, created_at, updated_at
             FROM users
             WHERE email = :email
               AND deleted_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, (string) $user['password_hash'])) {
            Response::error('Invalid credentials.', 401);
        }

        $hydrated = self::hydrateUserRow($user);
        if (!(bool) ($hydrated['is_active'] ?? true)) {
            Response::error('This account is inactive. Contact your super admin.', 403);
        }

        return $hydrated;
    }

    public static function findUserById(int $id): array
    {
        $stmt = db()->prepare(
            'SELECT id, name, email, role, permissions_json, is_active, deleted_at, allowed_account_ids_json, default_account_id, workspace_owner_user_id, transaction_access_json, created_at, updated_at
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        if (!$user) {
            Response::error('User not found.', 404);
        }
        return self::hydrateUserRow($user);
    }

    public static function hydrateUserRow(array $row): array
    {
        $role = PermissionService::normalizeRole((string) ($row['role'] ?? 'user'));
        $permissions = PermissionService::normalizeFeaturePermissions(self::decodeJsonObject($row['permissions_json'] ?? null));
        $transactionAccess = PermissionService::normalizeTransactionMutationScopes(
            self::decodeJsonObject($row['transaction_access_json'] ?? null)
        );
        $workspaceOwnerId = self::workspaceOwnerIdFromRow($row);

        return [
            'id' => (int) ($row['id'] ?? 0),
            'name' => (string) ($row['name'] ?? ''),
            'email' => (string) ($row['email'] ?? ''),
            'role' => $role,
            'permissions' => $role === 'super_admin' ? PermissionService::allFeaturePermissions() : $permissions,
            'transaction_access' => $role === 'super_admin'
                ? PermissionService::allTransactionMutationScopes()
                : $transactionAccess,
            'is_active' => (bool) ($row['is_active'] ?? true),
            'deleted_at' => $row['deleted_at'] ?? null,
            'is_deleted' => !empty($row['deleted_at']),
            'workspace_owner_user_id' => $workspaceOwnerId,
            'workspace_user_id' => $workspaceOwnerId,
            'allowed_account_ids' => UserAccountAccessService::normalizeAccountIds(
                self::decodeJsonObject($row['allowed_account_ids_json'] ?? null)
            ),
            'default_account_id' => UserAccountAccessService::defaultAccountIdFromUser($row),
            'created_at' => $row['created_at'] ?? null,
            'updated_at' => $row['updated_at'] ?? null,
        ];
    }

    public static function workspaceOwnerId(array $user): int
    {
        return self::workspaceOwnerIdFromRow($user);
    }

    public static function workspaceOwnerIdForUserId(int $userId, ?PDO $pdo = null): int
    {
        $pdo = $pdo ?? db();
        $stmt = $pdo->prepare(
            'SELECT id, workspace_owner_user_id
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('User not found.', 404);
        }

        return self::workspaceOwnerIdFromRow($row);
    }

    public static function assertEmailAvailable(string $email, ?int $excludeUserId = null, ?PDO $pdo = null): void
    {
        $pdo = $pdo ?? db();
        $sql = 'SELECT id FROM users WHERE email = :email AND deleted_at IS NULL';
        $params = [':email' => strtolower($email)];

        if ($excludeUserId !== null) {
            $sql .= ' AND id <> :id';
            $params[':id'] = $excludeUserId;
        }

        $sql .= ' LIMIT 1';
        $check = $pdo->prepare($sql);
        $check->execute($params);
        if ($check->fetch()) {
            Response::error('Email is already registered.', 409);
        }
    }

    public static function updateProfile(
        int $userId,
        string $name,
        string $email,
        ?string $currentPassword = null
    ): array {
        $name = Validator::string($name, 120);
        if ($name === '') {
            Response::error('Name is required.', 422);
        }

        $email = Validator::email($email);

        $stmt = db()->prepare(
            'SELECT id, email, password_hash
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $current = $stmt->fetch();
        if (!$current) {
            Response::error('User not found.', 404);
        }

        $existingEmail = strtolower((string) $current['email']);
        $nextEmail = strtolower($email);
        if ($nextEmail !== $existingEmail) {
            if ($currentPassword === null || trim($currentPassword) === '') {
                Response::error('Current password is required to change login email.', 422);
            }
            if (!password_verify($currentPassword, (string) $current['password_hash'])) {
                Response::error('Current password is incorrect.', 401);
            }

            self::assertEmailAvailable($nextEmail, $userId);
        }

        $update = db()->prepare(
            'UPDATE users
             SET name = :name,
                 email = :email
             WHERE id = :id
             LIMIT 1'
        );
        $update->execute([
            ':name' => $name,
            ':email' => $nextEmail,
            ':id' => $userId,
        ]);

        return self::findUserById($userId);
    }

    public static function changePassword(int $userId, string $currentPassword, string $newPassword): void
    {
        $newPassword = Validator::password($newPassword);
        $currentHash = self::assertCurrentPassword($userId, $currentPassword);
        if (password_verify($newPassword, $currentHash)) {
            Response::error('New password must be different from current password.', 422);
        }

        $update = db()->prepare(
            'UPDATE users
             SET password_hash = :password_hash
             WHERE id = :id
             LIMIT 1'
        );
        $update->execute([
            ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            ':id' => $userId,
        ]);
    }

    public static function assertCurrentPassword(int $userId, string $currentPassword, ?PDO $pdo = null): string
    {
        if (trim($currentPassword) === '') {
            Response::error('Current password is required.', 422);
        }

        $db = $pdo ?? db();
        $stmt = $db->prepare(
            'SELECT password_hash
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $userId]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('User not found.', 404);
        }

        $currentHash = (string) $row['password_hash'];
        if (!password_verify($currentPassword, $currentHash)) {
            Response::error('Current password is incorrect.', 401);
        }

        return $currentHash;
    }

    public static function setPasswordDirect(int $userId, string $newPassword): void
    {
        $newPassword = Validator::password($newPassword);
        $update = db()->prepare(
            'UPDATE users
             SET password_hash = :password_hash
             WHERE id = :id
             LIMIT 1'
        );
        $update->execute([
            ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            ':id' => $userId,
        ]);
    }

    public static function userCount(?PDO $pdo = null): int
    {
        $pdo = $pdo ?? db();
        $stmt = $pdo->query('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL');
        return (int) (($stmt->fetch()['total'] ?? 0));
    }

    private static function decodeJsonObject($raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    private static function workspaceOwnerIdFromRow(array $row): int
    {
        $workspaceOwnerId = (int) ($row['workspace_owner_user_id'] ?? 0);
        if ($workspaceOwnerId > 0) {
            return $workspaceOwnerId;
        }

        return (int) ($row['id'] ?? 0);
    }

    private static function firstWorkspaceAccountId(int $workspaceOwnerUserId, PDO $pdo): ?int
    {
        $stmt = $pdo->prepare(
            'SELECT id
             FROM accounts
             WHERE user_id = :user_id
               AND is_deleted = 0
             ORDER BY created_at ASC, id ASC
             LIMIT 1'
        );
        $stmt->execute([':user_id' => $workspaceOwnerUserId]);
        $row = $stmt->fetch();

        if (!$row) {
            return null;
        }

        $id = (int) ($row['id'] ?? 0);
        return $id > 0 ? $id : null;
    }
}
