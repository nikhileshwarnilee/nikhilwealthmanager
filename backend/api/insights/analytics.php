<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);
$month = trim((string) Request::query('month', date('Y-m')));
$dateFromRaw = trim((string) Request::query('date_from', ''));
$dateToRaw = trim((string) Request::query('date_to', ''));
$businessId = Validator::nullablePositiveInt(Request::query('business_id', ''));
$createdByUserId = WorkspaceUserService::resolveTransactionCreatorFilter($user, Request::query('created_by_user_id', ''));

if ($month === '') {
    $month = date('Y-m');
}

$useCustomRange = $dateFromRaw !== '' || $dateToRaw !== '';
$period = $useCustomRange ? 'custom' : Validator::monthOrAll($month);
$rangeStart = null;
$rangeEnd = null;
$businessWhere = '';
$businessWhereT = '';
$businessJoinClause = '';
$businessParams = [];
$createdByWhere = '';
$createdByWhereT = '';
$createdByJoinClause = '';
$createdByParams = [];

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

if ($businessId !== null) {
    $businessWhere = ' AND business_id = :business_id';
    $businessWhereT = ' AND t.business_id = :business_id';
    $businessJoinClause = ' AND t.business_id = :business_id';
    $businessParams[':business_id'] = $businessId;
}

if ($createdByUserId !== null) {
    $createdByWhere = ' AND created_by_user_id = :created_by_user_id';
    $createdByWhereT = ' AND t.created_by_user_id = :created_by_user_id';
    $createdByJoinClause = ' AND t.created_by_user_id = :created_by_user_id';
    $createdByParams[':created_by_user_id'] = $createdByUserId;
}

$monthlyData = [];
if ($period === 'all') {
    $monthlyParams = [':user_id' => $userId];
    $monthlyStmt = db()->prepare(
        'SELECT
            DATE_FORMAT(transaction_date, \'%Y-%m\') AS month_key,
            COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense
         FROM transactions
         WHERE user_id = :user_id
           AND is_deleted = 0'
        . UserAccountAccessService::buildTransactionScopeSql(
            'transactions',
            $allowedAccountIds,
            $monthlyParams,
            'analytics_monthly_all',
            false
        )
        . $businessWhere . $createdByWhere . '
         GROUP BY DATE_FORMAT(transaction_date, \'%Y-%m\')
         ORDER BY month_key ASC'
    );
    $monthlyStmt->execute(array_merge($monthlyParams, $businessParams, $createdByParams));
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
    $monthlyParams = [
        ':user_id' => $userId,
        ':start_date' => $rangeStart,
        ':end_date' => $rangeEnd,
    ];
    $monthlyStmt = db()->prepare(
        'SELECT
            DATE_FORMAT(transaction_date, \'%Y-%m\') AS month_key,
            COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense
         FROM transactions
         WHERE user_id = :user_id
           AND is_deleted = 0'
        . UserAccountAccessService::buildTransactionScopeSql(
            'transactions',
            $allowedAccountIds,
            $monthlyParams,
            'analytics_monthly_custom',
            false
        )
        . $businessWhere . $createdByWhere . '
           AND transaction_date BETWEEN :start_date AND :end_date
         GROUP BY DATE_FORMAT(transaction_date, \'%Y-%m\')
         ORDER BY month_key ASC'
    );
    $monthlyStmt->execute(array_merge($monthlyParams, $businessParams, $createdByParams));
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

        $windowParams = [
            ':user_id' => $userId,
            ':start_date' => $start,
            ':end_date' => $end,
        ];
        $stmt = db()->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0'
            . UserAccountAccessService::buildTransactionScopeSql(
                'transactions',
                $allowedAccountIds,
                $windowParams,
                'analytics_monthly_window',
                false
            )
            . $businessWhere . $createdByWhere . '
               AND transaction_date BETWEEN :start_date AND :end_date'
        );
        $stmt->execute(array_merge($windowParams, $businessParams, $createdByParams));
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

$categoryParams = array_merge([
    ':user_id' => $userId,
], $dateParams, $businessParams, $createdByParams);
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
      AND t.type = \'expense\''
    . UserAccountAccessService::buildTransactionScopeSql(
        't',
        $allowedAccountIds,
        $categoryParams,
        'analytics_category_pie',
        false
    ) . $dateJoinClause . $businessJoinClause . $createdByJoinClause . '
     WHERE c.user_id = :user_id
       AND c.is_deleted = 0
       AND c.type = \'expense\'
     GROUP BY c.id, c.name, c.color
     HAVING total_spent > 0
     ORDER BY total_spent DESC';
$categoryStmt = db()->prepare($categorySql);
$categoryStmt->execute($categoryParams);
$categoryPie = $categoryStmt->fetchAll();

$trendStart = date('Y-m-d 00:00:00', strtotime('-29 days'));
$trendParams = [
    ':user_id' => $userId,
    ':trend_start' => $trendStart,
];
$trendStmt = db()->prepare(
    'SELECT
        DATE(transaction_date) AS day,
        COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense,
        COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND transaction_date >= :trend_start'
    . UserAccountAccessService::buildTransactionScopeSql(
        'transactions',
        $allowedAccountIds,
        $trendParams,
        'analytics_trend',
        false
    ) . $businessWhere . $createdByWhere . '
     GROUP BY DATE(transaction_date)
     ORDER BY day ASC'
);
$trendStmt->execute(array_merge($trendParams, $businessParams, $createdByParams));
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

$budget = BudgetService::vsActual($userId, $period === 'custom' ? 'all' : $period, $businessId, $allowedAccountIds);

$topParams = array_merge([
    ':user_id_c' => $userId,
    ':user_id_t' => $userId,
], $dateParams, $businessParams, $createdByParams);
$topSql = 'SELECT
        c.name AS category_name,
        COALESCE(SUM(t.amount), 0) AS total_spent
     FROM categories c
     INNER JOIN transactions t ON t.category_id = c.id AND t.is_deleted = 0
     WHERE c.user_id = :user_id_c
       AND c.is_deleted = 0
       AND t.user_id = :user_id_t
       AND t.type = \'expense\''
    . UserAccountAccessService::buildTransactionScopeSql(
        't',
        $allowedAccountIds,
        $topParams,
        'analytics_top_categories',
        false
    ) . $dateWhereClause . $businessWhereT . $createdByWhereT . '
     GROUP BY c.id, c.name
     ORDER BY total_spent DESC
     LIMIT 5';
$topStmt = db()->prepare($topSql);
$topStmt->execute($topParams);
$topCategories = $topStmt->fetchAll();

Response::success('Analytics fetched.', [
    'month' => $period,
    'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
    'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
    'business_id' => $businessId,
    'created_by_user_id' => $createdByUserId,
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
