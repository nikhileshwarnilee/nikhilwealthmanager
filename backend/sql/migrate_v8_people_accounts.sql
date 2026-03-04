SET @account_type_column := (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'accounts'
    AND COLUMN_NAME = 'type'
  LIMIT 1
);

SET @needs_people := IF(
  @account_type_column IS NULL,
  0,
  IF(LOCATE('''people''', @account_type_column) > 0, 0, 1)
);

SET @sql := IF(
  @needs_people = 1,
  'ALTER TABLE accounts
     MODIFY COLUMN type ENUM(''cash'', ''bank'', ''upi'', ''wallet'', ''credit'', ''people'') NOT NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
