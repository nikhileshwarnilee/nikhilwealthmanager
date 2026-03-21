<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('businesses_create', 120, 600);
Request::enforceMethod('POST');

$user = AuthMiddleware::user();
$userId = AuthService::workspaceOwnerId($user);
$input = Request::body();

$business = BusinessService::create($userId, $input);

Response::success('Business created.', [
    'business' => $business,
], 201);
