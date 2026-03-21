<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$contactId = Validator::positiveInt(Request::query('id', 0), 'id');

Response::success('Ledger contact fetched.', LedgerService::contactView($userId, $contactId));
