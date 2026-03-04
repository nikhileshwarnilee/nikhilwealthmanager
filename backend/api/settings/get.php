<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

$stmt = db()->prepare(
    'SELECT currency, dark_mode, last_transaction_filters
     FROM user_settings
     WHERE user_id = :user_id
     LIMIT 1'
);
$stmt->execute([':user_id' => $userId]);
$settings = $stmt->fetch();

if (!$settings) {
    $insert = db()->prepare(
        'INSERT INTO user_settings (user_id, currency, dark_mode, last_transaction_filters)
         VALUES (:user_id, :currency, :dark_mode, :filters)'
    );
    $insert->execute([
        ':user_id' => $userId,
        ':currency' => 'INR',
        ':dark_mode' => 0,
        ':filters' => null,
    ]);

    $settings = [
        'currency' => 'INR',
        'dark_mode' => 0,
        'last_transaction_filters' => null,
    ];
}

Response::success('Settings loaded.', [
    'settings' => [
        'currency' => (string) $settings['currency'],
        'dark_mode' => (int) $settings['dark_mode'],
        'last_transaction_filters' => $settings['last_transaction_filters']
            ? json_decode((string) $settings['last_transaction_filters'], true)
            : null,
    ],
]);

