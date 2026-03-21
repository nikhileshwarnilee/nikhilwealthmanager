<?php

declare(strict_types=1);

final class BusinessService
{
    public static function listAll(int $userId): array
    {
        if (!UserSettingsService::isModuleEnabled($userId, 'businesses')) {
            return [];
        }

        $stmt = db()->prepare(
            'SELECT
                b.id,
                b.user_id,
                b.name,
                b.notes,
                b.created_at,
                b.updated_at,
                COUNT(t.id) AS transaction_count
             FROM businesses b
             LEFT JOIN transactions t
               ON t.user_id = b.user_id
              AND t.business_id = b.id
              AND t.is_deleted = 0
             WHERE b.user_id = :user_id
               AND b.is_deleted = 0
             GROUP BY b.id, b.user_id, b.name, b.notes, b.created_at, b.updated_at
             ORDER BY b.name ASC, b.id ASC'
        );
        $stmt->execute([':user_id' => $userId]);

        $rows = [];
        foreach ($stmt->fetchAll() as $row) {
            $rows[] = [
                'id' => (int) $row['id'],
                'user_id' => (int) $row['user_id'],
                'name' => (string) $row['name'],
                'notes' => $row['notes'] ?: null,
                'transaction_count' => (int) ($row['transaction_count'] ?? 0),
                'created_at' => (string) $row['created_at'],
                'updated_at' => (string) $row['updated_at'],
            ];
        }

        return $rows;
    }

    public static function create(int $userId, array $input): array
    {
        self::assertModuleEnabled($userId);

        $name = Validator::string($input['name'] ?? '', 120);
        $notes = Validator::string($input['notes'] ?? '', 255);

        if ($name === '') {
            Response::error('Business name is required.', 422);
        }

        $existingStmt = db()->prepare(
            'SELECT id, is_deleted
             FROM businesses
             WHERE user_id = :user_id
               AND name = :name
             LIMIT 1'
        );
        $existingStmt->execute([
            ':user_id' => $userId,
            ':name' => $name,
        ]);
        $existing = $existingStmt->fetch();

        if ($existing && (int) ($existing['is_deleted'] ?? 0) === 0) {
            Response::error('Business already exists.', 409);
        }

        if ($existing && (int) ($existing['is_deleted'] ?? 0) === 1) {
            $restoreStmt = db()->prepare(
                'UPDATE businesses
                 SET notes = :notes,
                     is_deleted = 0
                 WHERE id = :id
                   AND user_id = :user_id
                 LIMIT 1'
            );
            $restoreStmt->execute([
                ':id' => (int) $existing['id'],
                ':user_id' => $userId,
                ':notes' => $notes !== '' ? $notes : null,
            ]);

            return self::getBusiness((int) $existing['id'], $userId);
        }

        $stmt = db()->prepare(
            'INSERT INTO businesses (user_id, name, notes, is_deleted)
             VALUES (:user_id, :name, :notes, 0)'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':name' => $name,
            ':notes' => $notes !== '' ? $notes : null,
        ]);

        return self::getBusiness((int) db()->lastInsertId(), $userId);
    }

    public static function update(int $userId, int $id, array $input): array
    {
        self::assertModuleEnabled($userId);

        $name = Validator::string($input['name'] ?? '', 120);
        $notes = Validator::string($input['notes'] ?? '', 255);

        if ($name === '') {
            Response::error('Business name is required.', 422);
        }

        self::assertBusiness($id, $userId);

        $stmt = db()->prepare(
            'UPDATE businesses
             SET name = :name,
                 notes = :notes
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0'
        );

        try {
            $stmt->execute([
                ':name' => $name,
                ':notes' => $notes !== '' ? $notes : null,
                ':id' => $id,
                ':user_id' => $userId,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                Response::error('Business already exists.', 409);
            }
            throw $exception;
        }

        return self::getBusiness($id, $userId);
    }

    public static function delete(int $userId, int $id): array
    {
        self::assertModuleEnabled($userId);
        self::assertBusiness($id, $userId);

        $txCountStmt = db()->prepare(
            'SELECT COUNT(*) AS total
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND business_id = :business_id'
        );
        $txCountStmt->execute([
            ':user_id' => $userId,
            ':business_id' => $id,
        ]);
        $transactionCount = (int) (($txCountStmt->fetch()['total'] ?? 0));

        $pdo = db();
        $pdo->beginTransaction();

        try {
            $clearTransactionsStmt = $pdo->prepare(
                'UPDATE transactions
                 SET business_id = NULL
                 WHERE user_id = :user_id
                   AND is_deleted = 0
                   AND business_id = :business_id'
            );
            $clearTransactionsStmt->execute([
                ':user_id' => $userId,
                ':business_id' => $id,
            ]);

            $deleteStmt = $pdo->prepare(
                'UPDATE businesses
                 SET is_deleted = 1
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );
            $deleteStmt->execute([
                ':id' => $id,
                ':user_id' => $userId,
            ]);

            $pdo->commit();

            return [
                'cleared_transactions' => $transactionCount,
            ];
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function getBusiness(int $id, int $userId): array
    {
        self::assertModuleEnabled($userId);

        $stmt = db()->prepare(
            'SELECT
                b.id,
                b.user_id,
                b.name,
                b.notes,
                b.created_at,
                b.updated_at,
                COUNT(t.id) AS transaction_count
             FROM businesses b
             LEFT JOIN transactions t
               ON t.user_id = b.user_id
              AND t.business_id = b.id
              AND t.is_deleted = 0
             WHERE b.id = :id
               AND b.user_id = :user_id
               AND b.is_deleted = 0
             GROUP BY b.id, b.user_id, b.name, b.notes, b.created_at, b.updated_at
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Business not found.', 404);
        }

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'name' => (string) $row['name'],
            'notes' => $row['notes'] ?: null,
            'transaction_count' => (int) ($row['transaction_count'] ?? 0),
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    public static function assertBusiness(int $businessId, int $userId, ?PDO $pdo = null): array
    {
        self::assertModuleEnabled($userId, $pdo);

        $db = $pdo ?? db();
        $stmt = $db->prepare(
            'SELECT id, name
             FROM businesses
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $businessId,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Invalid business selected.', 422);
        }

        return $row;
    }

    private static function assertModuleEnabled(int $userId, ?PDO $pdo = null): void
    {
        if (!UserSettingsService::isModuleEnabled($userId, 'businesses', $pdo)) {
            Response::error('Businesses module is disabled.', 403);
        }
    }
}
