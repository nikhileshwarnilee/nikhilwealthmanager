<?php

declare(strict_types=1);

final class MailService
{
    public static function send(string $toEmail, string $subject, string $htmlBody, string $textBody = ''): bool
    {
        $to = Validator::email($toEmail);
        $fromEmail = Validator::email((string) env('MAIL_FROM_EMAIL', 'no-reply@example.com'));
        $fromName = Validator::string(env('MAIL_FROM_NAME', 'Expense Manager'), 120);
        $transport = strtolower(trim((string) env('MAIL_TRANSPORT', 'auto')));

        $hasResendKey = trim((string) env('RESEND_API_KEY', '')) !== '';
        $canTryResend = $transport === 'resend' || ($transport === 'auto' && $hasResendKey);
        if ($canTryResend && self::sendViaResend($to, $subject, $htmlBody, $textBody, $fromEmail, $fromName)) {
            return true;
        }

        $encodedName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $headers = [
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=UTF-8',
            sprintf('From: %s <%s>', $encodedName, $fromEmail),
            sprintf('Reply-To: %s', $fromEmail),
            'X-Mailer: PHP/' . PHP_VERSION,
        ];

        $result = $transport === 'resend'
            ? false
            : self::sendViaPhpMail($to, $subject, $htmlBody, $headers);
        if ($result) {
            return true;
        }

        if ((string) env('MAIL_LOG_FALLBACK', '0') === '1') {
            $logPath = dirname(__DIR__) . '/storage/error.log';
            $payload = sprintf(
                "[%s] Mail fallback log | to=%s | subject=%s | body=%s | text=%s\n",
                date('Y-m-d H:i:s'),
                $to,
                $subject,
                str_replace(["\r", "\n"], ' ', $htmlBody),
                str_replace(["\r", "\n"], ' ', $textBody)
            );
            @file_put_contents($logPath, $payload, FILE_APPEND);
            return true;
        }

        return false;
    }

    private static function sendViaResend(
        string $to,
        string $subject,
        string $htmlBody,
        string $textBody,
        string $fromEmail,
        string $fromName
    ): bool {
        $apiKey = trim((string) env('RESEND_API_KEY', ''));
        if ($apiKey === '' || !function_exists('curl_init')) {
            return false;
        }

        $payload = [
            'from' => trim($fromName) !== '' ? ($fromName . ' <' . $fromEmail . '>') : $fromEmail,
            'to' => [$to],
            'subject' => $subject,
            'html' => $htmlBody,
        ];
        if (trim($textBody) !== '') {
            $payload['text'] = $textBody;
        }

        $ch = curl_init('https://api.resend.com/emails');
        if ($ch === false) {
            return false;
        }

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode($payload),
        ]);

        curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error !== '') {
            return false;
        }

        return $statusCode >= 200 && $statusCode < 300;
    }

    private static function sendViaPhpMail(
        string $to,
        string $subject,
        string $htmlBody,
        array $headers
    ): bool {
        $mailWarning = false;
        set_error_handler(static function () use (&$mailWarning): bool {
            $mailWarning = true;
            return true;
        });

        try {
            $result = mail($to, $subject, $htmlBody, implode("\r\n", $headers));
        } finally {
            restore_error_handler();
        }

        if ($mailWarning) {
            return false;
        }

        return $result;
    }
}
