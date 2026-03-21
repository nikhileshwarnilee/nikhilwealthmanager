<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$search = Validator::string(Request::query('search', ''), 100);
$focus = Validator::string(Request::query('focus', 'all'), 20);

$data = LedgerService::overview($userId, $search, $focus);

Response::success('Ledger overview fetched.', $data);
