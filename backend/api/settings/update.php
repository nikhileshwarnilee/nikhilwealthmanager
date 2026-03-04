<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('settings_update', 200, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$input = Request::body();

$currency = strtoupper(Validator::string($input['currency'] ?? 'INR', 10));
if ($currency === '') {
    $currency = 'INR';
}

$darkMode = isset($input['dark_mode']) ? (int) ((bool) $input['dark_mode']) : 0;

$filters = null;
if (array_key_exists('last_transaction_filters', $input)) {
    if ($input['last_transaction_filters'] === null || $input['last_transaction_filters'] === '') {
        $filters = null;
    } else {
        if (!is_array($input['last_transaction_filters'])) {
            Response::error('last_transaction_filters must be object.', 422);
        }
        $filters = json_encode($input['last_transaction_filters']);
    }
}

$profileName = Validator::string($input['name'] ?? '', 120);

$pdo = db();
$pdo->beginTransaction();
try {
    if ($profileName !== '') {
        $userStmt = $pdo->prepare('UPDATE users SET name = :name WHERE id = :id');
        $userStmt->execute([
            ':name' => $profileName,
            ':id' => $userId,
        ]);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO user_settings (user_id, currency, dark_mode, last_transaction_filters)
         VALUES (:user_id, :currency, :dark_mode, :last_filters)
         ON DUPLICATE KEY UPDATE
            currency = VALUES(currency),
            dark_mode = VALUES(dark_mode),
            last_transaction_filters = CASE
                WHEN :last_filters_override = 1 THEN VALUES(last_transaction_filters)
                ELSE last_transaction_filters
            END'
    );

    $stmt->execute([
        ':user_id' => $userId,
        ':currency' => $currency,
        ':dark_mode' => $darkMode,
        ':last_filters' => $filters,
        ':last_filters_override' => array_key_exists('last_transaction_filters', $input) ? 1 : 0,
    ]);

    $pdo->commit();
} catch (Throwable $exception) {
    $pdo->rollBack();
    throw $exception;
}

$getStmt = db()->prepare(
    'SELECT u.id, u.name, u.email, s.currency, s.dark_mode, s.last_transaction_filters
     FROM users u
     INNER JOIN user_settings s ON s.user_id = u.id
     WHERE u.id = :user_id
     LIMIT 1'
);
$getStmt->execute([':user_id' => $userId]);
$row = $getStmt->fetch();

Response::success('Settings updated.', [
    'user' => [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'email' => (string) $row['email'],
    ],
    'settings' => [
        'currency' => (string) $row['currency'],
        'dark_mode' => (int) $row['dark_mode'],
        'last_transaction_filters' => $row['last_transaction_filters']
            ? json_decode((string) $row['last_transaction_filters'], true)
            : null,
    ],
]);

