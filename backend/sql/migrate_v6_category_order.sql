USE expense_manager;

SET @has_sort_order := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND COLUMN_NAME = 'sort_order'
);

SET @sql := IF(@has_sort_order = 0,
  'ALTER TABLE categories ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_default',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_type_order_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND INDEX_NAME = 'idx_categories_user_type_order'
);

SET @sql := IF(@has_type_order_idx = 0,
  'ALTER TABLE categories ADD INDEX idx_categories_user_type_order (user_id, type, is_deleted, sort_order, id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @prev_user := 0;
SET @prev_type := '';
SET @row_rank := 0;

UPDATE categories c
JOIN (
  SELECT
    id,
    (@row_rank := IF(@prev_user = user_id AND @prev_type = type, @row_rank + 1, 1)) AS desired_order,
    (@prev_user := user_id) AS _u,
    (@prev_type := type) AS _t
  FROM categories
  WHERE is_deleted = 0
  ORDER BY user_id, type, CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END, name, id
) ranked
  ON ranked.id = c.id
SET c.sort_order = ranked.desired_order
WHERE c.is_deleted = 0
  AND c.sort_order = 0;
