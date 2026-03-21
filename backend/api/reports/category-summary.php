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
$type = Validator::enum(Request::query('type', 'expense'), ['income', 'expense'], 'type');
$businessId = Validator::nullablePositiveInt(Request::query('business_id', ''));
$createdByUserId = WorkspaceUserService::resolveTransactionCreatorFilter($user, Request::query('created_by_user_id', ''));

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

$sql = 'SELECT
        c.id AS category_id,
        c.name AS category_name,
        c.icon AS category_icon,
        COALESCE(c.color, \'#7c3aed\') AS category_color,
        COALESCE(SUM(t.amount), 0) AS total_amount,
        COUNT(t.id) AS transaction_count
     FROM categories c
     LEFT JOIN transactions t
       ON t.category_id = c.id
      AND t.user_id = c.user_id
      AND t.is_deleted = 0
      AND t.type = :tx_type';

$params = [
    ':tx_type' => $type,
    ':user_id' => $userId,
    ':category_type' => $type,
];
$sql .= UserAccountAccessService::buildTransactionScopeSql(
    't',
    $allowedAccountIds,
    $params,
    'report_category_summary',
    false
);

if ($businessId !== null) {
    $sql .= '
      AND t.business_id = :business_id';
    $params[':business_id'] = $businessId;
}

if ($createdByUserId !== null) {
    $sql .= '
      AND t.created_by_user_id = :created_by_user_id';
    $params[':created_by_user_id'] = $createdByUserId;
}

if ($rangeStart !== null && $rangeEnd !== null) {
    $sql .= '
      AND t.transaction_date BETWEEN :start_date AND :end_date';
    $params[':start_date'] = $rangeStart;
    $params[':end_date'] = $rangeEnd;
}

$sql .= '
     WHERE c.user_id = :user_id
       AND c.is_deleted = 0
       AND c.type = :category_type
     GROUP BY c.id, c.name, c.icon, c.color
     HAVING total_amount > 0
     ORDER BY total_amount DESC, c.name ASC';

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$totalAmount = 0.0;
$totalTransactions = 0;
foreach ($rows as $row) {
    $totalAmount += (float) $row['total_amount'];
    $totalTransactions += (int) $row['transaction_count'];
}

$categories = [];
foreach ($rows as $row) {
    $amount = round((float) $row['total_amount'], 2);
    $percentage = $totalAmount > 0 ? round(($amount / $totalAmount) * 100, 2) : 0.0;
    $categories[] = [
        'category_id' => (int) $row['category_id'],
        'category_name' => (string) $row['category_name'],
        'category_icon' => $row['category_icon'] ?: null,
        'category_color' => (string) $row['category_color'],
        'total_amount' => $amount,
        'transaction_count' => (int) $row['transaction_count'],
        'percentage' => $percentage,
    ];
}

Response::success('Category report summary fetched.', [
    'month' => $period,
    'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
    'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
    'type' => $type,
    'business_id' => $businessId,
    'created_by_user_id' => $createdByUserId,
    'total_amount' => round($totalAmount, 2),
    'total_transactions' => $totalTransactions,
    'categories' => $categories,
]);
