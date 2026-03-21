SET @users_id_type := COALESCE(
  (
    SELECT UPPER(COLUMN_TYPE)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'id'
    LIMIT 1
  ),
  'BIGINT UNSIGNED'
);

SET @ledger_contact_id_type := COALESCE(
  (
    SELECT UPPER(COLUMN_TYPE)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'accounts'
      AND COLUMN_NAME = 'id'
    LIMIT 1
  ),
  @users_id_type
);

SET @transaction_id_type := COALESCE(
  (
    SELECT UPPER(COLUMN_TYPE)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'transactions'
      AND COLUMN_NAME = 'id'
    LIMIT 1
  ),
  @users_id_type
);

SET @has_ledger_contacts := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledger_contacts'
);

SET @sql := IF(
  @has_ledger_contacts = 0,
  CONCAT(
    'CREATE TABLE ledger_contacts (',
    'id ', @ledger_contact_id_type, ' AUTO_INCREMENT PRIMARY KEY, ',
    'user_id ', @users_id_type, ' NOT NULL, ',
    'name VARCHAR(120) NOT NULL, ',
    'party_type ENUM(''customer'',''supplier'',''both'') NOT NULL DEFAULT ''customer'', ',
    'phone VARCHAR(40) NULL, ',
    'email VARCHAR(150) NULL, ',
    'notes VARCHAR(255) NULL, ',
    'is_deleted TINYINT(1) NOT NULL DEFAULT 0, ',
    'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ',
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ',
    'CONSTRAINT fk_ledger_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, ',
    'UNIQUE KEY uq_ledger_contacts_user_name_active (user_id, name, is_deleted), ',
    'INDEX idx_ledger_contacts_user_deleted (user_id, is_deleted), ',
    'INDEX idx_ledger_contacts_user_party (user_id, party_type, is_deleted)',
    ') ENGINE=InnoDB'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ledger_entries := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ledger_entries'
);

SET @sql := IF(
  @has_ledger_entries = 0,
  CONCAT(
    'CREATE TABLE ledger_entries (',
    'id ', @transaction_id_type, ' AUTO_INCREMENT PRIMARY KEY, ',
    'user_id ', @users_id_type, ' NOT NULL, ',
    'contact_id ', @ledger_contact_id_type, ' NOT NULL, ',
    'direction ENUM(''receivable'',''payable'') NOT NULL, ',
    'amount DECIMAL(14,2) NOT NULL, ',
    'note VARCHAR(255) NULL, ',
    'attachment_path VARCHAR(255) NULL, ',
    'status ENUM(''open'',''converted'',''cancelled'') NOT NULL DEFAULT ''open'', ',
    'converted_transaction_id ', @transaction_id_type, ' NULL, ',
    'converted_at DATETIME NULL, ',
    'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, ',
    'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, ',
    'CONSTRAINT fk_ledger_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, ',
    'CONSTRAINT fk_ledger_entries_contact FOREIGN KEY (contact_id) REFERENCES ledger_contacts(id) ON DELETE CASCADE, ',
    'CONSTRAINT fk_ledger_entries_transaction FOREIGN KEY (converted_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL, ',
    'INDEX idx_ledger_entries_user_status_direction (user_id, status, direction), ',
    'INDEX idx_ledger_entries_contact_status (contact_id, status), ',
    'INDEX idx_ledger_entries_transaction (converted_transaction_id), ',
    'INDEX idx_ledger_entries_user_created (user_id, created_at)',
    ') ENGINE=InnoDB'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE user_settings
SET modules_json = JSON_MERGE_PATCH(
  JSON_OBJECT('businesses', TRUE, 'ledger', TRUE),
  COALESCE(modules_json, JSON_OBJECT())
)
WHERE modules_json IS NULL
   OR JSON_EXTRACT(modules_json, '$.businesses') IS NULL
   OR JSON_EXTRACT(modules_json, '$.ledger') IS NULL;
