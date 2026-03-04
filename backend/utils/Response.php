<?php

declare(strict_types=1);

final class Response
{
    public static function json(bool $success, string $message, array $data = [], int $statusCode = 200): never
    {
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');

        echo json_encode([
            'success' => $success,
            'message' => $message,
            'data' => $data,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function success(string $message, array $data = [], int $statusCode = 200): never
    {
        self::json(true, $message, $data, $statusCode);
    }

    public static function error(string $message, int $statusCode = 400, array $errors = []): never
    {
        $payload = [];
        if (!empty($errors)) {
            $payload['errors'] = $errors;
        }

        self::json(false, $message, $payload, $statusCode);
    }
}

