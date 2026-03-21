SET @has_modules_json := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_settings'
    AND COLUMN_NAME = 'modules_json'
);

SET @sql := IF(
  @has_modules_json = 0,
  'ALTER TABLE user_settings ADD COLUMN modules_json JSON NULL AFTER last_transaction_filters',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
