<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('ledger_entry_create', 220, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);

$entry = LedgerService::createEntry($userId, Request::body());

Response::success('Ledger entry created.', [
    'entry' => $entry,
], 201);
