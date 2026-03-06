<?php

declare(strict_types=1);

require_once __DIR__ . '/../../vendor/autoload.php';

$loadedEnv = false;

// Prefer backend/.env for shared hosting deployments, then fall back to project root/.env.
foreach ([dirname(__DIR__), dirname(__DIR__, 2)] as $envDir) {
    try {
        $loaded = Dotenv\Dotenv::createImmutable($envDir)->safeLoad();
        if (!empty($loaded)) {
            $loadedEnv = true;
        }
    } catch (Throwable $exception) {
        error_log(sprintf(
            '[bootstrap/env] Failed loading %s/.env: %s',
            $envDir,
            $exception->getMessage()
        ));
    }
}

if (!$loadedEnv && getenv('APP_JWT_SECRET') === false && !isset($_ENV['APP_JWT_SECRET'])) {
    error_log('[bootstrap/env] No .env file found in backend/ or project root.');
}
