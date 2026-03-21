<?php

declare(strict_types=1);

final class SchemaService
{
    private static bool $featureSchemaEnsured = false;

    public static function ensureFeatureSchema(): void
    {
        if (self::$featureSchemaEnsured) {
            return;
        }

        $pdo = db();
        try {
            self::ensureUserAccessSchema($pdo);
            self::ensureUserSettingsModulesColumn($pdo);
            self::ensureAssetTypesTable($pdo);
            self::ensureAssetTypesColorColumn($pdo);
            self::ensureAssetValueHistoryTable($pdo);
            self::ensureTransactionsAssetColumns($pdo);
            self::ensureTransactionsTypeEnum($pdo);
            self::ensureTransactionsAssetIndexes($pdo);
            self::ensureTransactionsAssetForeignKeys($pdo);
            self::ensureTransactionsCreatedByColumn($pdo);
            self::ensureTransactionsCreatedByIndexes($pdo);
            self::backfillTransactionsCreatedBy($pdo);
            self::ensureBusinessesTable($pdo);
            self::ensureTransactionsBusinessColumn($pdo);
            self::ensureTransactionsBusinessIndexes($pdo);
            self::ensureTransactionsBusinessForeignKeys($pdo);
            self::ensureLedgerContactsTable($pdo);
            self::ensureLedgerEntriesTable($pdo);
            self::$featureSchemaEnsured = true;
        } catch (Throwable $exception) {
            // Keep app running for unaffected endpoints and surface readable errors where needed.
            error_log('[SchemaService] feature schema ensure failed: ' . $exception->getMessage());
        }
    }

    public static function ensureAssetsSchema(): void
    {
        self::ensureFeatureSchema();
    }

