<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

$type = trim((string) Request::query('type', ''));
$accountId = Request::query('account_id', '');
$categoryId = Request::query('category_id', '');
$search = Validator::string(Request::query('search', ''), 100);
$dateFrom = trim((string) Request::query('date_from', ''));
$dateTo = trim((string) Request::query('date_to', ''));

$params = [':user_id' => $userId];
$where = ['t.user_id = :user_id', 't.is_deleted = 0'];

if ($type !== '') {
    $type = Validator::enum($type, ['income', 'expense', 'transfer', 'opening_adjustment', 'asset'], 'type');
    $where[] = 't.type = :type';
    $params[':type'] = $type;
}
if ($accountId !== '') {
    $accountIdInt = Validator::positiveInt($accountId, 'account_id');
    $where[] = '(t.from_account_id = :account_from_id OR t.to_account_id = :account_to_id)';
    $params[':account_from_id'] = $accountIdInt;
    $params[':account_to_id'] = $accountIdInt;
}
if ($categoryId !== '') {
    $categoryIdInt = Validator::positiveInt($categoryId, 'category_id');
    $where[] = 't.category_id = :category_id';
    $params[':category_id'] = $categoryIdInt;
}
if ($dateFrom !== '') {
    $from = Validator::dateTime($dateFrom, false);
    $where[] = 't.transaction_date >= :date_from';
    $params[':date_from'] = date('Y-m-d 00:00:00', strtotime($from));
}
if ($dateTo !== '') {
    $to = Validator::dateTime($dateTo, false);
    $where[] = 't.transaction_date <= :date_to';
    $params[':date_to'] = date('Y-m-d 23:59:59', strtotime($to));
}
if ($search !== '') {
    $where[] = '(t.note LIKE :search_note OR c.name LIKE :search_category OR fa.name LIKE :search_from OR ta.name LIKE :search_to OR fas.name LIKE :search_from_asset OR tas.name LIKE :search_to_asset)';
    $searchLike = '%' . $search . '%';
    $params[':search_note'] = $searchLike;
    $params[':search_category'] = $searchLike;
    $params[':search_from'] = $searchLike;
    $params[':search_to'] = $searchLike;
    $params[':search_from_asset'] = $searchLike;
    $params[':search_to_asset'] = $searchLike;
}

$whereSql = implode(' AND ', $where);

$sql = "SELECT
            t.id,
            t.transaction_date,
            t.type,
            t.amount,
            t.running_balance,
            t.from_asset_type_id,
            t.to_asset_type_id,
            t.reference_type,
            t.reference_id,
            t.note,
            fa.name AS from_account_name,
            ta.name AS to_account_name,
            fas.name AS from_asset_type_name,
            tas.name AS to_asset_type_name,
            c.name AS category_name
        FROM transactions t
        LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
        LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
        LEFT JOIN asset_types fas ON fas.id = t.from_asset_type_id AND fas.user_id = t.user_id AND fas.is_deleted = 0
        LEFT JOIN asset_types tas ON tas.id = t.to_asset_type_id AND tas.user_id = t.user_id AND tas.is_deleted = 0
        LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
        WHERE {$whereSql}
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT 10000";

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$filename = 'transactions-' . date('Ymd-His') . '.csv';

header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

$fp = fopen('php://output', 'wb');
if ($fp === false) {
    Response::error('Unable to export CSV.', 500);
}

$sanitizeCell = static function (mixed $value): string {
    $text = (string) ($value ?? '');
    if ($text !== '' && in_array($text[0], ['=', '+', '-', '@'], true)) {
        return "'" . $text;
    }
    return $text;
};

fputcsv($fp, [
    'ID',
    'Date',
    'Type',
    'Amount',
    'Running Balance',
    'From Account',
    'To Account',
    'From Asset',
    'To Asset',
    'Category',
    'Reference Type',
    'Reference ID',
    'Note',
]);

foreach ($rows as $row) {
    fputcsv($fp, [
        $sanitizeCell($row['id']),
        $sanitizeCell($row['transaction_date']),
        $sanitizeCell($row['type']),
        $sanitizeCell($row['amount']),
        $sanitizeCell($row['running_balance']),
        $sanitizeCell($row['from_account_name']),
        $sanitizeCell($row['to_account_name']),
        $sanitizeCell($row['from_asset_type_name']),
        $sanitizeCell($row['to_asset_type_name']),
        $sanitizeCell($row['category_name']),
        $sanitizeCell($row['reference_type']),
        $sanitizeCell($row['reference_id']),
        $sanitizeCell($row['note']),
    ]);
}

fclose($fp);
exit;
