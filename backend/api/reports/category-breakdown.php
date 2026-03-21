<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);
$categoryId = Validator::positiveInt(Request::query('category_id', 0), 'category_id');
$month = trim((string) Request::query('month', date('Y-m')));
$dateFromRaw = trim((string) Request::query('date_from', ''));
$dateToRaw = trim((string) Request::query('date_to', ''));
$type = Validator::enum(Request::query('type', 'expense'), ['income', 'expense'], 'type');
$businessId = Validator::nullablePositiveInt(Request::query('business_id', ''));
$createdByUserId = WorkspaceUserService::resolveTransactionCreatorFilter($user, Request::query('created_by_user_id', ''));

$month = $month === '' ? date('Y-m') : $month;
$useCustomRange = $dateFromRaw !== '' || $dateToRaw !== '';
$period = $useCustomRange ? 'custom' : Validator::monthOrAll($month);

$daysInMonth = null;
$dateFilter = '';
$dateParams = [];
$rangeStart = null;
$rangeEnd = null;
$businessFilter = '';
$businessParams = [];
$createdByFilter = '';
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

    $dateFilter = ' AND transaction_date BETWEEN :start_date AND :end_date';
    $dateParams[':start_date'] = $rangeStart;
    $dateParams[':end_date'] = $rangeEnd;
} elseif ($period !== 'all') {
    $rangeStart = $period . '-01 00:00:00';
    $rangeEnd = date('Y-m-t 23:59:59', strtotime($rangeStart));
    $daysInMonth = (int) date('t', strtotime($period . '-01'));
    $dateFilter = ' AND transaction_date BETWEEN :start_date AND :end_date';
    $dateParams[':start_date'] = $rangeStart;
    $dateParams[':end_date'] = $rangeEnd;
}

if ($businessId !== null) {
    $businessFilter = ' AND business_id = :business_id';
    $businessParams[':business_id'] = $businessId;
}

if ($createdByUserId !== null) {
    $createdByFilter = ' AND created_by_user_id = :created_by_user_id';
    $createdByParams[':created_by_user_id'] = $createdByUserId;
}

$categoryStmt = db()->prepare(
    'SELECT id, name, icon, color, type
     FROM categories
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
       AND type = :type
     LIMIT 1'
);
$categoryStmt->execute([
    ':id' => $categoryId,
    ':user_id' => $userId,
    ':type' => $type,
]);
$category = $categoryStmt->fetch();

if (!$category) {
    Response::error('Category not found for requested type.', 404);
}

$summarySql = 'SELECT
        COALESCE(SUM(amount), 0) AS total_amount,
        COUNT(*) AS transaction_count,
        COALESCE(AVG(amount), 0) AS avg_amount
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND category_id = :category_id
       AND type = :type';
$summaryParams = [
    ':user_id' => $userId,
    ':category_id' => $categoryId,
    ':type' => $type,
];
$summarySql .= UserAccountAccessService::buildTransactionScopeSql(
    'transactions',
    $allowedAccountIds,
    $summaryParams,
    'report_category_breakdown_summary',
    false
) . $dateFilter . $businessFilter . $createdByFilter;
$summaryStmt = db()->prepare($summarySql);
$summaryStmt->execute(array_merge($summaryParams, $dateParams, $businessParams, $createdByParams));
$summary = $summaryStmt->fetch() ?: ['total_amount' => 0, 'transaction_count' => 0, 'avg_amount' => 0];

$dailySql = 'SELECT
        DATE(transaction_date) AS day,
        COALESCE(SUM(amount), 0) AS total_amount,
        COUNT(*) AS tx_count
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND category_id = :category_id
       AND type = :type';
$dailyParams = [
    ':user_id' => $userId,
    ':category_id' => $categoryId,
    ':type' => $type,
];
$dailySql .= UserAccountAccessService::buildTransactionScopeSql(
    'transactions',
    $allowedAccountIds,
    $dailyParams,
    'report_category_breakdown_daily',
    false
) . $dateFilter . $businessFilter . $createdByFilter . '
     GROUP BY DATE(transaction_date)
     ORDER BY day ASC';
$dailyStmt = db()->prepare($dailySql);
$dailyStmt->execute(array_merge($dailyParams, $dateParams, $businessParams, $createdByParams));
$dailyRows = $dailyStmt->fetchAll();

$dailyBreakdown = [];
$busiestDay = null;
$busiestCount = 0;
$busiestAmount = 0.0;

