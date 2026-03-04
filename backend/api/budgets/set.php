<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('budgets_set', 120, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();

$input = Request::body();
$categoryId = Validator::positiveInt($input['category_id'] ?? 0, 'category_id');
$month = Validator::month($input['month'] ?? date('Y-m'));
$amount = Validator::amount($input['amount'] ?? null);

$budget = BudgetService::upsert((int) $user['id'], $categoryId, $month, $amount);

Response::success('Budget saved.', [
    'budget' => $budget,
]);

