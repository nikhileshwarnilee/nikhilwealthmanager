<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);

$month = Validator::monthOrAll(Request::query('month', date('Y-m')));
$insights = InsightService::monthly($userId, $month, $allowedAccountIds);

Response::success('Insights generated.', [
    'month' => $month,
    'insights' => $insights,
]);
