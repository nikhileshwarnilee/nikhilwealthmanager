<?php

declare(strict_types=1);

final class PermissionService
{
    public static function featureKeys(): array
    {
        return [
            'transactions',
            'accounts',
            'categories',
            'budgets',
            'charts',
            'reports',
            'businesses',
            'ledger',
            'assets',
        ];
    }

    public static function defaultFeaturePermissions(): array
    {
        return array_fill_keys(self::featureKeys(), true);
    }

    public static function transactionMutationKeys(): array
    {
        return ['edit', 'delete'];
    }

    public static function defaultTransactionMutationScopes(): array
    {
        return [
            'edit' => 'own',
            'delete' => 'own',
        ];
    }

    public static function allTransactionMutationScopes(): array
    {
        return [
            'edit' => 'any',
            'delete' => 'any',
        ];
    }

    public static function normalizeFeaturePermissions($permissions): array
    {
        $defaults = self::defaultFeaturePermissions();
        if (!is_array($permissions)) {
            return $defaults;
        }

        $normalized = $defaults;
        foreach ($defaults as $key => $defaultValue) {
            if (array_key_exists($key, $permissions)) {
                $normalized[$key] = (bool) $permissions[$key];
            } else {
                $normalized[$key] = (bool) $defaultValue;
            }
        }

        return $normalized;
    }

    public static function allFeaturePermissions(): array
    {
        return array_fill_keys(self::featureKeys(), true);
    }

    public static function normalizeTransactionMutationScopes($scopes): array
    {
        $defaults = self::defaultTransactionMutationScopes();
        if (!is_array($scopes)) {
            return $defaults;
        }

        $normalized = $defaults;
        foreach (self::transactionMutationKeys() as $action) {
            $value = strtolower(trim((string) ($scopes[$action] ?? $defaults[$action])));
            $normalized[$action] = in_array($value, ['none', 'own', 'any'], true)
                ? $value
                : $defaults[$action];
        }

        return $normalized;
    }

    public static function normalizeRole(string $role): string
    {
        $normalized = strtolower(trim($role));
        if (!in_array($normalized, ['super_admin', 'user'], true)) {
            Response::error('Invalid role.', 422);
        }
        return $normalized;
    }

    public static function isSuperAdmin(array $user): bool
    {
        return strtolower((string) ($user['role'] ?? 'user')) === 'super_admin';
    }

    public static function hasFeatureAccess(array $user, string $featureKey): bool
    {
        if (self::isSuperAdmin($user)) {
            return true;
        }

        $permissions = self::normalizeFeaturePermissions($user['permissions'] ?? null);
        return (bool) ($permissions[$featureKey] ?? false);
    }

    public static function transactionMutationScope(array $user, string $action): string
    {
        if (self::isSuperAdmin($user)) {
            return 'any';
        }

        $normalizedAction = strtolower(trim($action));
        if (!in_array($normalizedAction, self::transactionMutationKeys(), true)) {
            return 'none';
        }

        $scopes = self::normalizeTransactionMutationScopes($user['transaction_access'] ?? null);
        return $scopes[$normalizedAction] ?? 'none';
    }

    public static function allowedModulesForUser(array $user): array
    {
        return [
            'businesses' => self::hasFeatureAccess($user, 'businesses'),
            'ledger' => self::hasFeatureAccess($user, 'ledger'),
            'assets' => self::hasFeatureAccess($user, 'assets'),
            'users_access' => self::isSuperAdmin($user),
        ];
    }

    public static function decorateSettings(array $user, array $settings): array
    {
        $settings['allowed_modules'] = self::allowedModulesForUser($user);
        $settings['workspace_user_count'] = WorkspaceUserService::activeWorkspaceUserCount($user);
        $settings['workspace_users_access_enabled'] = WorkspaceUserService::usersAccessModuleEnabledForWorkspace($user);
        $settings['show_user_attribution'] = WorkspaceUserService::shouldShowTransactionAttribution($user);
        return $settings;
    }

    public static function authorizeRequest(array $user, ?string $scriptPath = null): void
    {
        $scriptPath = self::normalizeApiPath($scriptPath);
        if ($scriptPath === '') {
            return;
        }

        $rule = self::requestRules()[$scriptPath] ?? null;
        if ($rule === null) {
            return;
        }

        if (($rule['super_admin'] ?? false) === true && !self::isSuperAdmin($user)) {
            Response::error('Only super admin can access this area.', 403);
        }

        $moduleKey = isset($rule['module']) ? (string) $rule['module'] : '';
        $moduleEnabled = true;
        if ($moduleKey === 'users_access') {
            $moduleEnabled = WorkspaceUserService::usersAccessModuleEnabledForWorkspace($user);
        } elseif ($moduleKey !== '') {
            $moduleEnabled = UserSettingsService::isModuleEnabled((int) ($user['id'] ?? 0), $moduleKey);
        }
        if ($moduleKey !== '' && !$moduleEnabled) {
            Response::error('This module is disabled.', 403);
        }

        $features = [];
        if (isset($rule['feature'])) {
            $features[] = (string) $rule['feature'];
        }
        if (isset($rule['features']) && is_array($rule['features'])) {
            $features = array_merge($features, $rule['features']);
        }

        if ($features !== [] && !self::hasAnyFeatureAccess($user, $features)) {
            Response::error('You do not have permission to access this feature.', 403);
        }
    }

