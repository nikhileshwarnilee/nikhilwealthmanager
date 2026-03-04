USE expense_manager;

SET @has_tx_location := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'location'
);

SET @sql := IF(@has_tx_location = 0,
  'ALTER TABLE transactions ADD COLUMN location VARCHAR(255) NULL AFTER note',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_tx_receipt_path := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND COLUMN_NAME = 'receipt_path'
);

SET @sql := IF(@has_tx_receipt_path = 0,
  'ALTER TABLE transactions ADD COLUMN receipt_path VARCHAR(255) NULL AFTER location',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

