<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

$pagination = Pagination::fromRequest(20, 100);
$type = trim((string) Request::query('type', ''));
$transactionId = Request::query('id', '');
$accountId = Request::query('account_id', '');
$categoryId = Request::query('category_id', '');
$search = Validator::string(Request::query('search', ''), 100);
$dateFrom = trim((string) Request::query('date_from', ''));
$dateTo = trim((string) Request::query('date_to', ''));
$persistFilters = (int) Request::query('persist_filters', 0) === 1;

$params = [':user_id' => $userId];
$where = ['t.user_id = :user_id', 't.is_deleted = 0'];

if ($type !== '') {
    $type = Validator::enum($type, ['income', 'expense', 'transfer', 'opening_adjustment'], 'type');
    $where[] = 't.type = :type';
    $params[':type'] = $type;
}

if ($transactionId !== '') {
    $idInt = Validator::positiveInt($transactionId, 'id');
    $where[] = 't.id = :id';
    $params[':id'] = $idInt;
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
    $where[] = '(t.note LIKE :search_note OR c.name LIKE :search_category OR fa.name LIKE :search_from OR ta.name LIKE :search_to)';
    $searchLike = '%' . $search . '%';
    $params[':search_note'] = $searchLike;
    $params[':search_category'] = $searchLike;
    $params[':search_from'] = $searchLike;
    $params[':search_to'] = $searchLike;
}

$whereSql = implode(' AND ', $where);

$countSql = "SELECT COUNT(*) AS total
             FROM transactions t
             LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
             LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
             LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
             WHERE {$whereSql}";
$countStmt = db()->prepare($countSql);
$countStmt->execute($params);
$total = (int) (($countStmt->fetch()['total'] ?? 0));

$sql = "SELECT
            t.id, t.user_id, t.from_account_id, t.to_account_id, t.category_id,
            t.amount, t.type, t.running_balance, t.reference_type, t.reference_id,
            t.note, t.location, t.receipt_path, t.transaction_date, t.created_at, t.updated_at,
            fa.name AS from_account_name, ta.name AS to_account_name,
            c.name AS category_name, c.type AS category_type, c.icon AS category_icon, c.color AS category_color
        FROM transactions t
        LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
        LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
        LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
        WHERE {$whereSql}
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT :limit OFFSET :offset";

$stmt = db()->prepare($sql);
foreach ($params as $key => $value) {
    $stmt->bindValue($key, $value);
}
$stmt->bindValue(':limit', $pagination['limit'], PDO::PARAM_INT);
$stmt->bindValue(':offset', $pagination['offset'], PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll();

if ($persistFilters) {
    $filterPayload = [
        'type' => $type,
        'account_id' => $accountId,
        'category_id' => $categoryId,
        'search' => $search,
        'date_from' => $dateFrom,
        'date_to' => $dateTo,
    ];
    $settingsStmt = db()->prepare(
        'UPDATE user_settings
         SET last_transaction_filters = :filters
         WHERE user_id = :user_id'
    );
    $settingsStmt->execute([
        ':filters' => json_encode($filterPayload),
        ':user_id' => $userId,
    ]);
}

$hasMore = ($pagination['offset'] + count($rows)) < $total;

Response::success('Transactions fetched.', [
    'transactions' => $rows,
    'pagination' => [
        'page' => $pagination['page'],
        'limit' => $pagination['limit'],
        'total' => $total,
        'has_more' => $hasMore,
    ],
]);
