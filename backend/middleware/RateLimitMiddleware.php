<?php

declare(strict_types=1);

final class RateLimitMiddleware
{
    public static function enforce(string $bucket, int $maxRequests, int $windowSeconds): void
    {
        $ip = Request::ip();
        $key = sha1($bucket . '|' . $ip);
        $file = dirname(__DIR__) . '/storage/ratelimits/' . $key . '.json';
        $now = time();

        $state = [
            'count' => 0,
            'window_started_at' => $now,
        ];

        if (is_file($file)) {
            $raw = file_get_contents($file);
            $decoded = $raw ? json_decode($raw, true) : null;
            if (is_array($decoded)) {
                $state = $decoded;
            }
        }

        $startedAt = isset($state['window_started_at']) ? (int) $state['window_started_at'] : $now;
        $count = isset($state['count']) ? (int) $state['count'] : 0;

        if (($now - $startedAt) >= $windowSeconds) {
            $startedAt = $now;
            $count = 0;
        }

        $count++;

        $payload = [
            'count' => $count,
            'window_started_at' => $startedAt,
        ];
        file_put_contents($file, json_encode($payload));

        $remaining = max(0, $maxRequests - $count);
        $resetIn = max(0, $windowSeconds - ($now - $startedAt));
        header('X-RateLimit-Limit: ' . $maxRequests);
        header('X-RateLimit-Remaining: ' . $remaining);
        header('X-RateLimit-Reset: ' . $resetIn);

        if ($count > $maxRequests) {
            Response::error('Too many requests. Please try again later.', 429);
        }
    }
}

