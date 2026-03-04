<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('categories_seed_defaults', 20, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();

CategoryService::seedDefaultCategories((int) $user['id']);

$stmt = db()->prepare(
    'SELECT id, name, type, icon, color, is_default, sort_order, created_at, updated_at
     FROM categories
     WHERE user_id = :user_id
       AND is_deleted = 0
     ORDER BY type, sort_order, name, id'
);
$stmt->execute([':user_id' => (int) $user['id']]);

Response::success('Default categories ensured.', [
    'categories' => $stmt->fetchAll(),
]);
