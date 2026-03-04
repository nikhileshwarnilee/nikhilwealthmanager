USE expense_manager;

SET @has_categories_user_deleted_type_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'categories'
    AND INDEX_NAME = 'idx_categories_user_deleted_type'
);

SET @sql := IF(@has_categories_user_deleted_type_idx = 0,
  'ALTER TABLE categories ADD INDEX idx_categories_user_deleted_type (user_id, is_deleted, type)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_tx_reports_idx := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'transactions'
    AND INDEX_NAME = 'idx_transactions_user_deleted_type_category_date'
);

SET @sql := IF(@has_tx_reports_idx = 0,
  'ALTER TABLE transactions ADD INDEX idx_transactions_user_deleted_type_category_date (user_id, is_deleted, type, category_id, transaction_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

