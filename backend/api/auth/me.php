<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();

$settingsStmt = db()->prepare(
    'SELECT currency, dark_mode, last_transaction_filters
     FROM user_settings
     WHERE user_id = :user_id
     LIMIT 1'
);
$settingsStmt->execute([':user_id' => (int) $user['id']]);
$settings = $settingsStmt->fetch() ?: [
    'currency' => 'INR',
    'dark_mode' => 0,
    'last_transaction_filters' => null,
];

Response::success('Profile loaded.', [
    'user' => $user,
    'settings' => [
        'currency' => (string) ($settings['currency'] ?? 'INR'),
        'dark_mode' => (int) ($settings['dark_mode'] ?? 0),
        'last_transaction_filters' => $settings['last_transaction_filters']
            ? json_decode((string) $settings['last_transaction_filters'], true)
            : null,
    ],
]);

