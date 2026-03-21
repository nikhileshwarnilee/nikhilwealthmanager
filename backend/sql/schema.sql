CREATE DATABASE IF NOT EXISTS expense_manager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE expense_manager;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS budgets;
DROP TABLE IF EXISTS asset_value_history;
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS ledger_contacts;
DROP TABLE IF EXISTS asset_types;
DROP TABLE IF EXISTS businesses;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  role VARCHAR(30) NOT NULL DEFAULT 'user',
  permissions_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  deleted_at DATETIME NULL,
  workspace_owner_user_id BIGINT UNSIGNED NULL,
  allowed_account_ids_json JSON NULL,
  default_account_id BIGINT UNSIGNED NULL,
  transaction_access_json JSON NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE user_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  dark_mode TINYINT(1) NOT NULL DEFAULT 0,
  last_transaction_filters JSON NULL,
  modules_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_settings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('cash', 'bank', 'upi', 'wallet', 'credit', 'people') NOT NULL,
  initial_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_accounts_user (user_id),
  INDEX idx_accounts_user_type (user_id, type),
  INDEX idx_accounts_user_archived (user_id, is_archived),
  INDEX idx_accounts_user_deleted (user_id, is_deleted)
) ENGINE=InnoDB;

CREATE TABLE categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  icon VARCHAR(255) NULL,
  color VARCHAR(20) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_categories_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_categories_user_name_type_active (user_id, name, type, is_deleted),
  INDEX idx_categories_user_type (user_id, type),
  INDEX idx_categories_user_deleted (user_id, is_deleted),
  INDEX idx_categories_user_deleted_type (user_id, is_deleted, type),
  INDEX idx_categories_user_type_order (user_id, type, is_deleted, sort_order, id)
) ENGINE=InnoDB;

CREATE TABLE asset_types (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
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

CREATE TABLE businesses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  notes VARCHAR(255) NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_businesses_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_businesses_user_name_active (user_id, name, is_deleted),
  INDEX idx_businesses_user_deleted (user_id, is_deleted)
) ENGINE=InnoDB;

