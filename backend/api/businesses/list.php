<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$search = strtolower(Validator::string(Request::query('search', ''), 100));

$businesses = BusinessService::listAll($userId);

if ($search !== '') {
    $businesses = array_values(array_filter($businesses, static function (array $business) use ($search): bool {
        $haystack = strtolower((string) ($business['name'] ?? '') . ' ' . (string) ($business['notes'] ?? ''));
        return strpos($haystack, $search) !== false;
    }));
}

Response::success('Businesses fetched.', [
    'businesses' => $businesses,
    'summary' => [
        'total_count' => count($businesses),
    ],
]);
