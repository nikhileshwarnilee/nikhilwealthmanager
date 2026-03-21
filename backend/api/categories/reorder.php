<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('categories_reorder', 240, 600);
if (!in_array(Request::method(), ['POST', 'PUT', 'PATCH'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();

$type = Validator::enum($input['type'] ?? '', ['income', 'expense'], 'category type');
$orderedIdsRaw = $input['ordered_ids'] ?? null;
if (!is_array($orderedIdsRaw) || count($orderedIdsRaw) === 0) {
    Response::error('ordered_ids must be a non-empty array.', 422);
}

$orderedIds = [];
$seen = [];
foreach ($orderedIdsRaw as $rawId) {
    if (!is_numeric($rawId)) {
        Response::error('ordered_ids must contain numeric ids.', 422);
    }
    $id = (int) $rawId;
    if ($id <= 0) {
        Response::error('ordered_ids must contain positive ids.', 422);
    }
    if (isset($seen[$id])) {
        Response::error('ordered_ids contains duplicate ids.', 422);
    }
    $seen[$id] = true;
    $orderedIds[] = $id;
}

$existingStmt = db()->prepare(
    'SELECT id
     FROM categories
     WHERE user_id = :user_id
       AND type = :type
       AND is_deleted = 0
     ORDER BY sort_order ASC, name ASC, id ASC'
);
$existingStmt->execute([
    ':user_id' => $userId,
    ':type' => $type,
]);
$existingRows = $existingStmt->fetchAll();
$existingIds = array_map(
    static fn(array $row): int => (int) $row['id'],
    $existingRows
);

if (count($orderedIds) !== count($existingIds)) {
    Response::error('ordered_ids count mismatch for this type.', 422, [
        'expected_count' => count($existingIds),
        'received_count' => count($orderedIds),
    ]);
}

$providedSorted = $orderedIds;
$existingSorted = $existingIds;
sort($providedSorted);
sort($existingSorted);
if ($providedSorted !== $existingSorted) {
    Response::error('ordered_ids must include exactly all active categories for this type.', 422);
}

$pdo = db();
$pdo->beginTransaction();
try {
    $updateStmt = $pdo->prepare(
        'UPDATE categories
         SET sort_order = :sort_order
         WHERE id = :id
           AND user_id = :user_id
           AND type = :type
           AND is_deleted = 0'
    );

    foreach ($orderedIds as $index => $categoryId) {
        $updateStmt->execute([
            ':sort_order' => $index + 1,
            ':id' => $categoryId,
            ':user_id' => $userId,
            ':type' => $type,
        ]);
    }

    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}

$fetchStmt = db()->prepare(
    'SELECT id, name, type, icon, color, is_default, sort_order, created_at, updated_at
     FROM categories
     WHERE user_id = :user_id
       AND type = :type
       AND is_deleted = 0
     ORDER BY sort_order ASC, name ASC, id ASC'
);
$fetchStmt->execute([
    ':user_id' => $userId,
    ':type' => $type,
]);

Response::success('Category order updated.', [
    'type' => $type,
    'categories' => $fetchStmt->fetchAll(),
]);

