<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$id = Validator::positiveInt(Request::query('id', 0), 'id');

$stmt = db()->prepare(
    'SELECT
        t.id,
        t.type,
        t.amount,
        t.reference_type,
        t.reference_id,
        t.note,
        t.location,
        t.receipt_path,
        t.transaction_date,
        t.created_at,
        t.updated_at,
        t.from_account_id,
        t.to_account_id,
        t.from_asset_type_id,
        t.to_asset_type_id,
        t.category_id,
        fa.name AS from_account_name,
        ta.name AS to_account_name,
        fas.name AS from_asset_type_name,
        fas.icon AS from_asset_type_icon,
        tas.name AS to_asset_type_name,
        tas.icon AS to_asset_type_icon,
        c.name AS category_name,
        c.icon AS category_icon,
        c.color AS category_color,
        c.type AS category_type
     FROM transactions t
     LEFT JOIN accounts fa
       ON fa.id = t.from_account_id
      AND fa.user_id = t.user_id
      AND fa.is_deleted = 0
     LEFT JOIN accounts ta
       ON ta.id = t.to_account_id
      AND ta.user_id = t.user_id
      AND ta.is_deleted = 0
     LEFT JOIN asset_types fas
       ON fas.id = t.from_asset_type_id
      AND fas.user_id = t.user_id
      AND fas.is_deleted = 0
     LEFT JOIN asset_types tas
       ON tas.id = t.to_asset_type_id
      AND tas.user_id = t.user_id
      AND tas.is_deleted = 0
     LEFT JOIN categories c
       ON c.id = t.category_id
      AND c.user_id = t.user_id
      AND c.is_deleted = 0
     WHERE t.id = :id
       AND t.user_id = :user_id
       AND t.is_deleted = 0
     LIMIT 1'
);
$stmt->execute([
    ':id' => $id,
    ':user_id' => $userId,
]);
$row = $stmt->fetch();

if (!$row) {
    Response::error('Transaction not found.', 404);
}

$receiptPath = $row['receipt_path'] ?: null;
$receiptUrl = null;
if ($receiptPath) {
    $appUrl = rtrim((string) env('APP_URL', ''), '/');
    $backendBase = $appUrl !== '' ? ($appUrl . '/backend/') : '/backend/';
    $receiptUrl = $backendBase . ltrim(str_replace('\\', '/', (string) $receiptPath), '/');
}

$accountName = null;
if ((string) $row['type'] === 'income') {
    $accountName = $row['to_account_name'] ?: null;
} elseif ((string) $row['type'] === 'expense') {
    $accountName = $row['from_account_name'] ?: null;
} elseif ((string) $row['type'] === 'opening_adjustment') {
    $accountName = $row['to_account_name'] ?: $row['from_account_name'] ?: null;
} elseif ((string) $row['type'] === 'asset') {
    if ($row['to_asset_type_name'] && $row['from_account_name']) {
        $accountName = trim((string) $row['from_account_name'] . ' -> ' . (string) $row['to_asset_type_name']);
    } elseif ($row['from_asset_type_name'] && $row['to_account_name']) {
        $accountName = trim((string) $row['from_asset_type_name'] . ' -> ' . (string) $row['to_account_name']);
    } else {
        $accountName = $row['to_asset_type_name'] ?: $row['from_asset_type_name'] ?: null;
    }
} else {
    $from = (string) ($row['from_account_name'] ?? '');
    $to = (string) ($row['to_account_name'] ?? '');
    $accountName = trim($from . ' -> ' . $to);
    if ($accountName === '->' || $accountName === '') {
        $accountName = null;
    }
}

Response::success('Transaction view fetched.', [
    'transaction' => [
        'id' => (int) $row['id'],
        'type' => (string) $row['type'],
        'amount' => (float) $row['amount'],
        'category' => [
            'id' => $row['category_id'] !== null ? (int) $row['category_id'] : null,
            'name' => $row['category_name'] ?: null,
            'icon' => $row['category_icon'] ?: null,
            'color' => $row['category_color'] ?: null,
            'type' => $row['category_type'] ?: null,
        ],
        'account' => [
            'name' => $accountName,
            'from' => [
                'id' => $row['from_account_id'] !== null ? (int) $row['from_account_id'] : null,
                'name' => $row['from_account_name'] ?: null,
            ],
            'to' => [
                'id' => $row['to_account_id'] !== null ? (int) $row['to_account_id'] : null,
                'name' => $row['to_account_name'] ?: null,
            ],
            'from_asset' => [
                'id' => $row['from_asset_type_id'] !== null ? (int) $row['from_asset_type_id'] : null,
                'name' => $row['from_asset_type_name'] ?: null,
                'icon' => $row['from_asset_type_icon'] ?: null,
            ],
            'to_asset' => [
                'id' => $row['to_asset_type_id'] !== null ? (int) $row['to_asset_type_id'] : null,
                'name' => $row['to_asset_type_name'] ?: null,
                'icon' => $row['to_asset_type_icon'] ?: null,
            ],
        ],
        'date' => (string) $row['transaction_date'],
        'note' => $row['note'] ?: null,
        'tags' => [],
        'location' => $row['location'] ?: null,
        'receipt' => $receiptPath,
        'receipt_url' => $receiptUrl,
        'recurring_info' => [
            'is_recurring' => false,
            'reference_type' => $row['reference_type'] ?: null,
            'reference_id' => $row['reference_id'] !== null ? (int) $row['reference_id'] : null,
        ],
        'created_at' => (string) $row['created_at'],
        'updated_at' => (string) $row['updated_at'],
    ],
]);
