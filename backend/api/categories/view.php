<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$id = Validator::positiveInt(Request::query('id', 0), 'id');
$month = trim((string) Request::query('month', date('Y-m')));
$dateFromRaw = trim((string) Request::query('date_from', ''));
$dateToRaw = trim((string) Request::query('date_to', ''));

if ($month === '') {
    $month = date('Y-m');
}

$useCustomRange = $dateFromRaw !== '' || $dateToRaw !== '';
$period = $useCustomRange ? 'custom' : Validator::monthOrAll($month);

$rangeStart = null;
$rangeEnd = null;
if ($useCustomRange) {
    if ($dateFromRaw === '' || $dateToRaw === '') {
        Response::error('Both date_from and date_to are required for custom interval.', 422);
    }

    $fromDate = Validator::dateTime($dateFromRaw, false);
    $toDate = Validator::dateTime($dateToRaw, false);
    $rangeStart = date('Y-m-d 00:00:00', strtotime((string) $fromDate));
    $rangeEnd = date('Y-m-d 23:59:59', strtotime((string) $toDate));

    if (strtotime($rangeStart) > strtotime($rangeEnd)) {
        Response::error('date_from must be before or equal to date_to.', 422);
    }
} elseif ($period !== 'all') {
    $rangeStart = $period . '-01 00:00:00';
    $rangeEnd = date('Y-m-t 23:59:59', strtotime($rangeStart));
}

$categoryStmt = db()->prepare(
    'SELECT id, name, icon, color, type, created_at
     FROM categories
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$categoryStmt->execute([
    ':id' => $id,
    ':user_id' => $userId,
]);
$category = $categoryStmt->fetch();

if (!$category) {
    Response::error('Category not found.', 404);
}

$statsSql = 'SELECT
        COUNT(*) AS total_transactions,
        COALESCE(SUM(amount), 0) AS total_amount
     FROM transactions
     WHERE user_id = :stats_user_id
       AND is_deleted = 0
       AND category_id = :stats_category_id';
$statsParams = [
    ':stats_user_id' => $userId,
    ':stats_category_id' => $id,
];
if ($rangeStart !== null && $rangeEnd !== null) {
    $statsSql .= ' AND transaction_date BETWEEN :stats_start_date AND :stats_end_date';
    $statsParams[':stats_start_date'] = $rangeStart;
    $statsParams[':stats_end_date'] = $rangeEnd;
}

$statsStmt = db()->prepare($statsSql);
$statsStmt->execute($statsParams);
$stats = $statsStmt->fetch() ?: ['total_transactions' => 0, 'total_amount' => 0];

if ($period === 'all') {
    $budgetStmt = db()->prepare(
        'SELECT
            NULL AS id,
            \'all\' AS month,
            COALESCE(SUM(amount), 0) AS amount,
            COUNT(*) AS budget_count
         FROM budgets
         WHERE user_id = :budget_user_id
           AND category_id = :budget_category_id'
    );
    $budgetStmt->execute([
        ':budget_user_id' => $userId,
        ':budget_category_id' => $id,
    ]);
    $budgetRow = $budgetStmt->fetch();
    $budget = ($budgetRow && (int) ($budgetRow['budget_count'] ?? 0) > 0) ? $budgetRow : null;
} elseif ($period === 'custom') {
    $startMonth = date('Y-m', strtotime((string) $rangeStart));
    $endMonth = date('Y-m', strtotime((string) $rangeEnd));
    $budgetStmt = db()->prepare(
        'SELECT
            NULL AS id,
            \'custom\' AS month,
            COALESCE(SUM(amount), 0) AS amount,
            COUNT(*) AS budget_count
         FROM budgets
         WHERE user_id = :budget_user_id
           AND category_id = :budget_category_id
           AND month BETWEEN :start_month AND :end_month'
    );
    $budgetStmt->execute([
        ':budget_user_id' => $userId,
        ':budget_category_id' => $id,
        ':start_month' => $startMonth,
        ':end_month' => $endMonth,
    ]);
    $budgetRow = $budgetStmt->fetch();
    $budget = ($budgetRow && (int) ($budgetRow['budget_count'] ?? 0) > 0) ? $budgetRow : null;
} else {
    $budgetStmt = db()->prepare(
        'SELECT id, month, amount
         FROM budgets
         WHERE user_id = :budget_user_id
           AND category_id = :budget_category_id
           AND month = :budget_month
         LIMIT 1'
    );
    $budgetStmt->execute([
        ':budget_user_id' => $userId,
        ':budget_category_id' => $id,
        ':budget_month' => $period,
    ]);
    $budget = $budgetStmt->fetch();
}

Response::success('Category view fetched.', [
    'category' => [
        'id' => (int) $category['id'],
        'name' => (string) $category['name'],
        'icon' => $category['icon'] ?: null,
        'color' => $category['color'] ?: null,
        'type' => (string) $category['type'],
        'month' => $period,
        'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
        'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
        'total_transactions' => (int) ($stats['total_transactions'] ?? 0),
        'total_amount' => (float) ($stats['total_amount'] ?? 0),
        'linked_budget' => $budget
            ? [
                'id' => isset($budget['id']) ? (int) $budget['id'] : null,
                'month' => (string) $budget['month'],
                'amount' => (float) $budget['amount'],
            ]
            : null,
        'created_at' => (string) $category['created_at'],
    ],
]);
