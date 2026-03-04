<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('categories_update', 160, 600);
if (!in_array(Request::method(), ['PUT', 'PATCH', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();

$id = Validator::positiveInt($input['id'] ?? 0, 'id');
$name = Validator::string($input['name'] ?? '', 120);
$icon = Validator::string($input['icon'] ?? '', 255);
$color = Validator::string($input['color'] ?? '', 20);

if ($name === '') {
    Response::error('Category name is required.', 422);
}

$check = db()->prepare(
    'SELECT id, type
     FROM categories
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$check->execute([':id' => $id, ':user_id' => $userId]);
$existing = $check->fetch();
if (!$existing) {
    Response::error('Category not found.', 404);
}

$stmt = db()->prepare(
    'UPDATE categories
     SET name = :name,
         icon = :icon,
         color = :color
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0'
);
try {
    $stmt->execute([
        ':name' => $name,
        ':icon' => $icon !== '' ? $icon : null,
        ':color' => $color !== '' ? $color : null,
        ':id' => $id,
        ':user_id' => $userId,
    ]);
} catch (PDOException $exception) {
    if ($exception->getCode() === '23000') {
        Response::error('Category already exists for this type.', 409);
    }
    throw $exception;
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

Response::success('Category updated.', [
    'category' => $fetch->fetch(),
]);
