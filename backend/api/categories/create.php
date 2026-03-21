<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('categories_create', 120, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);

$input = Request::body();
$name = Validator::string($input['name'] ?? '', 120);
$type = Validator::enum($input['type'] ?? '', ['income', 'expense'], 'category type');
$icon = Validator::string($input['icon'] ?? '', 255);
$color = Validator::string($input['color'] ?? '', 20);

if ($name === '') {
    Response::error('Category name is required.', 422);
}

$existingStmt = db()->prepare(
    'SELECT id, is_deleted, sort_order
     FROM categories
     WHERE user_id = :user_id
       AND name = :name
       AND type = :type
     LIMIT 1'
);
$existingStmt->execute([
    ':user_id' => $userId,
    ':name' => $name,
    ':type' => $type,
]);
$existing = $existingStmt->fetch();

if ($existing && (int) $existing['is_deleted'] === 0) {
    Response::error('Category already exists for this type.', 409);
}

$nextSortStmt = db()->prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
     FROM categories
     WHERE user_id = :user_id
       AND type = :type
       AND is_deleted = 0'
);
$nextSortStmt->execute([
    ':user_id' => $userId,
    ':type' => $type,
]);
$nextSortOrder = (int) (($nextSortStmt->fetch()['next_sort_order'] ?? 1));

if ($existing && (int) $existing['is_deleted'] === 1) {
    $restoreStmt = db()->prepare(
        'UPDATE categories
         SET icon = :icon,
             color = :color,
             is_default = 0,
             sort_order = :sort_order,
             is_deleted = 0
         WHERE id = :id
           AND user_id = :user_id
         LIMIT 1'
    );
    $restoreStmt->execute([
        ':id' => (int) $existing['id'],
        ':user_id' => $userId,
        ':icon' => $icon !== '' ? $icon : null,
        ':color' => $color !== '' ? $color : null,
        ':sort_order' => $nextSortOrder,
    ]);
    $id = (int) $existing['id'];
} else {
    $stmt = db()->prepare(
        'INSERT INTO categories (user_id, name, type, icon, color, is_default, sort_order, is_deleted)
         VALUES (:user_id, :name, :type, :icon, :color, 0, :sort_order, 0)'
    );
    $stmt->execute([
        ':user_id' => $userId,
        ':name' => $name,
        ':type' => $type,
        ':icon' => $icon !== '' ? $icon : null,
        ':color' => $color !== '' ? $color : null,
        ':sort_order' => $nextSortOrder,
    ]);
    $id = (int) db()->lastInsertId();
}

$fetch = db()->prepare(
    'SELECT id, name, type, icon, color, is_default, sort_order, created_at, updated_at
     FROM categories
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$fetch->execute([':id' => $id, ':user_id' => $userId]);

Response::success('Category created.', [
    'category' => $fetch->fetch(),
], 201);
