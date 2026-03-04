<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('accounts_update', 200, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$input = Request::body();

$id = Validator::positiveInt($input['id'] ?? 0, 'id');
$name = Validator::string($input['name'] ?? '', 120);
$type = Validator::enum($input['type'] ?? '', ['cash', 'bank', 'upi', 'wallet', 'credit', 'people'], 'account type');
$currencyInput = Validator::string($input['currency'] ?? '', 10);
$isArchived = isset($input['is_archived']) ? (int) ((bool) $input['is_archived']) : 0;

if ($name === '') {
    Response::error('Account name is required.', 422);
}
if (array_key_exists('initial_balance', $input)) {
    Response::error('Opening balance cannot be edited directly. Use adjust opening balance action.', 422);
}

$existingStmt = db()->prepare(
    'SELECT id, currency
     FROM accounts
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$existingStmt->execute([':id' => $id, ':user_id' => (int) $user['id']]);
$existing = $existingStmt->fetch();
if (!$existing) {
    Response::error('Account not found.', 404);
}
$currency = $currencyInput !== '' ? strtoupper($currencyInput) : (string) $existing['currency'];

$stmt = db()->prepare(
    'UPDATE accounts
     SET name = :name,
         type = :type,
         currency = :currency,
         is_archived = :is_archived
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0'
);
$stmt->execute([
    ':name' => $name,
    ':type' => $type,
    ':currency' => $currency,
    ':is_archived' => $isArchived,
    ':id' => $id,
    ':user_id' => (int) $user['id'],
]);

$fetch = db()->prepare(
    'SELECT id, name, type, initial_balance, current_balance, currency, is_archived, created_at, updated_at
     FROM accounts
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$fetch->execute([':id' => $id, ':user_id' => (int) $user['id']]);

Response::success('Account updated.', [
    'account' => $fetch->fetch(),
]);
