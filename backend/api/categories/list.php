<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);

$type = trim((string) Request::query('type', ''));
$params = [':user_id' => $userId];
$sql = 'SELECT id, name, type, icon, color, is_default, sort_order, created_at, updated_at
        FROM categories
        WHERE user_id = :user_id
          AND is_deleted = 0';

if ($type !== '') {
    $type = Validator::enum($type, ['income', 'expense'], 'category type');
    $sql .= ' AND type = :type';
    $params[':type'] = $type;
}

$sql .= ' ORDER BY type ASC, sort_order ASC, name ASC, id ASC';

$stmt = db()->prepare($sql);
$stmt->execute($params);

Response::success('Categories fetched.', [
    'categories' => $stmt->fetchAll(),
]);
