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

$assetType = AssetService::getType($id, $userId);

$summarySql = 'SELECT
        COALESCE(SUM(CASE WHEN type = \'asset\' AND to_asset_type_id = :to_asset_type_id THEN amount ELSE 0 END), 0) AS invested_in,
        COALESCE(SUM(CASE WHEN type = \'asset\' AND from_asset_type_id = :from_asset_type_id THEN amount ELSE 0 END), 0) AS redeemed_out,
        COALESCE(COUNT(CASE WHEN type = \'asset\' AND (from_asset_type_id = :scope_from_asset_type_id OR to_asset_type_id = :scope_to_asset_type_id) THEN id ELSE NULL END), 0) AS transaction_count
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0';
$summaryParams = [
    ':to_asset_type_id' => $id,
    ':from_asset_type_id' => $id,
    ':scope_from_asset_type_id' => $id,
    ':scope_to_asset_type_id' => $id,
    ':user_id' => $userId,
];
if ($rangeStart !== null && $rangeEnd !== null) {
    $summarySql .= ' AND transaction_date BETWEEN :start_date AND :end_date';
    $summaryParams[':start_date'] = $rangeStart;
    $summaryParams[':end_date'] = $rangeEnd;
}
$summaryStmt = db()->prepare($summarySql);
$summaryStmt->execute($summaryParams);
$periodSummary = $summaryStmt->fetch() ?: [
    'invested_in' => 0,
    'redeemed_out' => 0,
    'transaction_count' => 0,
];

$historySql = 'SELECT
        DATE(transaction_date) AS day,
        COALESCE(SUM(CASE WHEN type = \'asset\' AND to_asset_type_id = :to_asset_type_id THEN amount ELSE 0 END), 0) AS invested_in,
        COALESCE(SUM(CASE WHEN type = \'asset\' AND from_asset_type_id = :from_asset_type_id THEN amount ELSE 0 END), 0) AS redeemed_out,
        COALESCE(COUNT(CASE WHEN type = \'asset\' AND (from_asset_type_id = :count_scope_from_asset_type_id OR to_asset_type_id = :count_scope_to_asset_type_id) THEN id ELSE NULL END), 0) AS transaction_count
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND type = \'asset\'
       AND (from_asset_type_id = :where_scope_from_asset_type_id OR to_asset_type_id = :where_scope_to_asset_type_id)';
$historyParams = [
    ':to_asset_type_id' => $id,
    ':from_asset_type_id' => $id,
    ':count_scope_from_asset_type_id' => $id,
    ':count_scope_to_asset_type_id' => $id,
    ':where_scope_from_asset_type_id' => $id,
    ':where_scope_to_asset_type_id' => $id,
    ':user_id' => $userId,
];
if ($rangeStart !== null && $rangeEnd !== null) {
    $historySql .= ' AND transaction_date BETWEEN :start_date AND :end_date';
    $historyParams[':start_date'] = $rangeStart;
    $historyParams[':end_date'] = $rangeEnd;
}
$historySql .= ' GROUP BY DATE(transaction_date) ORDER BY day ASC';
$historyStmt = db()->prepare($historySql);
$historyStmt->execute($historyParams);
$dailyRows = $historyStmt->fetchAll();

$investmentHistory = [];
$runningNetInvested = 0.0;
foreach ($dailyRows as $row) {
    $investedIn = round((float) ($row['invested_in'] ?? 0), 2);
    $redeemedOut = round((float) ($row['redeemed_out'] ?? 0), 2);
    $net = round($investedIn - $redeemedOut, 2);
    $runningNetInvested = round($runningNetInvested + $net, 2);

    $day = (string) $row['day'];
    $investmentHistory[] = [
        'date' => $day,
        'label' => date('d M', strtotime($day)),
        'invested_in' => $investedIn,
        'redeemed_out' => $redeemedOut,
        'net_invested' => $net,
        'cumulative_net_invested' => $runningNetInvested,
        'transaction_count' => (int) ($row['transaction_count'] ?? 0),
    ];
}

$valueHistory = AssetService::valueHistory(
    $userId,
    $id,
    $rangeStart,
    $rangeEnd,
    730
);

$valueSeries = [];
foreach ($valueHistory as $row) {
    $recordedAt = (string) ($row['recorded_at'] ?? '');
    $valueSeries[] = [
        'date' => date('Y-m-d', strtotime($recordedAt)),
        'label' => date('d M', strtotime($recordedAt)),
        'value' => round((float) ($row['value'] ?? 0), 2),
    ];
}

$periodInvestedIn = round((float) ($periodSummary['invested_in'] ?? 0), 2);
$periodRedeemedOut = round((float) ($periodSummary['redeemed_out'] ?? 0), 2);
$periodNet = round($periodInvestedIn - $periodRedeemedOut, 2);

Response::success('Asset view fetched.', [
    'month' => $period,
    'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
    'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
    'asset' => $assetType,
    'period' => [
        'invested_in' => $periodInvestedIn,
        'redeemed_out' => $periodRedeemedOut,
        'net_invested' => $periodNet,
        'transaction_count' => (int) ($periodSummary['transaction_count'] ?? 0),
    ],
    'investment_history' => $investmentHistory,
    'value_history' => $valueHistory,
    'value_series' => $valueSeries,
]);
