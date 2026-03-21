<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);
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

if ($allowedAccountIds !== []) {
    UserAccountAccessService::assertAllowedAccount($id, $allowedAccountIds);
}

$accountStmt = db()->prepare(
    'SELECT id, name, type, initial_balance, current_balance, created_at
     FROM accounts
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$accountStmt->execute([
    ':id' => $id,
    ':user_id' => $userId,
]);
$account = $accountStmt->fetch();

if (!$account) {
    Response::error('Account not found.', 404);
}

$monthlySql = 'SELECT
        COALESCE(SUM(
            CASE
                WHEN t.type = \'income\' AND t.to_account_id = :income_to_account_id THEN t.amount
                WHEN t.type = \'transfer\' AND t.to_account_id = :transfer_to_account_id THEN t.amount
                WHEN t.type = \'asset\' AND t.to_account_id = :asset_to_account_id THEN t.amount
                WHEN t.type = \'opening_adjustment\' AND t.to_account_id = :adjust_to_account_id AND t.amount >= 0 THEN t.amount
                ELSE 0
            END
        ), 0) AS monthly_inflow,
        COALESCE(SUM(
            CASE
                WHEN t.type = \'expense\' AND t.from_account_id = :expense_from_account_id THEN t.amount
                WHEN t.type = \'transfer\' AND t.from_account_id = :transfer_from_account_id THEN t.amount
                WHEN t.type = \'asset\' AND t.from_account_id = :asset_from_account_id THEN t.amount
                WHEN t.type = \'opening_adjustment\' AND t.to_account_id = :adjust_out_account_id AND t.amount < 0 THEN ABS(t.amount)
                ELSE 0
            END
        ), 0) AS monthly_outflow
     FROM transactions t
     WHERE t.user_id = :monthly_user_id
       AND t.is_deleted = 0
       AND (t.from_account_id = :scope_from_account_id OR t.to_account_id = :scope_to_account_id)';

$monthlyParams = [
    ':income_to_account_id' => $id,
    ':transfer_to_account_id' => $id,
    ':asset_to_account_id' => $id,
    ':adjust_to_account_id' => $id,
    ':expense_from_account_id' => $id,
    ':transfer_from_account_id' => $id,
    ':asset_from_account_id' => $id,
    ':adjust_out_account_id' => $id,
    ':monthly_user_id' => $userId,
    ':scope_from_account_id' => $id,
    ':scope_to_account_id' => $id,
];

if ($rangeStart !== null && $rangeEnd !== null) {
    $monthlySql .= ' AND t.transaction_date BETWEEN :month_start AND :month_end';
    $monthlyParams[':month_start'] = $rangeStart;
    $monthlyParams[':month_end'] = $rangeEnd;
}

$monthlyStmt = db()->prepare($monthlySql);
$monthlyStmt->execute($monthlyParams);
$monthly = $monthlyStmt->fetch() ?: ['monthly_inflow' => 0, 'monthly_outflow' => 0];

$countStmt = db()->prepare(
    'SELECT COUNT(*) AS total
     FROM transactions
     WHERE user_id = :count_user_id
       AND is_deleted = 0
       AND (from_account_id = :count_from_account_id OR to_account_id = :count_to_account_id)'
);
$countStmt->execute([
    ':count_user_id' => $userId,
    ':count_from_account_id' => $id,
    ':count_to_account_id' => $id,
]);
$transactionCount = (int) (($countStmt->fetch()['total'] ?? 0));

Response::success('Account view fetched.', [
    'account' => [
        'id' => (int) $account['id'],
        'name' => (string) $account['name'],
        'type' => (string) $account['type'],
        'opening_balance' => (float) $account['initial_balance'],
        'current_balance' => (float) $account['current_balance'],
        'month' => $period,
        'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
        'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
        'monthly_inflow' => (float) ($monthly['monthly_inflow'] ?? 0),
        'monthly_outflow' => (float) ($monthly['monthly_outflow'] ?? 0),
        'transaction_count' => $transactionCount,
        'created_at' => (string) $account['created_at'],
    ],
]);