if ($period === 'all') {
    foreach ($dailyRows as $row) {
        $day = (string) $row['day'];
        $count = (int) $row['tx_count'];
        $amount = round((float) $row['total_amount'], 2);

        $dailyBreakdown[] = [
            'date' => $day,
            'day' => (int) date('d', strtotime($day)),
            'label' => date('d M', strtotime($day)),
            'amount' => $amount,
            'count' => $count,
        ];

        if ($count > $busiestCount || ($count === $busiestCount && $amount > $busiestAmount)) {
            $busiestCount = $count;
            $busiestAmount = $amount;
            $busiestDay = $count > 0
                ? [
                    'date' => $day,
                    'transaction_count' => $count,
                    'total_amount' => $amount,
                ]
                : null;
        }
    }
} elseif ($period === 'custom') {
    $dailyMap = [];
    foreach ($dailyRows as $row) {
        $dailyMap[(string) $row['day']] = [
            'amount' => round((float) $row['total_amount'], 2),
            'count' => (int) $row['tx_count'],
        ];
    }

    $cursor = strtotime(date('Y-m-d', strtotime((string) $rangeStart)));
    $endCursor = strtotime(date('Y-m-d', strtotime((string) $rangeEnd)));

    while ($cursor !== false && $endCursor !== false && $cursor <= $endCursor) {
        $dateKey = date('Y-m-d', $cursor);
        $daily = $dailyMap[$dateKey] ?? ['amount' => 0.0, 'count' => 0];

        $dailyBreakdown[] = [
            'date' => $dateKey,
            'day' => (int) date('d', $cursor),
            'label' => date('d M', $cursor),
            'amount' => (float) $daily['amount'],
            'count' => (int) $daily['count'],
        ];

        if (
            (int) $daily['count'] > $busiestCount
            || ((int) $daily['count'] === $busiestCount && (float) $daily['amount'] > $busiestAmount)
        ) {
            $busiestCount = (int) $daily['count'];
            $busiestAmount = (float) $daily['amount'];
            $busiestDay = $busiestCount > 0
                ? [
                    'date' => $dateKey,
                    'transaction_count' => $busiestCount,
                    'total_amount' => round($busiestAmount, 2),
                ]
                : null;
        }

        $nextCursor = strtotime('+1 day', $cursor);
        if ($nextCursor === false) {
            break;
        }
        $cursor = $nextCursor;
    }
} else {
    $dailyMap = [];
    foreach ($dailyRows as $row) {
        $dailyMap[(string) $row['day']] = [
            'amount' => round((float) $row['total_amount'], 2),
            'count' => (int) $row['tx_count'],
        ];
    }

    for ($day = 1; $day <= (int) $daysInMonth; $day++) {
        $dayValue = str_pad((string) $day, 2, '0', STR_PAD_LEFT);
        $dateKey = $period . '-' . $dayValue;
        $daily = $dailyMap[$dateKey] ?? ['amount' => 0.0, 'count' => 0];

        $dailyBreakdown[] = [
            'date' => $dateKey,
            'day' => $day,
            'label' => $dayValue,
            'amount' => (float) $daily['amount'],
            'count' => (int) $daily['count'],
        ];

        if (
            (int) $daily['count'] > $busiestCount
            || ((int) $daily['count'] === $busiestCount && (float) $daily['amount'] > $busiestAmount)
        ) {
            $busiestCount = (int) $daily['count'];
            $busiestAmount = (float) $daily['amount'];
            $busiestDay = $busiestCount > 0
                ? [
                    'date' => $dateKey,
                    'transaction_count' => $busiestCount,
                    'total_amount' => round($busiestAmount, 2),
                ]
                : null;
        }
    }
}

$biggestSql = 'SELECT
        t.id,
        t.amount,
        t.note,
        t.transaction_date,
        t.business_id,
        t.created_by_user_id,
        fa.name AS from_account_name,
        ta.name AS to_account_name,
        b.name AS business_name,
        creator.name AS created_by_name
     FROM transactions t
     LEFT JOIN accounts fa
       ON fa.id = t.from_account_id
      AND fa.user_id = t.user_id
      AND fa.is_deleted = 0
     LEFT JOIN accounts ta
       ON ta.id = t.to_account_id
      AND ta.user_id = t.user_id
      AND ta.is_deleted = 0
     LEFT JOIN businesses b
       ON b.id = t.business_id
      AND b.user_id = t.user_id
      AND b.is_deleted = 0
     LEFT JOIN users creator
       ON creator.id = t.created_by_user_id
     WHERE t.user_id = :user_id
       AND t.is_deleted = 0
       AND t.category_id = :category_id
       AND t.type = :type';
