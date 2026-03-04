<?php

declare(strict_types=1);

final class ErrorHandler
{
    public static function register(): void
    {
        set_exception_handler(static function (Throwable $exception): void {
            self::log('Uncaught exception: ' . $exception->getMessage(), $exception->getTraceAsString());
            Response::error('Internal server error.', 500);
        });

        set_error_handler(static function (
            int $severity,
            string $message,
            string $file,
            int $line
        ): bool {
            self::log("PHP error [{$severity}] {$message} at {$file}:{$line}");
            Response::error('Internal server error.', 500);
        });

        register_shutdown_function(static function (): void {
            $error = error_get_last();
            if ($error !== null) {
                self::log('Fatal error: ' . json_encode($error));
            }
        });
    }

    private static function log(string $message, string $trace = ''): void
    {
        $logPath = dirname(__DIR__) . '/storage/error.log';
        $line = sprintf(
            "[%s] %s %s\n",
            date('Y-m-d H:i:s'),
            $message,
            $trace !== '' ? "\n" . $trace : ''
        );
        file_put_contents($logPath, $line, FILE_APPEND);
    }
}

