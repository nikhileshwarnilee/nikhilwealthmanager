<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);
$month = trim((string) Request::query('month', date('Y-m')));
$businessId = Validator::nullablePositiveInt(Request::query('business_id', ''));
$createdByUserId = WorkspaceUserService::resolveTransactionCreatorFilter($user, Request::query('created_by_user_id', ''));
if ($month === '') {
    $month = date('Y-m');
}
$month = Validator::monthOrAll($month);

$start = null;
$end = null;
if ($month !== 'all') {
    $start = $month . '-01 00:00:00';
    $end = date('Y-m-t 23:59:59', strtotime($start));
}

$sql = 'SELECT
        c.id AS category_id,
        c.name AS category_name,
        c.color AS category_color,
        c.icon AS category_icon,
        COALESCE(SUM(t.amount), 0) AS total_spent
     FROM categories c
     LEFT JOIN transactions t
       ON t.category_id = c.id
      AND t.user_id = c.user_id
      AND t.is_deleted = 0
      AND t.type = \'expense\'
';

$params = [
    ':user_id' => $userId,
];
if ($businessId !== null) {
    $sql .= '      AND t.business_id = :business_id
';
    $params[':business_id'] = $businessId;
}
if ($createdByUserId !== null) {
    $sql .= '      AND t.created_by_user_id = :created_by_user_id
';
    $params[':created_by_user_id'] = $createdByUserId;
}

if ($start !== null && $end !== null) {
    $sql .= '      AND t.transaction_date BETWEEN :start_date AND :end_date
';
    $params[':start_date'] = $start;
    $params[':end_date'] = $end;
}

$sql .= UserAccountAccessService::buildTransactionScopeSql(
    't',
    $allowedAccountIds,
    $params,
    'tx_category_summary',
    false
) . '
';

$sql .= '     WHERE c.user_id = :user_id
       AND c.is_deleted = 0
       AND c.type = \'expense\'
     GROUP BY c.id, c.name, c.color, c.icon
     ORDER BY total_spent DESC';

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$totalSpent = 0.0;
foreach ($rows as $row) {
    $totalSpent += (float) $row['total_spent'];
}

Response::success('Category summary fetched.', [
    'month' => $month,
    'business_id' => $businessId,
    'created_by_user_id' => $createdByUserId,
    'total_spent' => round($totalSpent, 2),
    'categories' => $rows,
]);
