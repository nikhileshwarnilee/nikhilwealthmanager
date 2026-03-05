<?php

declare(strict_types=1);

require_once __DIR__ . '/env.php';

return [
    'env' => $_ENV['APP_ENV'] ?? 'local',
    'url' => $_ENV['APP_URL'] ?? '',
];
