<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];
$search = strtolower(Validator::string(Request::query('search', ''), 100));

$summary = AssetService::summary($userId);
$assets = (array) ($summary['assets'] ?? []);

if ($search !== '') {
    $assets = array_values(array_filter($assets, static function (array $asset) use ($search): bool {
        $haystack = strtolower((string) ($asset['name'] ?? '') . ' ' . (string) ($asset['notes'] ?? ''));
        return strpos($haystack, $search) !== false;
    }));
}

Response::success('Assets fetched.', [
    'assets' => $assets,
    'summary' => [
        'total_invested' => (float) ($summary['total_invested'] ?? 0),
        'total_current_value' => (float) ($summary['total_current_value'] ?? 0),
        'total_gain_loss' => (float) ($summary['total_gain_loss'] ?? 0),
        'asset_count' => (int) ($summary['asset_count'] ?? 0),
        'filtered_count' => count($assets),
    ],
]);
