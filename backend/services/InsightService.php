<?php

declare(strict_types=1);

final class InsightService
{
    public static function monthly(int $userId, string $month, array $allowedAccountIds = []): array
    {
        if ($month === 'all') {
            return self::allTime($userId, $allowedAccountIds);
        }

        $currentStart = $month . '-01 00:00:00';
        $currentEnd = date('Y-m-t 23:59:59', strtotime($currentStart));
        $previousMonth = date('Y-m', strtotime($month . '-01 -1 month'));
        $previousStart = $previousMonth . '-01 00:00:00';
        $previousEnd = date('Y-m-t 23:59:59', strtotime($previousStart));

        $insights = [];

        $totalsParams = [
            ':user_id' => $userId,
            ':current_start_income' => $currentStart,
            ':current_end_income' => $currentEnd,
            ':prev_start_income' => $previousStart,
            ':prev_end_income' => $previousEnd,
            ':current_start_expense' => $currentStart,
            ':current_end_expense' => $currentEnd,
            ':prev_start_expense' => $previousStart,
            ':prev_end_expense' => $previousEnd,
        ];
        $totalsStmt = db()->prepare(
            'SELECT
                SUM(CASE WHEN type = \'income\' AND transaction_date BETWEEN :current_start_income AND :current_end_income THEN amount ELSE 0 END) AS current_income,
                SUM(CASE WHEN type = \'income\' AND transaction_date BETWEEN :prev_start_income AND :prev_end_income THEN amount ELSE 0 END) AS prev_income,
                SUM(CASE WHEN type = \'expense\' AND transaction_date BETWEEN :current_start_expense AND :current_end_expense THEN amount ELSE 0 END) AS current_expense,
                SUM(CASE WHEN type = \'expense\' AND transaction_date BETWEEN :prev_start_expense AND :prev_end_expense THEN amount ELSE 0 END) AS prev_expense
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0'
            . UserAccountAccessService::buildTransactionScopeSql(
                'transactions',
                $allowedAccountIds,
                $totalsParams,
                'insight_monthly_totals',
                false
            )
        );
        $totalsStmt->execute($totalsParams);
        $totals = $totalsStmt->fetch() ?: [];

        $currentIncome = (float) ($totals['current_income'] ?? 0);
        $previousIncome = (float) ($totals['prev_income'] ?? 0);
        $currentExpense = (float) ($totals['current_expense'] ?? 0);
        $previousExpense = (float) ($totals['prev_expense'] ?? 0);

        if ($previousIncome > 0 && $currentIncome < $previousIncome) {
            $drop = round((($previousIncome - $currentIncome) / $previousIncome) * 100, 2);
            $insights[] = [
                'level' => $drop >= 15 ? 'danger' : 'warning',
                'code' => 'income_drop',
                'message' => sprintf('Your income dropped %.2f%% versus last month.', $drop),
            ];
        }

        if ($previousExpense > 0 && $currentExpense > $previousExpense) {
            $rise = round((($currentExpense - $previousExpense) / $previousExpense) * 100, 2);
            $insights[] = [
                'level' => $rise >= 25 ? 'warning' : 'info',
                'code' => 'expense_increase',
                'message' => sprintf('Total expenses increased %.2f%% versus last month.', $rise),
            ];
        }

        $foodTrend = self::categoryTrend(
            $userId,
            'Food',
            $currentStart,
            $currentEnd,
            $previousStart,
            $previousEnd,
            $allowedAccountIds
        );
        if ($foodTrend !== null && $foodTrend['previous'] > 0 && $foodTrend['current'] > $foodTrend['previous']) {
            $rise = round((($foodTrend['current'] - $foodTrend['previous']) / $foodTrend['previous']) * 100, 2);
            if ($rise >= 25) {
                $insights[] = [
                    'level' => 'warning',
                    'code' => 'food_increase',
                    'message' => sprintf('Food spending increased %.2f%% compared to last month.', $rise),
                ];
            }
        }

        $budgetAlerts = BudgetService::alerts($userId, $month, null, $allowedAccountIds);
        foreach ($budgetAlerts as $alert) {
            if ($alert['level'] === 'danger') {
                $insights[] = [
                    'level' => 'danger',
                    'code' => 'budget_exceeded',
                    'message' => $alert['message'],
                ];
            }
        }

        $topSpendParams = [
            ':current_start' => $currentStart,
            ':current_end' => $currentEnd,
            ':user_id' => $userId,
        ];
        $topSpendStmt = db()->prepare(
            'SELECT c.name AS category_name, COALESCE(SUM(t.amount), 0) AS total_spent
             FROM categories c
             LEFT JOIN transactions t
               ON t.category_id = c.id
              AND t.type = \'expense\'
              AND t.user_id = c.user_id
              AND t.is_deleted = 0
              AND t.transaction_date BETWEEN :current_start AND :current_end'
            . UserAccountAccessService::buildTransactionScopeSql(
                't',
                $allowedAccountIds,
                $topSpendParams,
                'insight_monthly_top_spend',
                false
            ) . '
             WHERE c.user_id = :user_id
               AND c.is_deleted = 0
               AND c.type = \'expense\'
             GROUP BY c.id, c.name
             ORDER BY total_spent DESC
             LIMIT 1'
        );
        $topSpendStmt->execute($topSpendParams);
        $top = $topSpendStmt->fetch();
        if ($top && (float) $top['total_spent'] > 0) {
            $insights[] = [
                'level' => 'info',
                'code' => 'top_spend',
                'message' => sprintf(
                    'Top spending category this month: %s (%.2f).',
                    $top['category_name'],
                    (float) $top['total_spent']
                ),
            ];
        }

        if (empty($insights)) {
            $insights[] = [
                'level' => 'success',
                'code' => 'stable_month',
                'message' => 'Spending patterns are stable this month. Keep it up.',
            ];
        }

        return $insights;
    }

    private static function allTime(int $userId, array $allowedAccountIds = []): array
    {
        $params = [':user_id' => $userId];
        $stmt = db()->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN type = \'income\' THEN amount ELSE 0 END), 0) AS income_total,
                COALESCE(SUM(CASE WHEN type = \'expense\' THEN amount ELSE 0 END), 0) AS expense_total,
                COUNT(*) AS transaction_count
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0'
            . UserAccountAccessService::buildTransactionScopeSql(
                'transactions',
                $allowedAccountIds,
                $params,
                'insight_all_time_totals',
                false
            )
        );
        $stmt->execute($params);
        $row = $stmt->fetch() ?: ['income_total' => 0, 'expense_total' => 0, 'transaction_count' => 0];

        $income = (float) ($row['income_total'] ?? 0);
        $expense = (float) ($row['expense_total'] ?? 0);
        $net = round($income - $expense, 2);
        $count = (int) ($row['transaction_count'] ?? 0);

        $insights = [];
        if ($count === 0) {
            $insights[] = [
                'level' => 'info',
                'code' => 'all_time_empty',
                'message' => 'No transactions found yet.',
            ];
            return $insights;
        }

        $insights[] = [
            'level' => $net >= 0 ? 'success' : 'warning',
            'code' => 'all_time_net',
            'message' => sprintf('All-time net cashflow: %.2f.', $net),
        ];
        $insights[] = [
            'level' => 'info',
            'code' => 'all_time_counts',
            'message' => sprintf(
                'All-time totals - Income: %.2f, Expense: %.2f, Transactions: %d.',
                $income,
                $expense,
                $count
            ),
        ];

        $topSpendParams = [':user_id' => $userId];
        $topSpendStmt = db()->prepare(
            'SELECT c.name AS category_name, COALESCE(SUM(t.amount), 0) AS total_spent
             FROM categories c
             LEFT JOIN transactions t
               ON t.category_id = c.id
              AND t.type = \'expense\'
              AND t.user_id = c.user_id
              AND t.is_deleted = 0'
            . UserAccountAccessService::buildTransactionScopeSql(
                't',
                $allowedAccountIds,
                $topSpendParams,
                'insight_all_time_top_spend',
                false
            ) . '
             WHERE c.user_id = :user_id
               AND c.is_deleted = 0
               AND c.type = \'expense\'
             GROUP BY c.id, c.name
             ORDER BY total_spent DESC
             LIMIT 1'
        );
        $topSpendStmt->execute($topSpendParams);
        $top = $topSpendStmt->fetch();
        if ($top && (float) $top['total_spent'] > 0) {
            $insights[] = [
                'level' => 'info',
                'code' => 'all_time_top_spend',
                'message' => sprintf(
                    'Top spending category (all time): %s (%.2f).',
                    $top['category_name'],
                    (float) $top['total_spent']
                ),
            ];
        }

        $alerts = BudgetService::alerts($userId, 'all', null, $allowedAccountIds);
        foreach ($alerts as $alert) {
            if ($alert['level'] === 'danger') {
                $insights[] = [
                    'level' => 'danger',
                    'code' => 'all_time_budget_exceeded',
                    'message' => (string) ($alert['message'] ?? ''),
                ];
            }
        }

        return $insights;
    }

    private static function categoryTrend(
        int $userId,
        string $categoryName,
        string $currentStart,
        string $currentEnd,
        string $previousStart,
        string $previousEnd,
        array $allowedAccountIds = []
    ): ?array {
        $params = [
            ':user_id' => $userId,
            ':category_name' => $categoryName,
            ':current_start' => $currentStart,
            ':current_end' => $currentEnd,
            ':prev_start' => $previousStart,
            ':prev_end' => $previousEnd,
        ];
        $stmt = db()->prepare(
            'SELECT
                SUM(CASE WHEN t.transaction_date BETWEEN :current_start AND :current_end THEN t.amount ELSE 0 END) AS current_total,
                SUM(CASE WHEN t.transaction_date BETWEEN :prev_start AND :prev_end THEN t.amount ELSE 0 END) AS prev_total
             FROM categories c
             LEFT JOIN transactions t
               ON t.category_id = c.id
              AND t.type = \'expense\'
              AND t.user_id = c.user_id
              AND t.is_deleted = 0'
            . UserAccountAccessService::buildTransactionScopeSql(
                't',
                $allowedAccountIds,
                $params,
                'insight_category_trend',
                false
            ) . '
             WHERE c.user_id = :user_id
               AND c.is_deleted = 0
               AND c.type = \'expense\'
               AND c.name = :category_name
             LIMIT 1'
        );
        $stmt->execute($params);
        $row = $stmt->fetch();
        if (!$row) {
            return null;
        }
        return [
            'current' => (float) ($row['current_total'] ?? 0),
            'previous' => (float) ($row['prev_total'] ?? 0),
        ];
    }
}
