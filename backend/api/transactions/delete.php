<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('transactions_delete', 200, 600);
if (!in_array(Request::method(), ['DELETE', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? Request::query('id', 0), 'id');

TransactionService::delete((int) $user['id'], $id);

Response::success('Transaction deleted.');

