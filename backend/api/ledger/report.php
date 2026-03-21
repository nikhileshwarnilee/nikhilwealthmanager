<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$focus = Validator::string(Request::query('focus', 'all'), 20);
$dateFrom = trim((string) Request::query('date_from', ''));
$dateTo = trim((string) Request::query('date_to', ''));

$data = LedgerService::openItemsReport($userId, $focus, $dateFrom, $dateTo);

Response::success('Ledger open items report fetched.', $data);
