<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

Request::enforceMethod('GET');
$user = AuthMiddleware::user();

Response::success('Workspace users fetched.', [
    'users' => WorkspaceUserService::listWorkspaceUsers($user),
    'workspace_user_count' => WorkspaceUserService::activeWorkspaceUserCount($user),
    'show_user_attribution' => WorkspaceUserService::shouldShowTransactionAttribution($user),
]);
