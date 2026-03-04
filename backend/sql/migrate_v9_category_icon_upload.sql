SET @icon_max_len := (
  SELECT CHARACTER_MAXIMUM_LENGTH
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND COLUMN_NAME = 'icon'
  LIMIT 1
);

SET @sql := IF(
  @icon_max_len IS NOT NULL AND @icon_max_len < 255,
  'ALTER TABLE categories MODIFY COLUMN icon VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
