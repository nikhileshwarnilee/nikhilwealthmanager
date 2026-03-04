<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('accounts_create', 120, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();

$input = Request::body();
$name = Validator::string($input['name'] ?? '', 120);
$type = Validator::enum($input['type'] ?? '', ['cash', 'bank', 'upi', 'wallet', 'credit', 'people'], 'account type');
$initialBalanceRaw = $input['initial_balance'] ?? 0;
$currency = strtoupper(Validator::string($input['currency'] ?? 'INR', 10));

if ($name === '') {
    Response::error('Account name is required.', 422);
}
if (!is_numeric($initialBalanceRaw)) {
    Response::error('initial_balance must be numeric.', 422);
}
$initialBalance = round((float) $initialBalanceRaw, 2);
if ($currency === '') {
    $currency = 'INR';
}

$stmt = db()->prepare(
    'INSERT INTO accounts (user_id, name, type, initial_balance, current_balance, currency)
     VALUES (:user_id, :name, :type, :initial_balance, :current_balance, :currency)'
);
$stmt->execute([
    ':user_id' => (int) $user['id'],
    ':name' => $name,
    ':type' => $type,
    ':initial_balance' => $initialBalance,
    ':current_balance' => $initialBalance,
    ':currency' => $currency,
]);

$id = (int) db()->lastInsertId();
$fetch = db()->prepare(
    'SELECT id, name, type, initial_balance, current_balance, currency, is_archived, created_at, updated_at
     FROM accounts
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$fetch->execute([':id' => $id, ':user_id' => (int) $user['id']]);

Response::success('Account created.', [
    'account' => $fetch->fetch(),
], 201);
