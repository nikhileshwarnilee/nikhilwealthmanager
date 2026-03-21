<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);

$month = Validator::monthOrAll(Request::query('month', date('Y-m')));
$alerts = BudgetService::alerts($userId, $month, null, $allowedAccountIds);

Response::success('Budget alerts fetched.', [
    'month' => $month,
    'alerts' => $alerts,
]);
