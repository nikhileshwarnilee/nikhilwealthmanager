USE expense_manager;

SET @has_accounts_is_deleted := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND COLUMN_NAME = 'is_deleted'
);
SET @sql := IF(@has_accounts_is_deleted = 0,
  'ALTER TABLE accounts ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_archived',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_categories_is_deleted := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND COLUMN_NAME = 'is_deleted'
);
SET @sql := IF(@has_categories_is_deleted = 0,
  'ALTER TABLE categories ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER is_default',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_transactions_is_deleted := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'is_deleted'
);
SET @sql := IF(@has_transactions_is_deleted = 0,
  'ALTER TABLE transactions ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER note',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @accounts_deleted_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND INDEX_NAME = 'idx_accounts_user_deleted'
);
SET @sql := IF(@accounts_deleted_idx = 0,
  'ALTER TABLE accounts ADD INDEX idx_accounts_user_deleted (user_id, is_deleted)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @categories_deleted_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND INDEX_NAME = 'idx_categories_user_deleted'
);
SET @sql := IF(@categories_deleted_idx = 0,
  'ALTER TABLE categories ADD INDEX idx_categories_user_deleted (user_id, is_deleted)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @transactions_deleted_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'idx_transactions_user_deleted_date'
);
SET @sql := IF(@transactions_deleted_idx = 0,
  'ALTER TABLE transactions ADD INDEX idx_transactions_user_deleted_date (user_id, is_deleted, transaction_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @old_categories_uq := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND INDEX_NAME = 'uq_categories_user_name_type'
);
SET @sql := IF(@old_categories_uq > 0,
  'ALTER TABLE categories DROP INDEX uq_categories_user_name_type',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @new_categories_uq := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND INDEX_NAME = 'uq_categories_user_name_type_active'
);
SET @sql := IF(@new_categories_uq = 0,
  'ALTER TABLE categories ADD UNIQUE KEY uq_categories_user_name_type_active (user_id, name, type, is_deleted)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @transactions_type_def := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'type'
  LIMIT 1
);
SET @sql := IF(@transactions_type_def IS NOT NULL AND INSTR(@transactions_type_def, 'opening_adjustment') = 0,
  'ALTER TABLE transactions MODIFY COLUMN type ENUM(''income'',''expense'',''transfer'',''opening_adjustment'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