    private static function hasAnyFeatureAccess(array $user, array $featureKeys): bool
    {
        foreach ($featureKeys as $featureKey) {
            if (self::hasFeatureAccess($user, (string) $featureKey)) {
                return true;
            }
        }

        return false;
    }

    private static function normalizeApiPath(?string $scriptPath = null): string
    {
        $raw = str_replace('\\', '/', (string) ($scriptPath ?? ($_SERVER['SCRIPT_NAME'] ?? $_SERVER['PHP_SELF'] ?? '')));
        if ($raw === '') {
            return '';
        }

        if (preg_match('~/api/(.+)$~', $raw, $matches) === 1) {
            return ltrim((string) $matches[1], '/');
        }

        return '';
    }

    private static function requestRules(): array
    {
        return [
            'accounts/list.php' => ['features' => ['accounts', 'transactions']],
            'accounts/view.php' => ['feature' => 'accounts'],
            'accounts/summary.php' => ['feature' => 'accounts'],
            'accounts/create.php' => ['feature' => 'accounts'],
            'accounts/update.php' => ['feature' => 'accounts'],
            'accounts/delete.php' => ['feature' => 'accounts'],
            'accounts/adjust-opening.php' => ['feature' => 'accounts'],

            'assets/list.php' => ['feature' => 'assets'],
            'assets/view.php' => ['feature' => 'assets'],
            'assets/summary.php' => ['feature' => 'assets'],
            'assets/report.php' => ['feature' => 'assets'],
            'assets/create.php' => ['feature' => 'assets'],
            'assets/update.php' => ['feature' => 'assets'],
            'assets/update-value.php' => ['feature' => 'assets'],
            'assets/delete.php' => ['feature' => 'assets'],

            'budgets/list.php' => ['feature' => 'budgets'],
            'budgets/view.php' => ['feature' => 'budgets'],
            'budgets/alerts.php' => ['feature' => 'budgets'],
            'budgets/vs-actual.php' => ['feature' => 'budgets'],
            'budgets/set.php' => ['feature' => 'budgets'],
            'budgets/delete.php' => ['feature' => 'budgets'],

            'businesses/list.php' => ['feature' => 'businesses'],
            'businesses/create.php' => ['feature' => 'businesses'],
            'businesses/update.php' => ['feature' => 'businesses'],
            'businesses/delete.php' => ['feature' => 'businesses'],

            'categories/list.php' => ['features' => ['categories', 'transactions', 'budgets']],
            'categories/view.php' => ['feature' => 'categories'],
            'categories/create.php' => ['feature' => 'categories'],
            'categories/update.php' => ['feature' => 'categories'],
            'categories/delete.php' => ['feature' => 'categories'],
            'categories/reorder.php' => ['feature' => 'categories'],
            'categories/seed-defaults.php' => ['feature' => 'categories'],
            'categories/upload-icon.php' => ['feature' => 'categories'],

            'insights/analytics.php' => ['feature' => 'charts'],
            'insights/monthly.php' => ['feature' => 'charts'],

            'ledger/overview.php' => ['feature' => 'ledger'],
            'ledger/summary.php' => ['feature' => 'ledger'],
            'ledger/view.php' => ['feature' => 'ledger'],
            'ledger/report.php' => ['feature' => 'ledger'],
            'ledger/contact-report.php' => ['feature' => 'ledger'],
            'ledger/contact-create.php' => ['feature' => 'ledger'],
            'ledger/contact-update.php' => ['feature' => 'ledger'],
            'ledger/contact-delete.php' => ['feature' => 'ledger'],
            'ledger/entry-create.php' => ['feature' => 'ledger'],
            'ledger/entry-update.php' => ['feature' => 'ledger'],
            'ledger/entry-delete.php' => ['feature' => 'ledger'],
            'ledger/entry-view.php' => ['feature' => 'ledger'],

            'reports/category-breakdown.php' => ['feature' => 'reports'],
            'reports/category-summary.php' => ['feature' => 'reports'],

            'transactions/list.php' => ['features' => ['transactions', 'accounts', 'categories', 'budgets', 'reports', 'assets']],
            'transactions/view.php' => ['feature' => 'transactions'],
            'transactions/summary.php' => ['feature' => 'transactions'],
            'transactions/monthly-summary.php' => ['feature' => 'transactions'],
            'transactions/category-summary.php' => ['feature' => 'transactions'],
            'transactions/export-csv.php' => ['feature' => 'transactions'],
            'transactions/upload-receipt.php' => ['feature' => 'transactions'],
            'transactions/create.php' => ['feature' => 'transactions'],
            'transactions/update.php' => ['feature' => 'transactions'],
            'transactions/delete.php' => ['feature' => 'transactions'],

            'settings/reset-transactions.php' => ['super_admin' => true],

            'admin/users/list.php' => ['super_admin' => true, 'module' => 'users_access'],
            'admin/users/create.php' => ['super_admin' => true, 'module' => 'users_access'],
            'admin/users/update.php' => ['super_admin' => true, 'module' => 'users_access'],
            'admin/users/delete.php' => ['super_admin' => true, 'module' => 'users_access'],
            'workspace/users.php' => ['features' => ['transactions', 'accounts', 'categories', 'budgets', 'charts', 'reports', 'assets']],
        ];
    }
}
