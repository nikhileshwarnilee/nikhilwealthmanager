<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('transactions_create', 250, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();

$input = Request::body();
$transaction = TransactionService::create((int) $user['id'], $input);

Response::success('Transaction created.', [
    'transaction' => $transaction,
], 201);

