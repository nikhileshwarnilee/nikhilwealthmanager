CREATE TABLE IF NOT EXISTS asset_types (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asset_value_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  asset_type_id INT UNSIGNED NOT NULL,
  value DECIMAL(14,2) NOT NULL,
  note VARCHAR(255) NULL,
  source ENUM('manual', 'system') NOT NULL DEFAULT 'manual',
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_asset_value_history_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_asset_value_history_asset_type
    FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
  INDEX idx_asset_value_history_user_asset_date (user_id, asset_type_id, recorded_at),
  INDEX idx_asset_value_history_user_date (user_id, recorded_at)
) ENGINE=InnoDB;

SET @has_asset_color := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'asset_types'
    AND COLUMN_NAME = 'color'
);
SET @sql := IF(
  @has_asset_color = 0,
  'ALTER TABLE asset_types ADD COLUMN color VARCHAR(20) NULL AFTER icon',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_from_asset_type_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'from_asset_type_id'
);
SET @sql := IF(
  @has_from_asset_type_id = 0,
  'ALTER TABLE transactions ADD COLUMN from_asset_type_id INT UNSIGNED NULL AFTER to_account_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_to_asset_type_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'to_asset_type_id'
);
SET @sql := IF(
  @has_to_asset_type_id = 0,
  'ALTER TABLE transactions ADD COLUMN to_asset_type_id INT UNSIGNED NULL AFTER from_asset_type_id',
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
SET @sql := IF(
  @transactions_type_def IS NOT NULL AND INSTR(@transactions_type_def, '''asset''') = 0,
  'ALTER TABLE transactions MODIFY COLUMN type ENUM(''income'',''expense'',''transfer'',''opening_adjustment'',''asset'') NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tx_from_asset_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'idx_transactions_user_from_asset'
);
SET @sql := IF(
  @tx_from_asset_idx = 0,
  'ALTER TABLE transactions ADD INDEX idx_transactions_user_from_asset (user_id, from_asset_type_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tx_to_asset_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'idx_transactions_user_to_asset'
);
SET @sql := IF(
  @tx_to_asset_idx = 0,
  'ALTER TABLE transactions ADD INDEX idx_transactions_user_to_asset (user_id, to_asset_type_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tx_from_asset_fk := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND CONSTRAINT_NAME = 'fk_transactions_from_asset_type'
);
SET @sql := IF(
  @tx_from_asset_fk = 0,
  'ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_from_asset_type
      FOREIGN KEY (from_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tx_to_asset_fk := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND CONSTRAINT_NAME = 'fk_transactions_to_asset_type'
);
SET @sql := IF(
  @tx_to_asset_fk = 0,
  'ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_to_asset_type
      FOREIGN KEY (to_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
