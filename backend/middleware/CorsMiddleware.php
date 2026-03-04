<?php

declare(strict_types=1);

final class CorsMiddleware
{
    public static function handle(): void
    {
        $originHeader = $_SERVER['HTTP_ORIGIN'] ?? '';
        $configuredOrigins = trim((string) env('APP_CORS_ORIGINS', '*'));
        $allowed = array_filter(array_map('trim', explode(',', $configuredOrigins)));

        if ($configuredOrigins === '*' || in_array('*', $allowed, true)) {
            header('Access-Control-Allow-Origin: *');
        } elseif ($originHeader !== '' && in_array($originHeader, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $originHeader);
            header('Vary: Origin');
        }

        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Max-Age: 86400');

        if (Request::method() === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}

