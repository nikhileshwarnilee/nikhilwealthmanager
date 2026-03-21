SET @users_id_type := (
  SELECT UPPER(COLUMN_TYPE)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @business_id_type := (
  SELECT UPPER(COLUMN_TYPE)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @users_id_type := COALESCE(NULLIF(@users_id_type, ''), 'INT UNSIGNED');
SET @business_id_type := COALESCE(NULLIF(@business_id_type, ''), @users_id_type, 'INT UNSIGNED');

SET @sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS businesses (',
  'id ', @business_id_type, ' AUTO_INCREMENT PRIMARY KEY,',
  ' user_id ', @users_id_type, ' NOT NULL,',
  ' name VARCHAR(120) NOT NULL,',
  ' notes VARCHAR(255) NULL,',
  ' is_deleted TINYINT(1) NOT NULL DEFAULT 0,',
  ' created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  ' updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  ' CONSTRAINT fk_businesses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,',
  ' UNIQUE KEY uq_businesses_user_name_active (user_id, name, is_deleted),',
  ' INDEX idx_businesses_user_deleted (user_id, is_deleted)',
  ') ENGINE=InnoDB'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_business_id := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'business_id'
);
SET @sql := IF(
  @has_business_id = 0,
  CONCAT('ALTER TABLE transactions ADD COLUMN business_id ', @business_id_type, ' NULL AFTER category_id'),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @business_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'idx_transactions_user_business'
);
SET @sql := IF(
  @business_idx = 0,
  'ALTER TABLE transactions ADD INDEX idx_transactions_user_business (user_id, business_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @business_deleted_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'idx_transactions_user_deleted_business_date'
);
SET @sql := IF(
  @business_deleted_idx = 0,
  'ALTER TABLE transactions ADD INDEX idx_transactions_user_deleted_business_date (user_id, is_deleted, business_id, transaction_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @business_fk := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND CONSTRAINT_NAME = 'fk_transactions_business'
);
SET @sql := IF(
  @business_fk = 0,
  'ALTER TABLE transactions
      ADD CONSTRAINT fk_transactions_business
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