$biggestParams = [
    ':user_id' => $userId,
    ':category_id' => $categoryId,
    ':type' => $type,
];
$biggestSql .= UserAccountAccessService::buildTransactionScopeSql(
    't',
    $allowedAccountIds,
    $biggestParams,
    'report_category_breakdown_biggest',
    false
) . $dateFilter . $businessFilter . $createdByFilter . '
     ORDER BY t.amount DESC, t.transaction_date DESC, t.id DESC
     LIMIT 1';
$biggestStmt = db()->prepare($biggestSql);
$biggestStmt->execute(array_merge($biggestParams, $dateParams, $businessParams, $createdByParams));
$biggestRow = $biggestStmt->fetch();

$transactionsSql = 'SELECT
        t.id,
        t.type,
        t.amount,
        t.note,
        t.location,
        t.receipt_path,
        t.transaction_date,
        t.business_id,
        t.created_by_user_id,
        fa.name AS from_account_name,
        ta.name AS to_account_name,
        b.name AS business_name,
        creator.name AS created_by_name,
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
     LEFT JOIN businesses b
       ON b.id = t.business_id
      AND b.user_id = t.user_id
      AND b.is_deleted = 0
     LEFT JOIN users creator
       ON creator.id = t.created_by_user_id
     INNER JOIN categories c
       ON c.id = t.category_id
      AND c.user_id = t.user_id
      AND c.is_deleted = 0
     WHERE t.user_id = :user_id
       AND t.is_deleted = 0
       AND t.category_id = :category_id
       AND t.type = :type';
$transactionsParams = [
    ':user_id' => $userId,
    ':category_id' => $categoryId,
    ':type' => $type,
];
$transactionsSql .= UserAccountAccessService::buildTransactionScopeSql(
    't',
    $allowedAccountIds,
    $transactionsParams,
    'report_category_breakdown_transactions',
    false
) . $dateFilter . $businessFilter . $createdByFilter . '
     ORDER BY t.transaction_date DESC, t.id DESC';
$transactionsStmt = db()->prepare($transactionsSql);
$transactionsStmt->execute(array_merge($transactionsParams, $dateParams, $businessParams, $createdByParams));
$transactions = $transactionsStmt->fetchAll();

$formattedTransactions = [];
foreach ($transactions as $txn) {
    $txn['id'] = (int) $txn['id'];
    $txn['amount'] = (float) $txn['amount'];
    $formattedTransactions[] = $txn;
}

$biggestTransaction = null;
if ($biggestRow) {
    $biggestTransaction = [
        'id' => (int) $biggestRow['id'],
        'amount' => (float) $biggestRow['amount'],
        'note' => $biggestRow['note'] !== null ? (string) $biggestRow['note'] : null,
        'transaction_date' => (string) $biggestRow['transaction_date'],
        'business_id' => $biggestRow['business_id'] !== null ? (int) $biggestRow['business_id'] : null,
        'business_name' => $biggestRow['business_name'] !== null ? (string) $biggestRow['business_name'] : null,
        'from_account_name' => $biggestRow['from_account_name'] !== null ? (string) $biggestRow['from_account_name'] : null,
        'to_account_name' => $biggestRow['to_account_name'] !== null ? (string) $biggestRow['to_account_name'] : null,
        'created_by_name' => $biggestRow['created_by_name'] !== null ? (string) $biggestRow['created_by_name'] : null,
    ];
}

$totalAmount = round((float) ($summary['total_amount'] ?? 0), 2);
$transactionCount = (int) ($summary['transaction_count'] ?? 0);
$avgAmount = $transactionCount > 0 ? round((float) ($summary['avg_amount'] ?? 0), 2) : 0.0;

Response::success('Category breakdown fetched.', [
    'month' => $period,
    'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
    'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
    'type' => $type,
    'business_id' => $businessId,
    'created_by_user_id' => $createdByUserId,
    'category' => [
        'id' => (int) $category['id'],
        'name' => (string) $category['name'],
        'icon' => $category['icon'] ?: null,
        'color' => $category['color'] ?: null,
        'type' => (string) $category['type'],
    ],
    'total_amount' => $totalAmount,
    'daily_breakdown' => $dailyBreakdown,
    'stats' => [
        'avg_amount' => $avgAmount,
        'biggest_transaction' => $biggestTransaction,
        'transaction_count' => $transactionCount,
        'busiest_day' => $busiestDay,
    ],
    'transactions' => $formattedTransactions,
]);
