<?php

declare(strict_types=1);

final class UserSettingsService
{
    public static function defaultTransactionFilters(): array
    {
        return [
            'type' => '',
            'account_id' => '',
            'asset_type_id' => '',
            'business_id' => '',
            'created_by_user_id' => '',
            'category_id' => '',
            'search' => '',
            'date_from' => '',
            'date_to' => '',
        ];
    }

    public static function defaultModules(): array
    {
        return [
            'businesses' => true,
            'ledger' => true,
            'assets' => true,
            'users_access' => true,
        ];
    }

    public static function get(int $userId, ?PDO $pdo = null): array
    {
        $pdo = $pdo ?? db();
        $row = self::fetchRow($userId, $pdo);
        if ($row) {
            return self::hydrateRow($row);
        }

        $defaults = self::defaultSettingsPayload();
        $insert = $pdo->prepare(
            'INSERT INTO user_settings (user_id, currency, dark_mode, last_transaction_filters, modules_json)
             VALUES (:user_id, :currency, :dark_mode, :last_transaction_filters, :modules_json)'
        );
        $insert->execute([
            ':user_id' => $userId,
            ':currency' => $defaults['currency'],
            ':dark_mode' => $defaults['dark_mode'],
            ':last_transaction_filters' => json_encode($defaults['last_transaction_filters']),
            ':modules_json' => json_encode($defaults['modules']),
        ]);

        return $defaults;
    }

    public static function isModuleEnabled(int $userId, string $moduleKey, ?PDO $pdo = null): bool
    {
        $settings = self::get($userId, $pdo);
        return (bool) ($settings['modules'][$moduleKey] ?? false);
    }

    public static function normalizeModules($modules): array
    {
        $defaults = self::defaultModules();
        if (!is_array($modules)) {
            return $defaults;
        }

        $normalized = $defaults;
        foreach ($defaults as $key => $defaultValue) {
            if (array_key_exists($key, $modules)) {
                $normalized[$key] = (bool) $modules[$key];
            } else {
                $normalized[$key] = (bool) $defaultValue;
            }
        }

        return $normalized;
    }

    private static function defaultSettingsPayload(): array
    {
        return [
            'currency' => 'INR',
            'dark_mode' => 0,
            'last_transaction_filters' => self::defaultTransactionFilters(),
            'modules' => self::defaultModules(),
        ];
    }

    private static function fetchRow(int $userId, PDO $pdo): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT currency, dark_mode, last_transaction_filters, modules_json
             FROM user_settings
             WHERE user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute([':user_id' => $userId]);

        $row = $stmt->fetch();
        return is_array($row) ? $row : null;
    }

    private static function hydrateRow(array $row): array
    {
        $defaults = self::defaultSettingsPayload();
        $filters = $defaults['last_transaction_filters'];
        $decodedFilters = self::decodeJsonObject($row['last_transaction_filters'] ?? null);
        if (is_array($decodedFilters)) {
            $filters = array_merge($filters, $decodedFilters);
        }

        return [
            'currency' => (string) ($row['currency'] ?? $defaults['currency']),
            'dark_mode' => (int) ($row['dark_mode'] ?? $defaults['dark_mode']),
            'last_transaction_filters' => $filters,
            'modules' => self::normalizeModules(self::decodeJsonObject($row['modules_json'] ?? null)),
        ];
    }

    private static function decodeJsonObject($raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        $decoded = json_decode((string) $raw, true);
        return is_array($decoded) ? $decoded : null;
    }
}
