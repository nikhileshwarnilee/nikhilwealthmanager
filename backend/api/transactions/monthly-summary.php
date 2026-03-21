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
$month = $useCustomRange ? 'custom' : Validator::monthOrAll($month);

$start = null;
$end = null;
if ($useCustomRange) {
    if ($dateFromRaw === '' || $dateToRaw === '') {
        Response::error('Both date_from and date_to are required for custom interval.', 422);
    }

    $fromDate = Validator::dateTime($dateFromRaw, false);
    $toDate = Validator::dateTime($dateToRaw, false);
    $start = date('Y-m-d 00:00:00', strtotime((string) $fromDate));
    $end = date('Y-m-d 23:59:59', strtotime((string) $toDate));

    if (strtotime($start) > strtotime($end)) {
        Response::error('date_from must be before or equal to date_to.', 422);
    }
} elseif ($month !== 'all') {
    $start = $month . '-01 00:00:00';
    $end = date('Y-m-t 23:59:59', strtotime($start));
}

$sql = 'SELECT
        COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income_total,
        COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense_total,
        COALESCE(SUM(CASE WHEN type = \'transfer\' THEN amount ELSE 0 END), 0) AS transfer_total,
        COALESCE(SUM(CASE WHEN type = \'asset\' THEN amount ELSE 0 END), 0) AS asset_total,
        COUNT(*) AS transaction_count
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0';
$params = [':user_id' => $userId];
$sql .= UserAccountAccessService::buildTransactionScopeSql('transactions', $allowedAccountIds, $params, 'monthly_scope');
if ($businessId !== null) {
    $sql .= ' AND business_id = :business_id';
    $params[':business_id'] = $businessId;
}
if ($createdByUserId !== null) {
    $sql .= ' AND created_by_user_id = :created_by_user_id';
    $params[':created_by_user_id'] = $createdByUserId;
}
if ($start !== null && $end !== null) {
    $sql .= ' AND transaction_date BETWEEN :start_date AND :end_date';
    $params[':start_date'] = $start;
    $params[':end_date'] = $end;
}

$stmt = db()->prepare($sql);
$stmt->execute($params);
$summary = $stmt->fetch() ?: [
    'income_total' => 0,
    'expense_total' => 0,
    'transfer_total' => 0,
    'transaction_count' => 0,
];

$recentSql = 'SELECT
        t.id, t.amount, t.type, t.note, t.running_balance, t.transaction_date,
        t.created_by_user_id,
        t.from_asset_type_id, t.to_asset_type_id, t.business_id,
        fa.name AS from_account_name, ta.name AS to_account_name,
        fas.name AS from_asset_type_name, fas.icon AS from_asset_type_icon,
        tas.name AS to_asset_type_name, tas.icon AS to_asset_type_icon,
        creator.name AS created_by_name,
        b.name AS business_name,
        c.name AS category_name
     FROM transactions t
     LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
     LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
     LEFT JOIN asset_types fas ON fas.id = t.from_asset_type_id AND fas.user_id = t.user_id AND fas.is_deleted = 0
     LEFT JOIN asset_types tas ON tas.id = t.to_asset_type_id AND tas.user_id = t.user_id AND tas.is_deleted = 0
     LEFT JOIN businesses b ON b.id = t.business_id AND b.user_id = t.user_id AND b.is_deleted = 0
     LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
     LEFT JOIN users creator ON creator.id = t.created_by_user_id
     WHERE t.user_id = :user_id
       AND t.is_deleted = 0';
$recentParams = [':user_id' => $userId];
$recentSql .= UserAccountAccessService::buildTransactionScopeSql('t', $allowedAccountIds, $recentParams, 'recent_scope');
if ($businessId !== null) {
    $recentSql .= ' AND t.business_id = :business_id';
    $recentParams[':business_id'] = $businessId;
}
if ($createdByUserId !== null) {
    $recentSql .= ' AND t.created_by_user_id = :created_by_user_id';
    $recentParams[':created_by_user_id'] = $createdByUserId;
}
if ($start !== null && $end !== null) {
    $recentSql .= ' AND t.transaction_date BETWEEN :start_date AND :end_date';
    $recentParams[':start_date'] = $start;
    $recentParams[':end_date'] = $end;
}
$recentSql .= ' ORDER BY t.transaction_date DESC, t.id DESC LIMIT 5';

$recentStmt = db()->prepare($recentSql);
$recentStmt->execute($recentParams);

$income = (float) $summary['income_total'];
$expense = (float) $summary['expense_total'];

Response::success('Monthly summary fetched.', [
    'month' => $month,
    'date_from' => $start !== null ? date('Y-m-d', strtotime($start)) : null,
    'date_to' => $end !== null ? date('Y-m-d', strtotime($end)) : null,
    'business_id' => $businessId,
    'created_by_user_id' => $createdByUserId,
    'income_total' => $income,
    'expense_total' => $expense,
    'transfer_total' => (float) $summary['transfer_total'],
    'asset_total' => (float) ($summary['asset_total'] ?? 0),
    'net_total' => round($income - $expense, 2),
    'transaction_count' => (int) $summary['transaction_count'],
    'recent_transactions' => $recentStmt->fetchAll(),
]);
