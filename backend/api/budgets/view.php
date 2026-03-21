<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);
$id = Validator::positiveInt(Request::query('id', 0), 'id');

$budgetStmt = db()->prepare(
    'SELECT
        b.id,
        b.category_id,
        b.month,
        b.amount,
        b.created_at,
        b.updated_at,
        c.name AS category_name,
        c.icon AS category_icon,
        c.type AS category_type
     FROM budgets b
     INNER JOIN categories c
       ON c.id = b.category_id
      AND c.user_id = b.user_id
      AND c.is_deleted = 0
     WHERE b.id = :id
       AND b.user_id = :user_id
     LIMIT 1'
);
$budgetStmt->execute([
    ':id' => $id,
    ':user_id' => $userId,
]);
$budget = $budgetStmt->fetch();

if (!$budget) {
    Response::error('Budget not found.', 404);
}

$monthStart = (string) $budget['month'] . '-01 00:00:00';
$monthEnd = date('Y-m-t 23:59:59', strtotime($monthStart));

$spentParams = [
    ':spent_user_id' => $userId,
    ':spent_category_id' => (int) $budget['category_id'],
    ':spent_start' => $monthStart,
    ':spent_end' => $monthEnd,
];
$spentScopeSql = UserAccountAccessService::buildTransactionScopeSql('t', $allowedAccountIds, $spentParams, 'budget_view_spent', false);
$spentStmt = db()->prepare(
    'SELECT COALESCE(SUM(t.amount), 0) AS spent_amount
     FROM transactions t
     WHERE t.user_id = :spent_user_id
       AND t.is_deleted = 0
       AND t.type = \'expense\'
       AND t.category_id = :spent_category_id
       AND t.transaction_date BETWEEN :spent_start AND :spent_end' . $spentScopeSql
);
$spentStmt->execute($spentParams);
$spentAmount = (float) (($spentStmt->fetch()['spent_amount'] ?? 0));

$linkedParams = [
    ':tx_user_id' => $userId,
    ':tx_category_id' => (int) $budget['category_id'],
    ':tx_start' => $monthStart,
    ':tx_end' => $monthEnd,
];
$linkedScopeSql = UserAccountAccessService::buildTransactionScopeSql('t', $allowedAccountIds, $linkedParams, 'budget_view_tx', false);
$transactionsStmt = db()->prepare(
    'SELECT
        t.id,
        t.type,
        t.amount,
        t.note,
        t.transaction_date,
        fa.name AS from_account_name,
        ta.name AS to_account_name,
        c.name AS category_name,
        c.icon AS category_icon,
        c.color AS category_color,
        c.type AS category_type
     FROM transactions t
     LEFT JOIN accounts fa
       ON fa.id = t.from_account_id
      AND fa.user_id = t.user_id
      AND fa.is_deleted = 0
     LEFT JOIN accounts ta
       ON ta.id = t.to_account_id
      AND ta.user_id = t.user_id
      AND ta.is_deleted = 0
     LEFT JOIN categories c
       ON c.id = t.category_id
      AND c.user_id = t.user_id
      AND c.is_deleted = 0
     WHERE t.user_id = :tx_user_id
       AND t.is_deleted = 0
       AND t.type = \'expense\'
       AND t.category_id = :tx_category_id
       AND t.transaction_date BETWEEN :tx_start AND :tx_end' . $linkedScopeSql . '
     ORDER BY t.transaction_date DESC, t.id DESC'
);
$transactionsStmt->execute($linkedParams);
$linkedTransactions = $transactionsStmt->fetchAll();

$budgetAmount = (float) $budget['amount'];
$remainingAmount = round($budgetAmount - $spentAmount, 2);
$utilization = $budgetAmount > 0
    ? round(($spentAmount / $budgetAmount) * 100, 2)
    : 0.0;

Response::success('Budget view fetched.', [
    'budget' => [
        'id' => (int) $budget['id'],
        'category' => [
            'id' => (int) $budget['category_id'],
            'name' => (string) $budget['category_name'],
            'icon' => $budget['category_icon'] ?: null,
            'type' => (string) $budget['category_type'],
        ],
        'month' => (string) $budget['month'],
        'budget_amount' => $budgetAmount,
        'spent_amount' => round($spentAmount, 2),
        'remaining_amount' => $remainingAmount,
        'utilization_percentage' => $utilization,
        'linked_transactions' => $linkedTransactions,
        'created_at' => (string) $budget['created_at'],
        'updated_at' => (string) $budget['updated_at'],
    ],
]);
