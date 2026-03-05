<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap/env.php';
require_once __DIR__ . '/config/database.php';

require_once __DIR__ . '/utils/Response.php';
require_once __DIR__ . '/utils/Request.php';
require_once __DIR__ . '/utils/Validator.php';
require_once __DIR__ . '/utils/Jwt.php';
require_once __DIR__ . '/utils/Pagination.php';

require_once __DIR__ . '/services/CategoryService.php';
require_once __DIR__ . '/services/AuthService.php';
require_once __DIR__ . '/services/TokenService.php';
require_once __DIR__ . '/services/MailService.php';
require_once __DIR__ . '/services/PasswordResetService.php';
require_once __DIR__ . '/services/BalanceRecalculationService.php';
require_once __DIR__ . '/services/SchemaService.php';
require_once __DIR__ . '/services/AssetService.php';
require_once __DIR__ . '/services/TransactionService.php';
require_once __DIR__ . '/services/BudgetService.php';
require_once __DIR__ . '/services/InsightService.php';

require_once __DIR__ . '/middleware/ErrorHandler.php';
require_once __DIR__ . '/middleware/CorsMiddleware.php';
require_once __DIR__ . '/middleware/RateLimitMiddleware.php';
require_once __DIR__ . '/middleware/AuthMiddleware.php';

ErrorHandler::register();
CorsMiddleware::handle();

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-XSS-Protection: 1; mode=block');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

SchemaService::ensureAssetsSchema();
