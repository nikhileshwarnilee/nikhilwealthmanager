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

$summary = AssetService::summary($userId);
$assets = (array) ($summary['assets'] ?? []);

$allocation = [];
$investedVsCurrent = [];
$gainLossByType = [];
foreach ($assets as $asset) {
    $allocation[] = [
        'asset_type_id' => (int) ($asset['id'] ?? 0),
        'asset_name' => (string) ($asset['name'] ?? ''),
        'current_value' => round((float) ($asset['current_value'] ?? 0), 2),
        'allocation_percent' => round((float) ($asset['allocation_percent'] ?? 0), 2),
        'icon' => $asset['icon'] ?? null,
    ];

    $investedVsCurrent[] = [
        'asset_type_id' => (int) ($asset['id'] ?? 0),
        'asset_name' => (string) ($asset['name'] ?? ''),
        'invested_amount' => round((float) ($asset['invested_amount'] ?? 0), 2),
        'current_value' => round((float) ($asset['current_value'] ?? 0), 2),
    ];

    $gainLossByType[] = [
        'asset_type_id' => (int) ($asset['id'] ?? 0),
        'asset_name' => (string) ($asset['name'] ?? ''),
        'gain_loss' => round((float) ($asset['gain_loss'] ?? 0), 2),
        'gain_loss_percent' => round((float) ($asset['gain_loss_percent'] ?? 0), 2),
    ];
}

$growthSql = 'SELECT
        DATE(transaction_date) AS day,
        COALESCE(SUM(CASE WHEN to_asset_type_id IS NOT NULL THEN amount ELSE 0 END), 0) AS invested_in,
        COALESCE(SUM(CASE WHEN from_asset_type_id IS NOT NULL THEN amount ELSE 0 END), 0) AS redeemed_out
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND type = \'asset\'';
$growthParams = [':user_id' => $userId];
if ($rangeStart !== null && $rangeEnd !== null) {
    $growthSql .= ' AND transaction_date BETWEEN :start_date AND :end_date';
    $growthParams[':start_date'] = $rangeStart;
    $growthParams[':end_date'] = $rangeEnd;
}
$growthSql .= ' GROUP BY DATE(transaction_date) ORDER BY day ASC';

$growthStmt = db()->prepare($growthSql);
$growthStmt->execute($growthParams);
$growthRows = $growthStmt->fetchAll();

$growthOverTime = [];
$runningNetInvested = 0.0;
foreach ($growthRows as $row) {
    $day = (string) $row['day'];
    $investedIn = round((float) ($row['invested_in'] ?? 0), 2);
    $redeemedOut = round((float) ($row['redeemed_out'] ?? 0), 2);
    $net = round($investedIn - $redeemedOut, 2);
    $runningNetInvested = round($runningNetInvested + $net, 2);

    $growthOverTime[] = [
        'date' => $day,
        'label' => date('d M', strtotime($day)),
        'invested_in' => $investedIn,
        'redeemed_out' => $redeemedOut,
        'net_invested' => $net,
        'cumulative_net_invested' => $runningNetInvested,
    ];
}

$valueUpdateSql = 'SELECT
        DATE(recorded_at) AS day,
        COALESCE(SUM(value), 0) AS reported_value,
        COUNT(*) AS updates_count
     FROM asset_value_history
     WHERE user_id = :user_id';
$valueUpdateParams = [':user_id' => $userId];
if ($rangeStart !== null && $rangeEnd !== null) {
    $valueUpdateSql .= ' AND recorded_at BETWEEN :start_date AND :end_date';
    $valueUpdateParams[':start_date'] = $rangeStart;
    $valueUpdateParams[':end_date'] = $rangeEnd;
}
$valueUpdateSql .= ' GROUP BY DATE(recorded_at) ORDER BY day ASC';

$valueUpdateStmt = db()->prepare($valueUpdateSql);
$valueUpdateStmt->execute($valueUpdateParams);
$valueUpdateRows = $valueUpdateStmt->fetchAll();

$valueUpdatesOverTime = [];
foreach ($valueUpdateRows as $row) {
    $day = (string) $row['day'];
    $valueUpdatesOverTime[] = [
        'date' => $day,
        'label' => date('d M', strtotime($day)),
        'reported_value' => round((float) ($row['reported_value'] ?? 0), 2),
        'updates_count' => (int) ($row['updates_count'] ?? 0),
    ];
}

Response::success('Asset report fetched.', [
    'month' => $period,
    'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
    'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
    'totals' => [
        'total_invested' => round((float) ($summary['total_invested'] ?? 0), 2),
        'total_current_value' => round((float) ($summary['total_current_value'] ?? 0), 2),
        'total_gain_loss' => round((float) ($summary['total_gain_loss'] ?? 0), 2),
        'asset_count' => (int) ($summary['asset_count'] ?? 0),
    ],
    'asset_allocation' => $allocation,
    'invested_vs_current' => $investedVsCurrent,
    'gain_loss_by_type' => $gainLossByType,
    'growth_over_time' => $growthOverTime,
    'value_updates_over_time' => $valueUpdatesOverTime,
]);
