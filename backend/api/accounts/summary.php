<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

$totalStmt = db()->prepare(
    'SELECT
        COALESCE(SUM(current_balance), 0) AS total_balance,
        COUNT(*) AS accounts_count
     FROM accounts
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND is_archived = 0'
);
$totalStmt->execute([':user_id' => $userId]);
$totals = $totalStmt->fetch() ?: ['total_balance' => 0, 'accounts_count' => 0];

$byTypeStmt = db()->prepare(
    'SELECT type, COALESCE(SUM(current_balance), 0) AS balance
     FROM accounts
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND is_archived = 0
     GROUP BY type
     ORDER BY balance DESC'
);
$byTypeStmt->execute([':user_id' => $userId]);
$byType = $byTypeStmt->fetchAll();

Response::success('Account summary fetched.', [
    'total_balance' => (float) $totals['total_balance'],
    'accounts_count' => (int) $totals['accounts_count'],
    'balance_by_type' => $byType,
]);
