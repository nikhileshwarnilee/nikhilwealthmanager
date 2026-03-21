<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$contactId = Validator::positiveInt(Request::query('id', 0), 'id');
$dateFrom = trim((string) Request::query('date_from', ''));
$dateTo = trim((string) Request::query('date_to', ''));

$data = LedgerService::contactReport($userId, $contactId, $dateFrom, $dateTo);

Response::success('Ledger contact report fetched.', $data);
