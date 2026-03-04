<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];
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

$monthlyData = [];
if ($period === 'all') {
    $monthlyStmt = db()->prepare(
        'SELECT
            DATE_FORMAT(transaction_date, \'%Y-%m\') AS month_key,
            COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense
         FROM transactions
         WHERE user_id = :user_id
           AND is_deleted = 0
         GROUP BY DATE_FORMAT(transaction_date, \'%Y-%m\')
         ORDER BY month_key ASC'
    );
    $monthlyStmt->execute([':user_id' => $userId]);
    $rows = $monthlyStmt->fetchAll();
    foreach ($rows as $row) {
        $m = (string) $row['month_key'];
        $monthlyData[] = [
            'month' => $m,
            'label' => date('M y', strtotime($m . '-01')),
            'income' => round((float) $row['income'], 2),
            'expense' => round((float) $row['expense'], 2),
        ];
    }
} elseif ($period === 'custom') {
    $monthlyStmt = db()->prepare(
        'SELECT
            DATE_FORMAT(transaction_date, \'%Y-%m\') AS month_key,
            COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense
         FROM transactions
         WHERE user_id = :user_id
           AND is_deleted = 0
           AND transaction_date BETWEEN :start_date AND :end_date
         GROUP BY DATE_FORMAT(transaction_date, \'%Y-%m\')
         ORDER BY month_key ASC'
    );
    $monthlyStmt->execute([
        ':user_id' => $userId,
        ':start_date' => $rangeStart,
        ':end_date' => $rangeEnd,
    ]);
    $rows = $monthlyStmt->fetchAll();
    foreach ($rows as $row) {
        $m = (string) $row['month_key'];
        $monthlyData[] = [
            'month' => $m,
            'label' => date('M y', strtotime($m . '-01')),
            'income' => round((float) $row['income'], 2),
            'expense' => round((float) $row['expense'], 2),
        ];
    }
} else {
    for ($i = 5; $i >= 0; $i--) {
        $m = date('Y-m', strtotime($period . '-01 -' . $i . ' month'));
        $start = $m . '-01 00:00:00';
        $end = date('Y-m-t 23:59:59', strtotime($start));

        $stmt = db()->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND transaction_date BETWEEN :start_date AND :end_date'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':start_date' => $start,
            ':end_date' => $end,
        ]);
        $row = $stmt->fetch() ?: ['income' => 0, 'expense' => 0];

        $monthlyData[] = [
            'month' => $m,
            'label' => date('M y', strtotime($m . '-01')),
            'income' => round((float) $row['income'], 2),
            'expense' => round((float) $row['expense'], 2),
        ];
    }
}

$dateJoinClause = '';
$dateWhereClause = '';
$dateParams = [];
if ($rangeStart !== null && $rangeEnd !== null) {
    $dateJoinClause = ' AND t.transaction_date BETWEEN :start_date AND :end_date';
    $dateWhereClause = ' AND t.transaction_date BETWEEN :start_date AND :end_date';
    $dateParams[':start_date'] = $rangeStart;
    $dateParams[':end_date'] = $rangeEnd;
}

$categorySql = 'SELECT
        c.id AS category_id,
        c.name AS category_name,
        COALESCE(c.color, \'#7c3aed\') AS category_color,
        COALESCE(SUM(t.amount), 0) AS total_spent
     FROM categories c
     LEFT JOIN transactions t
       ON t.category_id = c.id
      AND t.user_id = c.user_id
      AND t.is_deleted = 0
      AND t.type = \'expense\'' . $dateJoinClause . '
     WHERE c.user_id = :user_id
       AND c.is_deleted = 0
       AND c.type = \'expense\'
     GROUP BY c.id, c.name, c.color
     HAVING total_spent > 0
     ORDER BY total_spent DESC';
$categoryStmt = db()->prepare($categorySql);
$categoryStmt->execute(array_merge($dateParams, [
    ':user_id' => $userId,
]));
$categoryPie = $categoryStmt->fetchAll();

$trendStart = date('Y-m-d 00:00:00', strtotime('-29 days'));
$trendStmt = db()->prepare(
    'SELECT
        DATE(transaction_date) AS day,
        COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense,
        COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND transaction_date >= :trend_start
     GROUP BY DATE(transaction_date)
     ORDER BY day ASC'
);
$trendStmt->execute([
    ':user_id' => $userId,
    ':trend_start' => $trendStart,
]);
$rawTrend = $trendStmt->fetchAll();

$trendMap = [];
foreach ($rawTrend as $row) {
    $trendMap[$row['day']] = $row;
}

$dailyTrend = [];
for ($d = 29; $d >= 0; $d--) {
    $day = date('Y-m-d', strtotime("-{$d} days"));
    $row = $trendMap[$day] ?? ['income' => 0, 'expense' => 0];
    $dailyTrend[] = [
        'day' => $day,
        'label' => date('d M', strtotime($day)),
        'income' => round((float) $row['income'], 2),
        'expense' => round((float) $row['expense'], 2),
    ];
}

$budget = BudgetService::vsActual($userId, $period === 'custom' ? 'all' : $period);

$topSql = 'SELECT
        c.name AS category_name,
        COALESCE(SUM(t.amount), 0) AS total_spent
     FROM categories c
     INNER JOIN transactions t ON t.category_id = c.id AND t.is_deleted = 0
     WHERE c.user_id = :user_id_c
       AND c.is_deleted = 0
       AND t.user_id = :user_id_t
       AND t.type = \'expense\'' . $dateWhereClause . '
     GROUP BY c.id, c.name
     ORDER BY total_spent DESC
     LIMIT 5';
$topStmt = db()->prepare($topSql);
$topStmt->execute(array_merge([
    ':user_id_c' => $userId,
    ':user_id_t' => $userId,
], $dateParams));
$topCategories = $topStmt->fetchAll();

Response::success('Analytics fetched.', [
    'month' => $period,
    'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
    'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
    'monthly_bar' => $monthlyData,
    'category_pie' => $categoryPie,
    'daily_trend_30d' => $dailyTrend,
    'budget_utilization' => [
        'total_budget' => $budget['total_budget'],
        'total_spent' => $budget['total_spent'],
        'total_remaining' => $budget['total_remaining'],
        'total_utilization_percent' => $budget['total_utilization_percent'],
    ],
    'top_spending_categories' => $topCategories,
]);
