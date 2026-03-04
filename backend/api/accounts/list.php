<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();

$includeArchived = (int) Request::query('include_archived', 0) === 1;

$sql = 'SELECT id, name, type, initial_balance, current_balance, currency, is_archived, created_at, updated_at
        FROM accounts
        WHERE user_id = :user_id
          AND is_deleted = 0';

if (!$includeArchived) {
    $sql .= ' AND is_archived = 0';
}
$sql .= ' ORDER BY created_at DESC';

$stmt = db()->prepare($sql);
$stmt->execute([':user_id' => (int) $user['id']]);
$accounts = $stmt->fetchAll();

Response::success('Accounts fetched.', [
    'accounts' => $accounts,
]);
