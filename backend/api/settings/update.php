<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('settings_update', 200, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();

$profileName = Validator::string($input['name'] ?? '', 120);

$pdo = db();
$pdo->beginTransaction();
try {
    $currentSettings = UserSettingsService::get($userId, $pdo);

    $currency = $currentSettings['currency'];
    if (array_key_exists('currency', $input)) {
        $currency = strtoupper(Validator::string($input['currency'] ?? 'INR', 10));
        if ($currency === '') {
            $currency = 'INR';
        }
    }

    $darkMode = $currentSettings['dark_mode'];
    if (array_key_exists('dark_mode', $input)) {
        $darkMode = (int) ((bool) $input['dark_mode']);
    }

    $filters = $currentSettings['last_transaction_filters'];
    if (array_key_exists('last_transaction_filters', $input)) {
        if ($input['last_transaction_filters'] === null || $input['last_transaction_filters'] === '') {
            $filters = UserSettingsService::defaultTransactionFilters();
        } else {
            if (!is_array($input['last_transaction_filters'])) {
                Response::error('last_transaction_filters must be object.', 422);
            }
            $filters = array_merge(
                UserSettingsService::defaultTransactionFilters(),
                $input['last_transaction_filters']
            );
        }
    }

    $modules = $currentSettings['modules'];
    if (array_key_exists('modules', $input)) {
        if (!is_array($input['modules'])) {
            Response::error('modules must be object.', 422);
        }
        $modules = UserSettingsService::normalizeModules($input['modules']);
        if (($modules['businesses'] ?? false) === false) {
            $filters['business_id'] = '';
        }
        if (($modules['users_access'] ?? false) === false) {
            $filters['created_by_user_id'] = '';
        }
    }

    if ($profileName !== '') {
        $userStmt = $pdo->prepare('UPDATE users SET name = :name WHERE id = :id');
        $userStmt->execute([
            ':name' => $profileName,
            ':id' => $userId,
        ]);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO user_settings (user_id, currency, dark_mode, last_transaction_filters, modules_json)
         VALUES (:user_id, :currency, :dark_mode, :last_filters, :modules_json)
         ON DUPLICATE KEY UPDATE
            currency = VALUES(currency),
            dark_mode = VALUES(dark_mode),
            last_transaction_filters = VALUES(last_transaction_filters),
            modules_json = VALUES(modules_json)'
    );

    $stmt->execute([
        ':user_id' => $userId,
        ':currency' => $currency,
        ':dark_mode' => $darkMode,
        ':last_filters' => json_encode($filters),
        ':modules_json' => json_encode($modules),
    ]);

    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}

$row = AuthService::findUserById($userId);
$settings = PermissionService::decorateSettings($row, UserSettingsService::get($userId));

Response::success('Settings updated.', [
    'user' => $row,
    'settings' => $settings,
]);

