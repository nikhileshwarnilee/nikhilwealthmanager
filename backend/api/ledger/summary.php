<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);

Response::success('Ledger summary fetched.', [
    'summary' => LedgerService::summary($userId),
]);
