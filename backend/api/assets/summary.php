<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

$assetSummary = AssetService::summary($userId);

$accountStmt = db()->prepare(
    'SELECT COALESCE(SUM(current_balance), 0) AS total_balance
     FROM accounts
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND is_archived = 0'
);
$accountStmt->execute([':user_id' => $userId]);
$accountTotal = round((float) (($accountStmt->fetch()['total_balance'] ?? 0)), 2);

$assetCurrent = round((float) ($assetSummary['total_current_value'] ?? 0), 2);

Response::success('Asset summary fetched.', [
    'accounts_total_balance' => $accountTotal,
    'assets_total_invested' => round((float) ($assetSummary['total_invested'] ?? 0), 2),
    'assets_total_current_value' => $assetCurrent,
    'assets_total_gain_loss' => round((float) ($assetSummary['total_gain_loss'] ?? 0), 2),
    'asset_count' => (int) ($assetSummary['asset_count'] ?? 0),
    'net_worth' => round($accountTotal + $assetCurrent, 2),
]);