    private static function ensureUserAccessSchema(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'users', 'role')) {
            self::safeExec($pdo, "ALTER TABLE users ADD COLUMN role VARCHAR(30) NOT NULL DEFAULT 'user' AFTER email");
        }

        if (!self::columnExists($pdo, 'users', 'permissions_json')) {
            self::safeExec($pdo, 'ALTER TABLE users ADD COLUMN permissions_json JSON NULL AFTER role');
        }

        if (!self::columnExists($pdo, 'users', 'is_active')) {
            self::safeExec($pdo, 'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER permissions_json');
        }

        if (!self::columnExists($pdo, 'users', 'deleted_at')) {
            self::safeExec($pdo, 'ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL AFTER is_active');
        }

        if (!self::columnExists($pdo, 'users', 'workspace_owner_user_id')) {
            $workspaceOwnerColumnType = self::resolveColumnType($pdo, 'users', 'id', 'INT UNSIGNED');
            self::safeExec(
                $pdo,
                'ALTER TABLE users ADD COLUMN workspace_owner_user_id ' . $workspaceOwnerColumnType . ' NULL AFTER is_active'
            );
        }

        if (!self::columnExists($pdo, 'users', 'allowed_account_ids_json')) {
            self::safeExec($pdo, 'ALTER TABLE users ADD COLUMN allowed_account_ids_json JSON NULL AFTER workspace_owner_user_id');
        }

        if (!self::columnExists($pdo, 'users', 'default_account_id')) {
            $defaultAccountColumnType = self::resolveColumnType(
                $pdo,
                'accounts',
                'id',
                self::resolveColumnType($pdo, 'users', 'id', 'INT UNSIGNED')
            );
            self::safeExec(
                $pdo,
                'ALTER TABLE users ADD COLUMN default_account_id ' . $defaultAccountColumnType . ' NULL AFTER allowed_account_ids_json'
            );
        }

        if (!self::columnExists($pdo, 'users', 'transaction_access_json')) {
            self::safeExec($pdo, 'ALTER TABLE users ADD COLUMN transaction_access_json JSON NULL AFTER default_account_id');
        }

        $pdo->exec(
            "UPDATE users
                 SET permissions_json = JSON_MERGE_PATCH(
                    JSON_OBJECT(
                        'transactions', TRUE,
                        'accounts', TRUE,
                        'categories', TRUE,
                        'budgets', TRUE,
                        'charts', TRUE,
                        'reports', TRUE,
                        'businesses', TRUE,
                        'ledger', TRUE,
                        'assets', TRUE
                    ),
                    COALESCE(permissions_json, JSON_OBJECT())
                 ),
                 transaction_access_json = JSON_MERGE_PATCH(
                    JSON_OBJECT(
                        'edit', 'own',
                        'delete', 'own'
                    ),
                    COALESCE(transaction_access_json, JSON_OBJECT())
                 ),
                 is_active = COALESCE(is_active, 1),
                 deleted_at = deleted_at,
                 allowed_account_ids_json = allowed_account_ids_json"
        );

        $pdo->exec(
            "UPDATE users
             SET role = 'super_admin'
             WHERE id = (
                SELECT first_user_id
                FROM (
                    SELECT id AS first_user_id
                    FROM users
                    ORDER BY created_at ASC, id ASC
                    LIMIT 1
                ) seeded
             )
             AND NOT EXISTS (
                SELECT 1
                FROM (
                    SELECT id
                    FROM users
                    WHERE role = 'super_admin'
                    LIMIT 1
                ) existing_super_admin
             )"
        );

        $pdo->exec(
            "UPDATE users
             SET transaction_access_json = JSON_OBJECT('edit', 'any', 'delete', 'any')
             WHERE role = 'super_admin'"
        );

        if (self::columnExists($pdo, 'users', 'workspace_owner_user_id')) {
            $workspaceOwnerId = self::defaultWorkspaceOwnerId($pdo);
            if ($workspaceOwnerId !== null) {
                $stmt = $pdo->prepare(
                    'UPDATE users
                     SET workspace_owner_user_id = :workspace_owner_user_id
                     WHERE workspace_owner_user_id IS NULL'
                );
                $stmt->execute([':workspace_owner_user_id' => $workspaceOwnerId]);
            }
        }

        if (self::columnExists($pdo, 'users', 'default_account_id')) {
            $pdo->exec(
                "UPDATE users u
                 SET u.default_account_id = (
                    SELECT a.id
                    FROM accounts a
                    WHERE a.user_id = COALESCE(u.workspace_owner_user_id, u.id)
                      AND a.is_deleted = 0
                    ORDER BY a.created_at ASC, a.id ASC
                    LIMIT 1
                 )
                 WHERE u.default_account_id IS NULL
                    OR NOT EXISTS (
                        SELECT 1
                        FROM accounts existing_default
                        WHERE existing_default.id = u.default_account_id
                          AND existing_default.user_id = COALESCE(u.workspace_owner_user_id, u.id)
                          AND existing_default.is_deleted = 0
                    )"
            );
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

    private static function ensureUserSettingsModulesColumn(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'user_settings', 'modules_json')) {
            self::safeExec($pdo, 'ALTER TABLE user_settings ADD COLUMN modules_json JSON NULL AFTER last_transaction_filters');
        }

        $pdo->exec(
            'UPDATE user_settings
             SET modules_json = JSON_MERGE_PATCH(
                JSON_OBJECT(\'businesses\', TRUE, \'ledger\', TRUE, \'assets\', TRUE, \'users_access\', TRUE),
                COALESCE(modules_json, JSON_OBJECT())
             )
             WHERE modules_json IS NULL
                OR JSON_EXTRACT(modules_json, \'$.businesses\') IS NULL
                OR JSON_EXTRACT(modules_json, \'$.ledger\') IS NULL
                OR JSON_EXTRACT(modules_json, \'$.assets\') IS NULL
                OR JSON_EXTRACT(modules_json, \'$.users_access\') IS NULL'
        );
    }

    private static function ensureAssetTypesColorColumn(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'asset_types', 'color')) {
            self::safeExec($pdo, 'ALTER TABLE asset_types ADD COLUMN color VARCHAR(20) NULL AFTER icon');
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
            self::safeExec($pdo, 'ALTER TABLE transactions ADD COLUMN from_asset_type_id INT UNSIGNED NULL AFTER to_account_id');
        }

        if (!self::columnExists($pdo, 'transactions', 'to_asset_type_id')) {
            self::safeExec($pdo, 'ALTER TABLE transactions ADD COLUMN to_asset_type_id INT UNSIGNED NULL AFTER from_asset_type_id');
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
            self::safeExec($pdo, 'ALTER TABLE transactions ADD INDEX idx_transactions_user_from_asset (user_id, from_asset_type_id)');
        }
        if (!self::indexExists($pdo, 'transactions', 'idx_transactions_user_to_asset')) {
            self::safeExec($pdo, 'ALTER TABLE transactions ADD INDEX idx_transactions_user_to_asset (user_id, to_asset_type_id)');
        }
    }

    private static function ensureTransactionsAssetForeignKeys(PDO $pdo): void
    {
        if (!self::constraintExists($pdo, 'transactions', 'fk_transactions_from_asset_type')) {
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions
                 ADD CONSTRAINT fk_transactions_from_asset_type
                 FOREIGN KEY (from_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL'
            );
        }
        if (!self::constraintExists($pdo, 'transactions', 'fk_transactions_to_asset_type')) {
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions
                 ADD CONSTRAINT fk_transactions_to_asset_type
                 FOREIGN KEY (to_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL'
            );
        }
    }

    private static function ensureTransactionsCreatedByColumn(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'transactions', 'created_by_user_id')) {
            $userIdColumnType = self::resolveColumnType($pdo, 'users', 'id', 'INT UNSIGNED');
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions ADD COLUMN created_by_user_id ' . $userIdColumnType . ' NULL AFTER user_id'
            );
        }
    }

    private static function ensureTransactionsCreatedByIndexes(PDO $pdo): void
    {
        if (!self::indexExists($pdo, 'transactions', 'idx_transactions_user_created_by_date')) {
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions
                 ADD INDEX idx_transactions_user_created_by_date (user_id, created_by_user_id, transaction_date)'
            );
        }
    }

    private static function backfillTransactionsCreatedBy(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'transactions', 'created_by_user_id')) {
            return;
        }

        $pdo->exec(
            'UPDATE transactions
             SET created_by_user_id = user_id
             WHERE created_by_user_id IS NULL'
        );
    }

    private static function ensureBusinessesTable(PDO $pdo): void
    {
        if (self::tableExists($pdo, 'businesses')) {
            return;
        }

        $usersIdColumnType = self::resolveColumnType($pdo, 'users', 'id', 'INT UNSIGNED');
        $businessIdColumnType = self::resolveColumnType($pdo, 'transactions', 'id', $usersIdColumnType);

        self::safeExec(
            $pdo,
            'CREATE TABLE businesses (
                id ' . $businessIdColumnType . ' AUTO_INCREMENT PRIMARY KEY,
                user_id ' . $usersIdColumnType . ' NOT NULL,
                name VARCHAR(120) NOT NULL,
                notes VARCHAR(255) NULL,
                is_deleted TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_businesses_user
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_businesses_user_name_active (user_id, name, is_deleted),
                INDEX idx_businesses_user_deleted (user_id, is_deleted)
            ) ENGINE=InnoDB'
        );
    }

    private static function ensureTransactionsBusinessColumn(PDO $pdo): void
    {
        if (!self::columnExists($pdo, 'transactions', 'business_id')) {
            $businessIdColumnType = self::resolveColumnType($pdo, 'businesses', 'id', 'INT UNSIGNED');
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions ADD COLUMN business_id ' . $businessIdColumnType . ' NULL AFTER category_id'
            );
        }
    }

    private static function ensureTransactionsBusinessIndexes(PDO $pdo): void
    {
        if (!self::indexExists($pdo, 'transactions', 'idx_transactions_user_business')) {
            self::safeExec($pdo, 'ALTER TABLE transactions ADD INDEX idx_transactions_user_business (user_id, business_id)');
        }
        if (!self::indexExists($pdo, 'transactions', 'idx_transactions_user_deleted_business_date')) {
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions
                 ADD INDEX idx_transactions_user_deleted_business_date (user_id, is_deleted, business_id, transaction_date)'
            );
        }
    }

    private static function ensureTransactionsBusinessForeignKeys(PDO $pdo): void
    {
        if (!self::constraintExists($pdo, 'transactions', 'fk_transactions_business')) {
            self::safeExec(
                $pdo,
                'ALTER TABLE transactions
                 ADD CONSTRAINT fk_transactions_business
                FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL'
            );
        }
    }

    private static function ensureLedgerContactsTable(PDO $pdo): void
    {
        if (self::tableExists($pdo, 'ledger_contacts')) {
            return;
        }

        $usersIdColumnType = self::resolveColumnType($pdo, 'users', 'id', 'INT UNSIGNED');
        $contactIdColumnType = self::resolveColumnType($pdo, 'accounts', 'id', $usersIdColumnType);

        self::safeExec(
            $pdo,
            'CREATE TABLE ledger_contacts (
                id ' . $contactIdColumnType . ' AUTO_INCREMENT PRIMARY KEY,
                user_id ' . $usersIdColumnType . ' NOT NULL,
                name VARCHAR(120) NOT NULL,
                party_type ENUM(\'customer\',\'supplier\',\'both\') NOT NULL DEFAULT \'customer\',
                phone VARCHAR(40) NULL,
                email VARCHAR(150) NULL,
                notes VARCHAR(255) NULL,
                is_deleted TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_ledger_contacts_user
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY uq_ledger_contacts_user_name_active (user_id, name, is_deleted),
                INDEX idx_ledger_contacts_user_deleted (user_id, is_deleted),
                INDEX idx_ledger_contacts_user_party (user_id, party_type, is_deleted)
            ) ENGINE=InnoDB'
        );
    }

    private static function ensureLedgerEntriesTable(PDO $pdo): void
    {
        if (self::tableExists($pdo, 'ledger_entries')) {
            return;
        }

        $usersIdColumnType = self::resolveColumnType($pdo, 'users', 'id', 'INT UNSIGNED');
        $contactIdColumnType = self::resolveColumnType($pdo, 'ledger_contacts', 'id', $usersIdColumnType);
        $transactionIdColumnType = self::resolveColumnType($pdo, 'transactions', 'id', $contactIdColumnType);

        self::safeExec(
            $pdo,
            'CREATE TABLE ledger_entries (
                id ' . $transactionIdColumnType . ' AUTO_INCREMENT PRIMARY KEY,
                user_id ' . $usersIdColumnType . ' NOT NULL,
                contact_id ' . $contactIdColumnType . ' NOT NULL,
                direction ENUM(\'receivable\',\'payable\') NOT NULL,
                amount DECIMAL(14,2) NOT NULL,
                note VARCHAR(255) NULL,
                attachment_path VARCHAR(255) NULL,
                status ENUM(\'open\',\'converted\',\'cancelled\') NOT NULL DEFAULT \'open\',
                converted_transaction_id ' . $transactionIdColumnType . ' NULL,
                converted_at DATETIME NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_ledger_entries_user
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT fk_ledger_entries_contact
                    FOREIGN KEY (contact_id) REFERENCES ledger_contacts(id) ON DELETE CASCADE,
                CONSTRAINT fk_ledger_entries_transaction
                    FOREIGN KEY (converted_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
                INDEX idx_ledger_entries_user_status_direction (user_id, status, direction),
                INDEX idx_ledger_entries_contact_status (contact_id, status),
                INDEX idx_ledger_entries_transaction (converted_transaction_id),
                INDEX idx_ledger_entries_user_created (user_id, created_at)
            ) ENGINE=InnoDB'
        );
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

    private static function safeExec(PDO $pdo, string $sql): void
    {
        try {
            $pdo->exec($sql);
        } catch (PDOException $exception) {
            if (self::isIgnorableSchemaError($exception)) {
                return;
            }

            throw $exception;
        }
    }

    private static function isIgnorableSchemaError(PDOException $exception): bool
    {
        $driverCode = (int) ($exception->errorInfo[1] ?? 0);
        if (in_array($driverCode, [1050, 1060, 1061, 1826], true)) {
            return true;
        }

        $message = strtolower($exception->getMessage());
        return str_contains($message, 'already exists')
            || str_contains($message, 'duplicate column name')
            || str_contains($message, 'duplicate key name')
            || str_contains($message, 'duplicate foreign key constraint name');
    }

    private static function defaultWorkspaceOwnerId(PDO $pdo): ?int
    {
        $stmt = $pdo->query(
            "SELECT id
             FROM users
             WHERE role = 'super_admin'
             ORDER BY created_at ASC, id ASC
             LIMIT 1"
        );
        $row = $stmt->fetch();
        if ($row && (int) ($row['id'] ?? 0) > 0) {
            return (int) $row['id'];
        }

        $fallbackStmt = $pdo->query(
            'SELECT id
             FROM users
             ORDER BY created_at ASC, id ASC
             LIMIT 1'
        );
        $fallbackRow = $fallbackStmt->fetch();
        $id = (int) ($fallbackRow['id'] ?? 0);
        return $id > 0 ? $id : null;
    }

    private static function resolveColumnType(PDO $pdo, string $tableName, string $columnName, string $fallback): string
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
            ':table_name' => $tableName,
            ':column_name' => $columnName,
        ]);

        $rawType = strtolower(trim((string) (($stmt->fetch()['COLUMN_TYPE'] ?? ''))));
        if (
            $rawType !== ''
            && preg_match('/^(tinyint|smallint|mediumint|int|bigint)(\([0-9]+\))?( unsigned)?$/', $rawType) === 1
        ) {
            return strtoupper($rawType);
        }

        return $fallback;
    }
}
