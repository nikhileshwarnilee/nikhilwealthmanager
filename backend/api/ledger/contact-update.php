<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('ledger_contact_update', 220, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();
$contactId = Validator::positiveInt($input['id'] ?? 0, 'id');

$contact = LedgerService::updateContact($userId, $contactId, $input);

Response::success('Ledger contact updated.', [
    'contact' => $contact,
]);
