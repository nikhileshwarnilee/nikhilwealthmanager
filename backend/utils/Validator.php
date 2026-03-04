<?php

declare(strict_types=1);

final class Validator
{
    public static function string(mixed $value, int $maxLength = 255): string
    {
        $text = trim(strip_tags((string) ($value ?? '')));
        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($text) > $maxLength) {
                return mb_substr($text, 0, $maxLength);
            }
            return $text;
        }

        if (strlen($text) > $maxLength) {
            return substr($text, 0, $maxLength);
        }

        return $text;
    }

    public static function email(mixed $value): string
    {
        $email = strtolower(trim((string) ($value ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email address.', 422);
        }
        return $email;
    }

    public static function password(mixed $value): string
    {
        $password = (string) ($value ?? '');
        $length = function_exists('mb_strlen') ? mb_strlen($password) : strlen($password);
        if ($length < 8) {
            Response::error('Password must be at least 8 characters.', 422);
        }
        return $password;
    }

    public static function amount(mixed $value): float
    {
        if (!is_numeric($value)) {
            Response::error('Amount must be numeric.', 422);
        }

        $amount = round((float) $value, 2);
        if ($amount <= 0) {
            Response::error('Amount must be greater than 0.', 422);
        }
        return $amount;
    }

    public static function positiveInt(mixed $value, string $fieldName = 'id'): int
    {
        if (!is_numeric($value)) {
            Response::error("{$fieldName} must be numeric.", 422);
        }
        $intVal = (int) $value;
        if ($intVal <= 0) {
            Response::error("{$fieldName} must be greater than 0.", 422);
        }
        return $intVal;
    }

    public static function nullablePositiveInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }
        return self::positiveInt($value);
    }

    public static function enum(mixed $value, array $allowed, string $fieldName = 'field'): string
    {
        $str = strtolower(trim((string) ($value ?? '')));
        if (!in_array($str, $allowed, true)) {
            Response::error("Invalid {$fieldName}.", 422);
        }
        return $str;
    }

    public static function month(mixed $value): string
    {
        $month = trim((string) ($value ?? ''));
        if (!preg_match('/^\\d{4}\\-(0[1-9]|1[0-2])$/', $month)) {
            Response::error('Month must be in YYYY-MM format.', 422);
        }
        return $month;
    }

    public static function monthOrAll(mixed $value): string
    {
        $raw = strtolower(trim((string) ($value ?? '')));
        if ($raw === 'all') {
            return 'all';
        }
        return self::month($raw);
    }

    public static function dateTime(mixed $value, bool $nullable = false): ?string
    {
        if ($value === null || $value === '') {
            if ($nullable) {
                return null;
            }
            return date('Y-m-d H:i:s');
        }

        $ts = strtotime((string) $value);
        if ($ts === false) {
            Response::error('Invalid date format.', 422);
        }
        return date('Y-m-d H:i:s', $ts);
    }
}
