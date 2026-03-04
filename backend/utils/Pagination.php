<?php

declare(strict_types=1);

final class Pagination
{
    public static function fromRequest(int $defaultLimit = 20, int $maxLimit = 100): array
    {
        $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int) $_GET['page'] : 1;
        $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int) $_GET['limit'] : $defaultLimit;

        $page = max(1, $page);
        $limit = max(1, min($maxLimit, $limit));
        $offset = ($page - 1) * $limit;

        return [
            'page' => $page,
            'limit' => $limit,
            'offset' => $offset,
        ];
    }
}

