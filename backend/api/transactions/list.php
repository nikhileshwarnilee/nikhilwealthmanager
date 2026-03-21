<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$settingsUserId = (int) $user['id'];
$allowedAccountIds = UserAccountAccessService::allowedAccountIds($user);

$pagination = Pagination::fromRequest(20, 100);
$type = trim((string) Request::query('type', ''));
$transactionId = Request::query('id', '');
$accountId = Request::query('account_id', '');
$assetTypeId = Request::query('asset_type_id', '');
$categoryId = Request::query('category_id', '');
$businessId = Request::query('business_id', '');
$createdByUserId = WorkspaceUserService::resolveTransactionCreatorFilter($user, Request::query('created_by_user_id', ''));
$search = Validator::string(Request::query('search', ''), 100);
$dateFrom = trim((string) Request::query('date_from', ''));
$dateTo = trim((string) Request::query('date_to', ''));
$persistFilters = (int) Request::query('persist_filters', 0) === 1;

$params = [':user_id' => $userId];
$where = ['t.user_id = :user_id', 't.is_deleted = 0'];
$where[] = '1 = 1' . UserAccountAccessService::buildTransactionScopeSql('t', $allowedAccountIds, $params, 'tx_scope');

if ($type !== '') {
    $type = Validator::enum($type, ['income', 'expense', 'transfer', 'opening_adjustment', 'asset'], 'type');
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

if ($assetTypeId !== '') {
    $assetTypeIdInt = Validator::positiveInt($assetTypeId, 'asset_type_id');
    $where[] = '(t.from_asset_type_id = :asset_from_id OR t.to_asset_type_id = :asset_to_id)';
    $params[':asset_from_id'] = $assetTypeIdInt;
    $params[':asset_to_id'] = $assetTypeIdInt;
}

if ($categoryId !== '') {
    $categoryIdInt = Validator::positiveInt($categoryId, 'category_id');
    $where[] = 't.category_id = :category_id';
    $params[':category_id'] = $categoryIdInt;
}

if ($businessId !== '') {
    $businessIdInt = Validator::positiveInt($businessId, 'business_id');
    $where[] = 't.business_id = :business_id';
    $params[':business_id'] = $businessIdInt;
}

if ($createdByUserId !== null) {
    $where[] = 't.created_by_user_id = :created_by_user_id';
    $params[':created_by_user_id'] = $createdByUserId;
}

if ($search === '' && $dateFrom !== '') {
    $from = Validator::dateTime($dateFrom, false);
    $where[] = 't.transaction_date >= :date_from';
    $params[':date_from'] = date('Y-m-d 00:00:00', strtotime($from));
}

if ($search === '' && $dateTo !== '') {
    $to = Validator::dateTime($dateTo, false);
    $where[] = 't.transaction_date <= :date_to';
    $params[':date_to'] = date('Y-m-d 23:59:59', strtotime($to));
}

if ($search !== '') {
    $where[] = '(t.note LIKE :search_note
        OR c.name LIKE :search_category
        OR fa.name LIKE :search_from
        OR ta.name LIKE :search_to
        OR fas.name LIKE :search_from_asset
        OR tas.name LIKE :search_to_asset
        OR b.name LIKE :search_business
        OR b.notes LIKE :search_business_notes
        OR creator.name LIKE :search_creator
        OR t.type LIKE :search_type
        OR t.location LIKE :search_location
        OR CAST(t.amount AS CHAR) LIKE :search_amount
        OR CAST(t.id AS CHAR) LIKE :search_id
        OR DATE_FORMAT(t.transaction_date, \'%Y-%m-%d\') LIKE :search_date_iso
        OR DATE_FORMAT(t.transaction_date, \'%d-%m-%Y\') LIKE :search_date_dmy_dash
        OR DATE_FORMAT(t.transaction_date, \'%d/%m/%Y\') LIKE :search_date_dmy_slash
        OR DATE_FORMAT(t.transaction_date, \'%H:%i\') LIKE :search_time_24
        OR DATE_FORMAT(t.transaction_date, \'%h:%i %p\') LIKE :search_time_12)';
    $searchLike = '%' . $search . '%';
    $params[':search_note'] = $searchLike;
    $params[':search_category'] = $searchLike;
    $params[':search_from'] = $searchLike;
    $params[':search_to'] = $searchLike;
    $params[':search_from_asset'] = $searchLike;
    $params[':search_to_asset'] = $searchLike;
    $params[':search_business'] = $searchLike;
    $params[':search_business_notes'] = $searchLike;
    $params[':search_creator'] = $searchLike;
    $params[':search_type'] = $searchLike;
    $params[':search_location'] = $searchLike;
    $params[':search_amount'] = $searchLike;
    $params[':search_id'] = $searchLike;
    $params[':search_date_iso'] = $searchLike;
    $params[':search_date_dmy_dash'] = $searchLike;
    $params[':search_date_dmy_slash'] = $searchLike;
    $params[':search_time_24'] = $searchLike;
    $params[':search_time_12'] = $searchLike;
}

$whereSql = implode(' AND ', $where);

$countSql = "SELECT COUNT(*) AS total
             FROM transactions t
             LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
             LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
             LEFT JOIN asset_types fas ON fas.id = t.from_asset_type_id AND fas.user_id = t.user_id AND fas.is_deleted = 0
             LEFT JOIN asset_types tas ON tas.id = t.to_asset_type_id AND tas.user_id = t.user_id AND tas.is_deleted = 0
             LEFT JOIN businesses b ON b.id = t.business_id AND b.user_id = t.user_id AND b.is_deleted = 0
             LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
             LEFT JOIN users creator ON creator.id = t.created_by_user_id
             WHERE {$whereSql}";
$countStmt = db()->prepare($countSql);
$countStmt->execute($params);
$total = (int) (($countStmt->fetch()['total'] ?? 0));

$sql = "SELECT
            t.id, t.user_id, t.created_by_user_id, t.from_account_id, t.to_account_id, t.category_id, t.business_id,
            t.from_asset_type_id, t.to_asset_type_id,
            t.amount, t.type, t.running_balance, t.reference_type, t.reference_id,
            t.note, t.location, t.receipt_path, t.transaction_date, t.created_at, t.updated_at,
            creator.name AS created_by_name,
            fa.name AS from_account_name, ta.name AS to_account_name,
            fas.name AS from_asset_type_name, fas.icon AS from_asset_type_icon,
            tas.name AS to_asset_type_name, tas.icon AS to_asset_type_icon, b.name AS business_name,
            c.name AS category_name, c.type AS category_type, c.icon AS category_icon, c.color AS category_color
        FROM transactions t
        LEFT JOIN accounts fa ON fa.id = t.from_account_id AND fa.user_id = t.user_id AND fa.is_deleted = 0
        LEFT JOIN accounts ta ON ta.id = t.to_account_id AND ta.user_id = t.user_id AND ta.is_deleted = 0
        LEFT JOIN asset_types fas ON fas.id = t.from_asset_type_id AND fas.user_id = t.user_id AND fas.is_deleted = 0
        LEFT JOIN asset_types tas ON tas.id = t.to_asset_type_id AND tas.user_id = t.user_id AND tas.is_deleted = 0
        LEFT JOIN businesses b ON b.id = t.business_id AND b.user_id = t.user_id AND b.is_deleted = 0
        LEFT JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id AND c.is_deleted = 0
        LEFT JOIN users creator ON creator.id = t.created_by_user_id
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
$rows = array_map(
    static fn (array $row): array => array_merge(
        $row,
        ['permissions' => TransactionService::mutationAccessSummary($row, $user)]
    ),
    $rows ?: []
);

if ($persistFilters) {
    $filterPayload = [
        'type' => $type,
        'account_id' => $accountId,
        'asset_type_id' => $assetTypeId,
        'business_id' => $businessId,
        'created_by_user_id' => $createdByUserId !== null ? (string) $createdByUserId : '',
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
        ':user_id' => $settingsUserId,
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
