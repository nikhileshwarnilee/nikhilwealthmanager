<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('ledger_entry_delete', 260, 600);
if (!in_array(Request::method(), ['DELETE', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$entryId = Validator::positiveInt($input['id'] ?? 0, 'id');

$result = LedgerService::cancelEntry($userId, $entryId);

Response::success('Ledger entry removed.', [
    'result' => $result,
]);
