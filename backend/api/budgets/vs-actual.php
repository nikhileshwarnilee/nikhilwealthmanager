<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();

$month = Validator::monthOrAll(Request::query('month', date('Y-m')));
$data = BudgetService::vsActual((int) $user['id'], $month);

Response::success('Budget vs actual fetched.', $data);
