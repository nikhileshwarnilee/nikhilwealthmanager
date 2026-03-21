<?php

declare(strict_types=1);

final class BudgetService
{
    public static function upsert(int $userId, int $categoryId, string $month, float $amount): array
    {
        self::assertExpenseCategory($userId, $categoryId);

        $stmt = db()->prepare(
            'INSERT INTO budgets (user_id, category_id, month, amount)
             VALUES (:user_id, :category_id, :month, :amount)
             ON DUPLICATE KEY UPDATE amount = VALUES(amount), updated_at = CURRENT_TIMESTAMP'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':category_id' => $categoryId,
            ':month' => $month,
            ':amount' => round($amount, 2),
        ]);

        $fetch = db()->prepare(
            'SELECT b.id, b.user_id, b.category_id, b.month, b.amount, b.created_at, b.updated_at, c.name AS category_name
             FROM budgets b
             INNER JOIN categories c ON c.id = b.category_id AND c.is_deleted = 0
             WHERE b.user_id = :user_id AND b.category_id = :category_id AND b.month = :month
             LIMIT 1'
        );
        $fetch->execute([
            ':user_id' => $userId,
            ':category_id' => $categoryId,
            ':month' => $month,
        ]);

        return $fetch->fetch() ?: [];
    }

    public static function vsActual(int $userId, string $month, ?int $businessId = null, array $allowedAccountIds = []): array
    {
        $transactionScopeParams = [];
        $transactionScopeSql = UserAccountAccessService::buildTransactionScopeSql(
            't',
            $allowedAccountIds,
            $transactionScopeParams,
            'budget_scope',
            false
        );

        if ($month === 'all') {
            $businessJoin = $businessId !== null ? ' AND t.business_id = :business_id' : '';
            $stmt = db()->prepare(
                'SELECT
                    b.id,
                    b.category_id,
                    c.name AS category_name,
                    c.color AS category_color,
                    b.month,
                    b.amount AS budget_amount,
                    COALESCE(SUM(t.amount), 0) AS spent_amount
                 FROM budgets b
                 INNER JOIN categories c ON c.id = b.category_id AND c.is_deleted = 0
                 LEFT JOIN transactions t
                   ON t.user_id = b.user_id
                  AND t.category_id = b.category_id
                  AND t.is_deleted = 0
                  AND t.type = \'expense\'
                  ' . $businessJoin . '
                  ' . $transactionScopeSql . '
                  AND t.transaction_date BETWEEN
                      CONCAT(b.month, \'-01 00:00:00\')
                      AND DATE_FORMAT(LAST_DAY(CONCAT(b.month, \'-01\')), \'%Y-%m-%d 23:59:59\')
                 WHERE b.user_id = :user_id
                 GROUP BY b.id, b.category_id, c.name, c.color, b.month, b.amount
                 ORDER BY b.month DESC, c.name ASC'
            );
            $params = [
                ':user_id' => $userId,
            ];
            if ($businessId !== null) {
                $params[':business_id'] = $businessId;
            }
            $params = array_merge($params, $transactionScopeParams);
            $stmt->execute($params);
        } else {
            $start = $month . '-01 00:00:00';
            $end = date('Y-m-t 23:59:59', strtotime($start));
            $businessJoin = $businessId !== null ? ' AND t.business_id = :business_id' : '';

            $stmt = db()->prepare(
                'SELECT
                    b.id,
                    b.category_id,
                    c.name AS category_name,
                    c.color AS category_color,
                    b.month,
                    b.amount AS budget_amount,
                    COALESCE(SUM(t.amount), 0) AS spent_amount
                 FROM budgets b
                 INNER JOIN categories c ON c.id = b.category_id AND c.is_deleted = 0
                 LEFT JOIN transactions t
                   ON t.user_id = b.user_id
                  AND t.category_id = b.category_id
                  AND t.is_deleted = 0
                  AND t.type = \'expense\'
                  ' . $businessJoin . '
                  ' . $transactionScopeSql . '
                  AND t.transaction_date BETWEEN :start_date AND :end_date
                 WHERE b.user_id = :user_id
                   AND b.month = :month
                 GROUP BY b.id, b.category_id, c.name, c.color, b.month, b.amount
                 ORDER BY c.name ASC'
            );
            $params = [
                ':start_date' => $start,
                ':end_date' => $end,
                ':user_id' => $userId,
                ':month' => $month,
            ];
            if ($businessId !== null) {
                $params[':business_id'] = $businessId;
            }
            $params = array_merge($params, $transactionScopeParams);
            $stmt->execute($params);
        }

        $rows = $stmt->fetchAll();

        $totalBudget = 0.0;
        $totalSpent = 0.0;
        foreach ($rows as &$row) {
            $budget = (float) $row['budget_amount'];
            $spent = (float) $row['spent_amount'];
            $remaining = round($budget - $spent, 2);
            $util = $budget > 0 ? round(($spent / $budget) * 100, 2) : 0.0;
            $row['remaining_amount'] = $remaining;
            $row['utilization_percent'] = $util;
            $row['is_over_budget'] = $spent > $budget;
            $totalBudget += $budget;
            $totalSpent += $spent;
        }
        unset($row);

        $totalUtil = $totalBudget > 0 ? round(($totalSpent / $totalBudget) * 100, 2) : 0.0;

        return [
            'month' => $month,
            'total_budget' => round($totalBudget, 2),
            'total_spent' => round($totalSpent, 2),
            'total_remaining' => round($totalBudget - $totalSpent, 2),
            'total_utilization_percent' => $totalUtil,
            'items' => $rows,
        ];
    }

    public static function alerts(int $userId, string $month, ?int $businessId = null, array $allowedAccountIds = []): array
    {
        $data = self::vsActual($userId, $month, $businessId, $allowedAccountIds);
        $alerts = [];

        foreach ($data['items'] as $item) {
            $util = (float) $item['utilization_percent'];
            if ((bool) $item['is_over_budget']) {
                $alerts[] = [
                    'level' => 'danger',
                    'category_id' => (int) $item['category_id'],
                    'category_name' => $item['category_name'],
                    'month' => (string) ($item['month'] ?? $month),
                    'message' => sprintf(
                        'You exceeded %s budget by %.2f%% (%s).',
                        $item['category_name'],
                        max(0, $util - 100),
                        (string) ($item['month'] ?? $month)
                    ),
                    'utilization_percent' => $util,
                ];
            } elseif ($util >= 80) {
                $alerts[] = [
                    'level' => 'warning',
                    'category_id' => (int) $item['category_id'],
                    'category_name' => $item['category_name'],
                    'month' => (string) ($item['month'] ?? $month),
                    'message' => sprintf(
                        '%s budget reached %.2f%% (%s).',
                        $item['category_name'],
                        $util,
                        (string) ($item['month'] ?? $month)
                    ),
                    'utilization_percent' => $util,
                ];
            }
        }

        return $alerts;
    }

    public static function delete(int $userId, int $id): void
    {
        $stmt = db()->prepare('DELETE FROM budgets WHERE id = :id AND user_id = :user_id');
        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
        ]);
    }

    private static function assertExpenseCategory(int $userId, int $categoryId): void
    {
        $stmt = db()->prepare(
            'SELECT id
             FROM categories
             WHERE id = :id
               AND user_id = :user_id
               AND type = \'expense\'
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $categoryId,
            ':user_id' => $userId,
        ]);
        if (!$stmt->fetch()) {
            Response::error('Budget can only be set for your expense categories.', 422);
        }
    }
}
