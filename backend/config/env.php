<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/bootstrap/env.php';

if (!function_exists('env')) {
    function env(string $key, ?string $default = null): ?string
    {
        if (array_key_exists($key, $_ENV)) {
            return (string) $_ENV[$key];
        }

        $value = getenv($key);
        if ($value === false) {
            return $default;
        }
        return (string) $value;
    }
}
