<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);

$month = Validator::monthOrAll(Request::query('month', date('Y-m')));
$data = BudgetService::vsActual($userId, $month, null, $allowedAccountIds);

Response::success('Budget vs actual fetched.', $data);
