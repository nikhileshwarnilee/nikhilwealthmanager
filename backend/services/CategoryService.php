<?php

declare(strict_types=1);

final class CategoryService
{
    public static function seedDefaultCategories(int $userId): void
    {
        $defaults = [
            ['Salary', 'income', 'wallet', '#16a34a'],
            ['Freelance', 'income', 'briefcase', '#0ea5e9'],
            ['Food', 'expense', 'utensils', '#f97316'],
            ['Transport', 'expense', 'car', '#0ea5e9'],
            ['Shopping', 'expense', 'bag', '#d946ef'],
            ['Utilities', 'expense', 'bolt', '#f59e0b'],
            ['Health', 'expense', 'heart', '#ef4444'],
        ];

        $db = db();

        $restoreStmt = $db->prepare(
            'UPDATE categories
             SET icon = :icon,
                 color = :color,
                 is_default = 1,
                 sort_order = CASE WHEN sort_order > 0 THEN sort_order ELSE :sort_order END,
                 is_deleted = 0
             WHERE user_id = :user_id
               AND name = :name
               AND type = :type
             LIMIT 1'
        );

        $checkStmt = $db->prepare(
            'SELECT id
             FROM categories
             WHERE user_id = :user_id
               AND name = :name
               AND type = :type
               AND is_deleted = 0
             LIMIT 1'
        );

        $insertStmt = $db->prepare(
            'INSERT INTO categories (user_id, name, type, icon, color, is_default, sort_order, is_deleted)
             VALUES (:user_id, :name, :type, :icon, :color, 1, :sort_order, 0)'
        );

        $nextSortStmt = $db->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
             FROM categories
             WHERE user_id = :user_id
               AND type = :type
               AND is_deleted = 0'
        );

        foreach ($defaults as [$name, $type, $icon, $color]) {
            $nextSortStmt->execute([
                ':user_id' => $userId,
                ':type' => $type,
            ]);
            $nextSortOrder = (int) (($nextSortStmt->fetch()['next_sort_order'] ?? 1));

            $restoreStmt->execute([
                ':user_id' => $userId,
                ':name' => $name,
                ':type' => $type,
                ':icon' => $icon,
                ':color' => $color,
                ':sort_order' => $nextSortOrder,
            ]);

            $checkStmt->execute([
                ':user_id' => $userId,
                ':name' => $name,
                ':type' => $type,
            ]);
            if ($checkStmt->fetch()) {
                continue;
            }

            try {
                $insertStmt->execute([
                    ':user_id' => $userId,
                    ':name' => $name,
                    ':type' => $type,
                    ':icon' => $icon,
                    ':color' => $color,
                    ':sort_order' => $nextSortOrder,
                ]);
            } catch (PDOException $exception) {
                if ($exception->getCode() !== '23000') {
                    throw $exception;
                }
            }
        }
    }
}
