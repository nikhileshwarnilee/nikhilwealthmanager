<?php

declare(strict_types=1);

final class SchemaService
{
    private static bool $assetsSchemaEnsured = false;

    public static function ensureAssetsSchema(): void
    {
        if (self::$assetsSchemaEnsured) {
            return;
        }

        $pdo = db();
        try {
            self::ensureAssetTypesTable($pdo);
            self::ensureAssetTypesColorColumn($pdo);
            self::ensureAssetValueHistoryTable($pdo);
            self::ensureTransactionsAssetColumns($pdo);
            self::ensureTransactionsTypeEnum($pdo);
            self::ensureTransactionsAssetIndexes($pdo);
            self::ensureTransactionsAssetForeignKeys($pdo);
            self::$assetsSchemaEnsured = true;
        } catch (Throwable $exception) {
            // Keep app running for unaffected endpoints and surface readable errors where needed.
            error_log('[SchemaService] assets schema ensure failed: ' . $exception->getMessage());
        }
    }

    private static function ensureAssetTypesTable(PDO $pdo): void
    {
        if (self::tableExists($pdo, 'asset_types')) {
            return;
        }

        $pdo->exec(
            'CREATE TABLE asset_types (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNSIGNED NOT NULL,
                name VARCHAR(120) NOT NULL,
                icon VARCHAR(255) NULL,
                color VARCHAR(20) NULL,
                notes VARCHAR(255) NULL,
                current_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
                is_deleted TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_asset_types_user
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_asset_types_user_name_active (user_id, name, is_deleted),
                INDEX idx_asset_types_user_deleted (user_id, is_deleted)
            ) ENGINE=InnoDB'
        );
    }

    private static function ensureAssetTypesColorColumn(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'asset_types', 'color')) {
            $pdo->exec('ALTER TABLE asset_types ADD COLUMN color VARCHAR(20) NULL AFTER icon');
        }
    }

    private static function ensureAssetValueHistoryTable(PDO $pdo): void
    {
        if (self::tableExists($pdo, 'asset_value_history')) {
            return;
        }

        $pdo->exec(
            'CREATE TABLE asset_value_history (
                id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                user_id INT UNSIGNED NOT NULL,
                asset_type_id INT UNSIGNED NOT NULL,
                value DECIMAL(14,2) NOT NULL,
                note VARCHAR(255) NULL,
                source ENUM(\'manual\', \'system\') NOT NULL DEFAULT \'manual\',
                recorded_at DATETIME NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_asset_value_history_user
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_asset_value_history_asset_type
                    FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
                INDEX idx_asset_value_history_user_asset_date (user_id, asset_type_id, recorded_at),
                INDEX idx_asset_value_history_user_date (user_id, recorded_at)
            ) ENGINE=InnoDB'
        );
    }

    private static function ensureTransactionsAssetColumns(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'transactions', 'from_asset_type_id')) {
            $pdo->exec('ALTER TABLE transactions ADD COLUMN from_asset_type_id INT UNSIGNED NULL AFTER to_account_id');
        }

        if (!self::columnExists($pdo, 'transactions', 'to_asset_type_id')) {
            $pdo->exec('ALTER TABLE transactions ADD COLUMN to_asset_type_id INT UNSIGNED NULL AFTER from_asset_type_id');
        }
    }

    private static function ensureTransactionsTypeEnum(PDO $pdo): void
    {
        $stmt = $pdo->prepare(
            'SELECT COLUMN_TYPE
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table_name
               AND COLUMN_NAME = :column_name
             LIMIT 1'
        );
        $stmt->execute([
            ':table_name' => 'transactions',
            ':column_name' => 'type',
        ]);
        $typeDef = (string) (($stmt->fetch()['COLUMN_TYPE'] ?? ''));
        if ($typeDef !== '' && strpos($typeDef, '\'asset\'') !== false) {
            return;
        }

        $pdo->exec(
            'ALTER TABLE transactions
             MODIFY COLUMN type ENUM(\'income\',\'expense\',\'transfer\',\'opening_adjustment\',\'asset\') NOT NULL'
        );
    }

    private static function ensureTransactionsAssetIndexes(PDO $pdo): void
    {
        if (!self::indexExists($pdo, 'transactions', 'idx_transactions_user_from_asset')) {
            $pdo->exec('ALTER TABLE transactions ADD INDEX idx_transactions_user_from_asset (user_id, from_asset_type_id)');
        }
        if (!self::indexExists($pdo, 'transactions', 'idx_transactions_user_to_asset')) {
            $pdo->exec('ALTER TABLE transactions ADD INDEX idx_transactions_user_to_asset (user_id, to_asset_type_id)');
        }
    }

    private static function ensureTransactionsAssetForeignKeys(PDO $pdo): void
    {
        if (!self::constraintExists($pdo, 'transactions', 'fk_transactions_from_asset_type')) {
            $pdo->exec(
                'ALTER TABLE transactions
                 ADD CONSTRAINT fk_transactions_from_asset_type
                 FOREIGN KEY (from_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL'
            );
        }
        if (!self::constraintExists($pdo, 'transactions', 'fk_transactions_to_asset_type')) {
            $pdo->exec(
                'ALTER TABLE transactions
                 ADD CONSTRAINT fk_transactions_to_asset_type
                 FOREIGN KEY (to_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL'
            );
        }
    }

    private static function tableExists(PDO $pdo, string $tableName): bool
    {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table_name'
        );
        $stmt->execute([':table_name' => $tableName]);
        return (int) (($stmt->fetch()['total'] ?? 0)) > 0;
    }

    private static function columnExists(PDO $pdo, string $tableName, string $columnName): bool
    {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table_name
               AND COLUMN_NAME = :column_name'
        );
        $stmt->execute([
            ':table_name' => $tableName,
            ':column_name' => $columnName,
        ]);
        return (int) (($stmt->fetch()['total'] ?? 0)) > 0;
    }

    private static function indexExists(PDO $pdo, string $tableName, string $indexName): bool
    {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table_name
               AND INDEX_NAME = :index_name'
        );
        $stmt->execute([
            ':table_name' => $tableName,
            ':index_name' => $indexName,
        ]);
        return (int) (($stmt->fetch()['total'] ?? 0)) > 0;
    }

    private static function constraintExists(PDO $pdo, string $tableName, string $constraintName): bool
    {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS total
             FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = :table_name
               AND CONSTRAINT_NAME = :constraint_name'
        );
        $stmt->execute([
            ':table_name' => $tableName,
            ':constraint_name' => $constraintName,
        ]);
        return (int) (($stmt->fetch()['total'] ?? 0)) > 0;
    }
}
