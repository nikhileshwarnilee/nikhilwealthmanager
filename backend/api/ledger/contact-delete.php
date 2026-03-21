<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('ledger_contact_delete', 180, 600);
if (!in_array(Request::method(), ['DELETE', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? Request::query('id', 0), 'id');

$result = LedgerService::deleteContact($userId, $id);

Response::success('Ledger contact deleted.', $result);