CREATE TABLE ledger_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  party_type ENUM('customer', 'supplier', 'both') NOT NULL DEFAULT 'customer',
  phone VARCHAR(40) NULL,
  email VARCHAR(150) NULL,
  notes VARCHAR(255) NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_contacts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_ledger_contacts_user_name_active (user_id, name, is_deleted),
  INDEX idx_ledger_contacts_user_deleted (user_id, is_deleted),
  INDEX idx_ledger_contacts_user_party (user_id, party_type, is_deleted)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  from_account_id BIGINT UNSIGNED NULL,
  to_account_id BIGINT UNSIGNED NULL,
  from_asset_type_id BIGINT UNSIGNED NULL,
  to_asset_type_id BIGINT UNSIGNED NULL,
  category_id BIGINT UNSIGNED NULL,
  business_id BIGINT UNSIGNED NULL,
  amount DECIMAL(14,2) NOT NULL,
  type ENUM('income', 'expense', 'transfer', 'opening_adjustment', 'asset') NOT NULL,
  running_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  reference_type VARCHAR(60) NULL,
  reference_id BIGINT UNSIGNED NULL,
  note VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  receipt_path VARCHAR(255) NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  transaction_date DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_transactions_from_account
    FOREIGN KEY (from_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_to_account
    FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_from_asset_type
    FOREIGN KEY (from_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_to_asset_type
    FOREIGN KEY (to_asset_type_id) REFERENCES asset_types(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_business
    FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL,
  INDEX idx_transactions_user_date (user_id, transaction_date),
  INDEX idx_transactions_user_type_date (user_id, type, transaction_date),
  INDEX idx_transactions_user_category (user_id, category_id),
  INDEX idx_transactions_user_business (user_id, business_id),
  INDEX idx_transactions_user_from (user_id, from_account_id),
  INDEX idx_transactions_user_to (user_id, to_account_id),
  INDEX idx_transactions_user_from_asset (user_id, from_asset_type_id),
  INDEX idx_transactions_user_to_asset (user_id, to_asset_type_id),
  INDEX idx_transactions_user_created_by_date (user_id, created_by_user_id, transaction_date),
  INDEX idx_transactions_user_deleted_date (user_id, is_deleted, transaction_date),
  INDEX idx_transactions_user_deleted_type_category_date (user_id, is_deleted, type, category_id, transaction_date),
  INDEX idx_transactions_user_deleted_business_date (user_id, is_deleted, business_id, transaction_date),
  INDEX idx_transactions_reference (reference_type, reference_id)
) ENGINE=InnoDB;

CREATE TABLE ledger_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  contact_id BIGINT UNSIGNED NOT NULL,
  direction ENUM('receivable', 'payable') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  note VARCHAR(255) NULL,
  attachment_path VARCHAR(255) NULL,
  status ENUM('open', 'converted', 'cancelled') NOT NULL DEFAULT 'open',
  converted_transaction_id BIGINT UNSIGNED NULL,
  converted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_entries_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_entries_contact
    FOREIGN KEY (contact_id) REFERENCES ledger_contacts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ledger_entries_transaction
    FOREIGN KEY (converted_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
  INDEX idx_ledger_entries_user_status_direction (user_id, status, direction),
  INDEX idx_ledger_entries_contact_status (contact_id, status),
  INDEX idx_ledger_entries_transaction (converted_transaction_id),
  INDEX idx_ledger_entries_user_created (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE asset_value_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  asset_type_id BIGINT UNSIGNED NOT NULL,
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

CREATE TABLE budgets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  month CHAR(7) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_budgets_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_budgets_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE KEY uq_budgets_user_category_month (user_id, category_id, month),
  INDEX idx_budgets_user_month (user_id, month)
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(255) NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_tokens_user (user_id),
  INDEX idx_refresh_tokens_expires (expires_at),
  INDEX idx_refresh_tokens_revoked (revoked_at)
) ENGINE=InnoDB;

CREATE TABLE password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_password_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_password_reset_user (user_id),
  INDEX idx_password_reset_expires (expires_at),
  INDEX idx_password_reset_used (used_at)
) ENGINE=InnoDB;

INSERT INTO users (id, name, email, password_hash) VALUES
  (1, 'Demo User', 'demo@example.com', '$2y$10$WESO4SSCYrnZZP6nQ.xhSecI3wEOnTlSnOdOLJ3g5dETL.V4l1vTy');

INSERT INTO user_settings (user_id, currency, dark_mode, last_transaction_filters, modules_json) VALUES
  (
    1,
    'INR',
    0,
    JSON_OBJECT('type', '', 'account_id', '', 'asset_type_id', '', 'business_id', '', 'category_id', '', 'search', '', 'date_from', '', 'date_to', ''),
    JSON_OBJECT('businesses', TRUE, 'ledger', TRUE, 'assets', TRUE, 'users_access', TRUE)
  );

INSERT INTO accounts (id, user_id, name, type, initial_balance, current_balance, currency, is_archived) VALUES
  (1, 1, 'Cash Wallet', 'cash', 5000.00, 5000.00, 'INR', 0),
  (2, 1, 'HDFC Bank', 'bank', 0.00, 36500.00, 'INR', 0),
  (3, 1, 'PhonePe UPI', 'upi', 0.00, 11800.00, 'INR', 0),
  (4, 1, 'Travel Wallet', 'wallet', 2500.00, 2500.00, 'INR', 0);

INSERT INTO categories (id, user_id, name, type, icon, color, is_default, sort_order) VALUES
  (1, 1, 'Salary', 'income', 'wallet', '#16a34a', 1, 1),
  (2, 1, 'Freelance', 'income', 'briefcase', '#0ea5e9', 1, 2),
  (3, 1, 'Food', 'expense', 'utensils', '#f97316', 1, 1),
  (4, 1, 'Transport', 'expense', 'car', '#0ea5e9', 1, 2),
  (5, 1, 'Shopping', 'expense', 'bag', '#d946ef', 1, 3),
  (6, 1, 'Utilities', 'expense', 'bolt', '#f59e0b', 1, 4),
  (7, 1, 'Health', 'expense', 'heart', '#ef4444', 1, 5);

INSERT INTO asset_types (id, user_id, name, icon, color, notes, current_value, is_deleted) VALUES
  (1, 1, 'Gold', 'gold', '#D97706', 'Physical and digital gold holdings', 0.00, 0),
  (2, 1, 'Stocks', 'stocks', '#2563EB', 'Listed equity holdings', 0.00, 0),
  (3, 1, 'Mutual Funds', 'mutual', '#0EA5E9', 'SIP and lump sum mutual fund investments', 0.00, 0),
  (4, 1, 'Fixed Deposit', 'deposit', '#16A34A', 'Bank fixed deposits', 0.00, 0),
  (5, 1, 'Crypto', 'crypto', '#7C3AED', 'Digital asset holdings', 0.00, 0);

INSERT INTO budgets (id, user_id, category_id, month, amount) VALUES
  (1, 1, 3, DATE_FORMAT(CURRENT_DATE(), '%Y-%m'), 10000.00),
  (2, 1, 4, DATE_FORMAT(CURRENT_DATE(), '%Y-%m'), 5000.00),
  (3, 1, 5, DATE_FORMAT(CURRENT_DATE(), '%Y-%m'), 4000.00),
  (4, 1, 6, DATE_FORMAT(CURRENT_DATE(), '%Y-%m'), 3500.00);

INSERT INTO transactions (
  id, user_id, from_account_id, to_account_id, category_id, amount, type, running_balance,
  reference_type, reference_id, note, transaction_date
) VALUES
  (1, 1, NULL, 2, 1, 50000.00, 'income', 50000.00, 'manual', NULL, 'Monthly salary credit', DATE_SUB(NOW(), INTERVAL 25 DAY)),
  (2, 1, 2, NULL, 3, 2500.00, 'expense', 47500.00, 'manual', NULL, 'Groceries and dining', DATE_SUB(NOW(), INTERVAL 20 DAY)),
  (3, 1, 2, 3, NULL, 5000.00, 'transfer', 42500.00, 'manual', NULL, 'Transfer to UPI', DATE_SUB(NOW(), INTERVAL 14 DAY)),
  (4, 1, 3, NULL, 4, 1200.00, 'expense', 3800.00, 'manual', NULL, 'Cab and metro', DATE_SUB(NOW(), INTERVAL 11 DAY)),
  (5, 1, NULL, 3, 2, 8000.00, 'income', 11800.00, 'manual', NULL, 'Freelance payout', DATE_SUB(NOW(), INTERVAL 8 DAY)),
  (6, 1, 2, NULL, 5, 6000.00, 'expense', 36500.00, 'manual', NULL, 'Festival shopping', DATE_SUB(NOW(), INTERVAL 5 DAY));

ALTER TABLE users AUTO_INCREMENT = 2;
ALTER TABLE accounts AUTO_INCREMENT = 5;
ALTER TABLE categories AUTO_INCREMENT = 8;
ALTER TABLE transactions AUTO_INCREMENT = 7;
ALTER TABLE budgets AUTO_INCREMENT = 5;
ALTER TABLE asset_types AUTO_INCREMENT = 6;
