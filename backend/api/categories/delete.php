<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('categories_delete', 120, 600);
if (!in_array(Request::method(), ['DELETE', 'POST'], true)) {
    Response::error('Method not allowed.', 405);
}

$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();
$id = Validator::positiveInt($input['id'] ?? Request::query('id', 0), 'id');
$replacementCategoryId = Validator::nullablePositiveInt($input['replacement_category_id'] ?? null);

$check = db()->prepare(
    'SELECT id, type, is_default
     FROM categories
     WHERE id = :id
       AND user_id = :user_id
       AND is_deleted = 0
     LIMIT 1'
);
$check->execute([':id' => $id, ':user_id' => $userId]);
$category = $check->fetch();

if (!$category) {
    Response::error('Category not found.', 404);
}
if ((int) $category['is_default'] === 1) {
    Response::error('Default categories cannot be deleted.', 422);
}

$txCountStmt = db()->prepare(
    'SELECT COUNT(*) AS total
     FROM transactions
     WHERE user_id = :user_id
       AND is_deleted = 0
       AND category_id = :category_id'
);
$txCountStmt->execute([
    ':user_id' => $userId,
    ':category_id' => $id,
]);
$transactionCount = (int) (($txCountStmt->fetch()['total'] ?? 0));

if ($transactionCount > 0 && $replacementCategoryId === null) {
    $candidatesStmt = db()->prepare(
        'SELECT id, name, type, icon, color
         FROM categories
         WHERE user_id = :user_id
           AND is_deleted = 0
           AND type = :type
           AND id <> :id
         ORDER BY sort_order ASC, name ASC, id ASC'
    );
    $candidatesStmt->execute([
        ':user_id' => $userId,
        ':type' => $category['type'],
        ':id' => $id,
    ]);

    Response::error(
        'Category has transactions and requires reallocation.',
        409,
        [
            'requires_reallocation' => true,
            'transaction_count' => $transactionCount,
            'categories' => $candidatesStmt->fetchAll(),
        ]
    );
}

if ($replacementCategoryId !== null) {
    if ($replacementCategoryId === $id) {
        Response::error('Replacement category must be different.', 422);
    }

    $replacementStmt = db()->prepare(
        'SELECT id, type
         FROM categories
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0
         LIMIT 1'
    );
    $replacementStmt->execute([
        ':id' => $replacementCategoryId,
        ':user_id' => $userId,
    ]);
    $replacement = $replacementStmt->fetch();
    if (!$replacement) {
        Response::error('Replacement category not found.', 422);
    }
    if ((string) $replacement['type'] !== (string) $category['type']) {
        Response::error('Replacement category type must match.', 422);
    }
}

$pdo = db();
$pdo->beginTransaction();

try {
    if ($replacementCategoryId !== null) {
        $moveTxStmt = $pdo->prepare(
            'UPDATE transactions
             SET category_id = :replacement_category_id
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND category_id = :source_category_id'
        );
        $moveTxStmt->execute([
            ':replacement_category_id' => $replacementCategoryId,
            ':user_id' => $userId,
            ':source_category_id' => $id,
        ]);

        $mergeBudgetStmt = $pdo->prepare(
            'INSERT INTO budgets (user_id, category_id, month, amount)
             SELECT user_id, :replacement_category_id, month, amount
             FROM budgets
             WHERE user_id = :user_id
               AND category_id = :source_category_id
             ON DUPLICATE KEY UPDATE
                amount = budgets.amount + VALUES(amount),
                updated_at = CURRENT_TIMESTAMP'
        );
        $mergeBudgetStmt->execute([
            ':replacement_category_id' => $replacementCategoryId,
            ':user_id' => $userId,
            ':source_category_id' => $id,
        ]);
    }

    $deleteBudgetStmt = $pdo->prepare(
        'DELETE FROM budgets
         WHERE user_id = :user_id
           AND category_id = :source_category_id'
    );
    $deleteBudgetStmt->execute([
        ':user_id' => $userId,
        ':source_category_id' => $id,
    ]);

    $softDeleteStmt = $pdo->prepare(
        'UPDATE categories
         SET is_deleted = 1
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0'
    );
    $softDeleteStmt->execute([
        ':id' => $id,
        ':user_id' => $userId,
    ]);

    $pdo->commit();

    Response::success('Category deleted.', [
        'replacement_category_id' => $replacementCategoryId,
        'moved_transactions' => $transactionCount,
    ]);
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}
