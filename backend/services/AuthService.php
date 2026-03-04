<?php

declare(strict_types=1);

final class AuthService
{
    public static function register(string $name, string $email, string $password): array
    {
        $check = db()->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
        $check->execute([':email' => $email]);
        if ($check->fetch()) {
            Response::error('Email is already registered.', 409);
        }

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                'INSERT INTO users (name, email, password_hash)
                 VALUES (:name, :email, :password_hash)'
            );
            $stmt->execute([
                ':name' => $name,
                ':email' => $email,
                ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);

            $userId = (int) $pdo->lastInsertId();

            $settingsStmt = $pdo->prepare(
                'INSERT INTO user_settings (user_id, currency, dark_mode, last_transaction_filters)
                 VALUES (:user_id, :currency, :dark_mode, :filters)'
            );
            $settingsStmt->execute([
                ':user_id' => $userId,
                ':currency' => 'INR',
                ':dark_mode' => 0,
                ':filters' => json_encode([
                    'type' => '',
                    'account_id' => '',
                    'category_id' => '',
                    'search' => '',
                    'date_from' => '',
                    'date_to' => '',
                ]),
            ]);

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

            CategoryService::seedDefaultCategories($userId);
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
            'SELECT id, name, email, password_hash
             FROM users
             WHERE email = :email
             LIMIT 1'
        );
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, (string) $user['password_hash'])) {
            Response::error('Invalid credentials.', 401);
        }

        return [
            'id' => (int) $user['id'],
            'name' => (string) $user['name'],
            'email' => (string) $user['email'],
        ];
    }

    public static function findUserById(int $id): array
    {
        $stmt = db()->prepare(
            'SELECT id, name, email, created_at, updated_at
             FROM users
             WHERE id = :id
             LIMIT 1'
        );
        $stmt->execute([':id' => $id]);
        $user = $stmt->fetch();
        if (!$user) {
            Response::error('User not found.', 404);
        }
        return $user;
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

            $emailCheck = db()->prepare(
                'SELECT id
                 FROM users
                 WHERE email = :email
                   AND id <> :id
                 LIMIT 1'
            );
            $emailCheck->execute([
                ':email' => $nextEmail,
                ':id' => $userId,
            ]);
            if ($emailCheck->fetch()) {
                Response::error('Email is already registered.', 409);
            }
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
        if (trim($currentPassword) === '') {
            Response::error('Current password is required.', 422);
        }

        $newPassword = Validator::password($newPassword);

        $stmt = db()->prepare(
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
}
