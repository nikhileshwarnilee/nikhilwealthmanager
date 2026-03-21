<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('transactions_update', 250, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$workspaceUserId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? 0, 'id');

$transaction = TransactionService::update($workspaceUserId, $id, $input, $user);

Response::success('Transaction updated.', [
    'transaction' => $transaction,
]);

