<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('ledger_entry_update', 260, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$entryId = Validator::positiveInt($input['id'] ?? 0, 'id');

$entry = LedgerService::updateEntry($userId, $entryId, $input);

Response::success('Ledger entry updated.', [
    'entry' => $entry,
]);
