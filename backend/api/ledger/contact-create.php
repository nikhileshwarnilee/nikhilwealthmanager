<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('ledger_contact_create', 180, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);

$contact = LedgerService::createContact($userId, Request::body());

Response::success('Ledger contact created.', [
    'contact' => $contact,
], 201);
