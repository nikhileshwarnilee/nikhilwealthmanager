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
        COUNT(*) AS transaction_count
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0';
$params = [':user_id' => $userId];
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
        fa.name AS from_account_name, ta.name AS to_account_name, c.name AS category_name
     FROM transactions t
     LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
     LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
     LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
     WHERE t.user_id = :user_id
       AND t.is_deleted = 0';
if ($start !== null && $end !== null) {
    $recentSql .= ' AND t.transaction_date BETWEEN :start_date AND :end_date';
}
$recentSql .= ' ORDER BY t.transaction_date DESC, t.id DESC LIMIT 5';

$recentStmt = db()->prepare($recentSql);
$recentParams = [':user_id' => $userId];
if ($start !== null && $end !== null) {
    $recentParams[':start_date'] = $start;
    $recentParams[':end_date'] = $end;
}
$recentStmt->execute($recentParams);

$income = (float) $summary['income_total'];
$expense = (float) $summary['expense_total'];

Response::success('Monthly summary fetched.', [
    'month' => $month,
    'date_from' => $start !== null ? date('Y-m-d', strtotime($start)) : null,
    'date_to' => $end !== null ? date('Y-m-d', strtotime($end)) : null,
    'income_total' => $income,
    'expense_total' => $expense,
    'transfer_total' => (float) $summary['transfer_total'],
    'net_total' => round($income - $expense, 2),
    'transaction_count' => (int) $summary['transaction_count'],
    'recent_transactions' => $recentStmt->fetchAll(),
]);
