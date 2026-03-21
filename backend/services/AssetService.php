<?php

declare(strict_types=1);

final class AssetService
{
    public static function listTypes(int $userId): array
    {
        self::assertModuleEnabled($userId);

        $stmt = db()->prepare(
             'SELECT
                a.id,
                a.user_id,
                a.name,
                a.icon,
                a.color,
                a.notes,
                a.current_value,
                a.created_at,
                a.updated_at,
                COALESCE(SUM(
                    CASE
                        WHEN t.type = \'asset\' AND t.to_asset_type_id = a.id THEN t.amount
                        WHEN t.type = \'asset\' AND t.from_asset_type_id = a.id THEN -t.amount
                        ELSE 0
                    END
                ), 0) AS invested_amount,
                COALESCE(COUNT(
                    CASE
                        WHEN t.type = \'asset\' AND (t.from_asset_type_id = a.id OR t.to_asset_type_id = a.id) THEN t.id
                        ELSE NULL
                    END
                ), 0) AS transaction_count
             FROM asset_types a
             LEFT JOIN transactions t
               ON t.user_id = a.user_id
              AND t.is_deleted = 0
              AND (t.from_asset_type_id = a.id OR t.to_asset_type_id = a.id)
             WHERE a.user_id = :user_id
               AND a.is_deleted = 0
             GROUP BY a.id, a.user_id, a.name, a.icon, a.color, a.notes, a.current_value, a.created_at, a.updated_at
             ORDER BY a.name ASC, a.id ASC'
        );
        $stmt->execute([':user_id' => $userId]);
        $rows = $stmt->fetchAll();

        $result = [];
        foreach ($rows as $row) {
            $invested = round((float) ($row['invested_amount'] ?? 0), 2);
            $current = round((float) ($row['current_value'] ?? 0), 2);
            $gainLoss = round($current - $invested, 2);
            $gainLossPercent = abs($invested) >= 0.01 ? round(($gainLoss / $invested) * 100, 2) : 0.0;

            $result[] = [
                'id' => (int) $row['id'],
                'user_id' => (int) $row['user_id'],
                'name' => (string) $row['name'],
                'icon' => $row['icon'] ?: null,
                'color' => $row['color'] ?: null,
                'notes' => $row['notes'] ?: null,
                'current_value' => $current,
                'invested_amount' => $invested,
                'gain_loss' => $gainLoss,
                'gain_loss_percent' => $gainLossPercent,
                'transaction_count' => (int) ($row['transaction_count'] ?? 0),
                'created_at' => (string) $row['created_at'],
                'updated_at' => (string) $row['updated_at'],
            ];
        }

        return $result;
    }

    public static function summary(int $userId): array
    {
        self::assertModuleEnabled($userId);

        $assets = self::listTypes($userId);
        $totalInvested = 0.0;
        $totalCurrent = 0.0;

        foreach ($assets as $asset) {
            $totalInvested += (float) ($asset['invested_amount'] ?? 0);
            $totalCurrent += (float) ($asset['current_value'] ?? 0);
        }

        $totalInvested = round($totalInvested, 2);
        $totalCurrent = round($totalCurrent, 2);
        $totalGainLoss = round($totalCurrent - $totalInvested, 2);

        $normalizedAssets = [];
        foreach ($assets as $asset) {
            $allocationPercent = $totalCurrent > 0
                ? round(((float) $asset['current_value'] / $totalCurrent) * 100, 2)
                : 0.0;
            $asset['allocation_percent'] = $allocationPercent;
            $normalizedAssets[] = $asset;
        }

        return [
            'total_invested' => $totalInvested,
            'total_current_value' => $totalCurrent,
            'total_gain_loss' => $totalGainLoss,
            'asset_count' => count($normalizedAssets),
            'assets' => $normalizedAssets,
        ];
    }

    public static function createType(int $userId, array $input): array
    {
        self::assertModuleEnabled($userId);

        $name = Validator::string($input['name'] ?? '', 120);
        $icon = Validator::string($input['icon'] ?? '', 255);
        $color = self::sanitizeColor($input['color'] ?? '');
        $notes = Validator::string($input['notes'] ?? '', 255);

        if ($name === '') {
            Response::error('Asset type name is required.', 422);
        }

        $existingStmt = db()->prepare(
            'SELECT id, is_deleted
             FROM asset_types
             WHERE user_id = :user_id
               AND name = :name
             LIMIT 1'
        );
        $existingStmt->execute([
            ':user_id' => $userId,
            ':name' => $name,
        ]);
        $existing = $existingStmt->fetch();

        if ($existing && (int) ($existing['is_deleted'] ?? 0) === 0) {
            Response::error('Asset type already exists.', 409);
        }

        if ($existing && (int) ($existing['is_deleted'] ?? 0) === 1) {
            $restoreStmt = db()->prepare(
                'UPDATE asset_types
                 SET icon = :icon,
                     color = :color,
                     notes = :notes,
                     current_value = 0,
                     is_deleted = 0
                 WHERE id = :id
                   AND user_id = :user_id
                 LIMIT 1'
            );
            $restoreStmt->execute([
                ':id' => (int) $existing['id'],
                ':user_id' => $userId,
                ':icon' => $icon !== '' ? $icon : null,
                ':color' => $color,
                ':notes' => $notes !== '' ? $notes : null,
            ]);
            return self::getType((int) $existing['id'], $userId);
        }

        $stmt = db()->prepare(
            'INSERT INTO asset_types (user_id, name, icon, color, notes, current_value, is_deleted)
             VALUES (:user_id, :name, :icon, :color, :notes, 0, 0)'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':name' => $name,
            ':icon' => $icon !== '' ? $icon : null,
            ':color' => $color,
            ':notes' => $notes !== '' ? $notes : null,
        ]);

        return self::getType((int) db()->lastInsertId(), $userId);
    }

    public static function updateType(int $userId, int $id, array $input): array
    {
        self::assertModuleEnabled($userId);

        $name = Validator::string($input['name'] ?? '', 120);
        $icon = Validator::string($input['icon'] ?? '', 255);
        $color = self::sanitizeColor($input['color'] ?? '');
        $notes = Validator::string($input['notes'] ?? '', 255);

        if ($name === '') {
            Response::error('Asset type name is required.', 422);
        }

        self::assertAssetType($id, $userId);

        $stmt = db()->prepare(
            'UPDATE asset_types
             SET name = :name,
                 icon = :icon,
                 color = :color,
                 notes = :notes
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0'
        );
        try {
            $stmt->execute([
                ':name' => $name,
                ':icon' => $icon !== '' ? $icon : null,
                ':color' => $color,
                ':notes' => $notes !== '' ? $notes : null,
                ':id' => $id,
                ':user_id' => $userId,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                Response::error('Asset type already exists.', 409);
            }
            throw $exception;
        }

        return self::getType($id, $userId);
    }

    public static function deleteType(int $userId, int $id, ?int $replacementAssetTypeId = null): array
    {
        self::assertModuleEnabled($userId);

        $asset = self::assertAssetType($id, $userId);

        $txCountStmt = db()->prepare(
            'SELECT COUNT(*) AS total
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND (from_asset_type_id = :from_asset_type_id OR to_asset_type_id = :to_asset_type_id)'
        );
        $txCountStmt->execute([
            ':user_id' => $userId,
            ':from_asset_type_id' => $id,
            ':to_asset_type_id' => $id,
        ]);
        $transactionCount = (int) (($txCountStmt->fetch()['total'] ?? 0));

        if ($transactionCount > 0 && $replacementAssetTypeId === null) {
            $candidatesStmt = db()->prepare(
                'SELECT id, name, icon, color, notes
                 FROM asset_types
                 WHERE user_id = :user_id
                   AND is_deleted = 0
                   AND id <> :id
                 ORDER BY name ASC, id ASC'
            );
            $candidatesStmt->execute([
                ':user_id' => $userId,
                ':id' => $id,
            ]);

            Response::error(
                'Asset type has transactions and requires reallocation.',
                409,
                [
                    'requires_reallocation' => true,
                    'transaction_count' => $transactionCount,
                    'asset_types' => $candidatesStmt->fetchAll(),
                ]
            );
        }

        $replacement = null;
        if ($replacementAssetTypeId !== null) {
            if ($replacementAssetTypeId === $id) {
                Response::error('Replacement asset type must be different.', 422);
            }
            $replacement = self::assertAssetType($replacementAssetTypeId, $userId);
        }

        $pdo = db();
        $pdo->beginTransaction();

        try {
            if ($replacementAssetTypeId !== null) {
                $moveFromStmt = $pdo->prepare(
                    'UPDATE transactions
                     SET from_asset_type_id = :replacement_id
                     WHERE user_id = :user_id
                       AND is_deleted = 0
                       AND from_asset_type_id = :source_id'
                );
                $moveFromStmt->execute([
                    ':replacement_id' => $replacementAssetTypeId,
                    ':user_id' => $userId,
                    ':source_id' => $id,
                ]);

                $moveToStmt = $pdo->prepare(
                    'UPDATE transactions
                     SET to_asset_type_id = :replacement_id
                     WHERE user_id = :user_id
                       AND is_deleted = 0
                       AND to_asset_type_id = :source_id'
                );
                $moveToStmt->execute([
                    ':replacement_id' => $replacementAssetTypeId,
                    ':user_id' => $userId,
                    ':source_id' => $id,
                ]);

                $moveHistoryStmt = $pdo->prepare(
                    'UPDATE asset_value_history
                     SET asset_type_id = :replacement_id
                     WHERE user_id = :user_id
                       AND asset_type_id = :source_id'
                );
                $moveHistoryStmt->execute([
                    ':replacement_id' => $replacementAssetTypeId,
                    ':user_id' => $userId,
                    ':source_id' => $id,
                ]);

                $transferCurrentStmt = $pdo->prepare(
                    'UPDATE asset_types
                     SET current_value = current_value + :amount
                     WHERE id = :replacement_id
                       AND user_id = :user_id
                       AND is_deleted = 0'
                );
                $transferCurrentStmt->execute([
                    ':amount' => round((float) ($asset['current_value'] ?? 0), 2),
                    ':replacement_id' => $replacementAssetTypeId,
                    ':user_id' => $userId,
                ]);
            }

            $deleteStmt = $pdo->prepare(
                'UPDATE asset_types
                 SET is_deleted = 1,
                     current_value = 0
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );
            $deleteStmt->execute([
                ':id' => $id,
                ':user_id' => $userId,
            ]);

            $pdo->commit();

            return [
                'replacement_asset_type_id' => $replacementAssetTypeId,
                'moved_transactions' => $transactionCount,
                'moved_to_asset_type_name' => $replacement ? (string) $replacement['name'] : null,
            ];
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function getType(int $id, int $userId): array
    {
        self::assertModuleEnabled($userId);

        $stmt = db()->prepare(
            'SELECT
                id,
                user_id,
                name,
                icon,
                color,
                notes,
                current_value,
                created_at,
                updated_at
             FROM asset_types
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $id,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Asset type not found.', 404);
        }

        $investedStmt = db()->prepare(
            'SELECT
                COALESCE(SUM(
                    CASE
                        WHEN type = \'asset\' AND to_asset_type_id = :to_asset_type_id THEN amount
                        WHEN type = \'asset\' AND from_asset_type_id = :from_asset_type_id THEN -amount
                        ELSE 0
                    END
                ), 0) AS invested_amount,
                COALESCE(COUNT(
                    CASE
                        WHEN type = \'asset\' AND (from_asset_type_id = :scope_from_asset_type_id OR to_asset_type_id = :scope_to_asset_type_id) THEN id
                        ELSE NULL
                    END
                ), 0) AS transaction_count
             FROM transactions
             WHERE user_id = :user_id
               AND is_deleted = 0'
        );
        $investedStmt->execute([
            ':to_asset_type_id' => $id,
            ':from_asset_type_id' => $id,
            ':scope_from_asset_type_id' => $id,
            ':scope_to_asset_type_id' => $id,
            ':user_id' => $userId,
        ]);
        $invested = $investedStmt->fetch() ?: ['invested_amount' => 0, 'transaction_count' => 0];

        $investedAmount = round((float) ($invested['invested_amount'] ?? 0), 2);
        $currentValue = round((float) ($row['current_value'] ?? 0), 2);
        $gainLoss = round($currentValue - $investedAmount, 2);
        $gainLossPercent = abs($investedAmount) >= 0.01 ? round(($gainLoss / $investedAmount) * 100, 2) : 0.0;

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'name' => (string) $row['name'],
            'icon' => $row['icon'] ?: null,
            'color' => $row['color'] ?: null,
            'notes' => $row['notes'] ?: null,
            'current_value' => $currentValue,
            'invested_amount' => $investedAmount,
            'gain_loss' => $gainLoss,
            'gain_loss_percent' => $gainLossPercent,
            'transaction_count' => (int) ($invested['transaction_count'] ?? 0),
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    public static function valueHistory(
        int $userId,
        int $assetTypeId,
        ?string $dateFrom = null,
        ?string $dateTo = null,
        int $limit = 365
    ): array {
        self::assertModuleEnabled($userId);

        self::assertAssetType($assetTypeId, $userId);

        $sql = 'SELECT id, asset_type_id, value, note, source, recorded_at, created_at
                FROM asset_value_history
                WHERE user_id = :user_id
                  AND asset_type_id = :asset_type_id';
        $params = [
            ':user_id' => $userId,
            ':asset_type_id' => $assetTypeId,
        ];

        if ($dateFrom !== null) {
            $sql .= ' AND recorded_at >= :date_from';
            $params[':date_from'] = $dateFrom;
        }
        if ($dateTo !== null) {
            $sql .= ' AND recorded_at <= :date_to';
            $params[':date_to'] = $dateTo;
        }

        $sql .= ' ORDER BY recorded_at ASC, id ASC LIMIT :limit';

        $stmt = db()->prepare($sql);
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', max(1, min(2000, $limit)), PDO::PARAM_INT);
        $stmt->execute();

        $rows = [];
        foreach ($stmt->fetchAll() as $row) {
            $rows[] = [
                'id' => (int) $row['id'],
                'asset_type_id' => (int) $row['asset_type_id'],
                'value' => round((float) $row['value'], 2),
                'note' => $row['note'] ?: null,
                'source' => (string) $row['source'],
                'recorded_at' => (string) $row['recorded_at'],
                'created_at' => (string) $row['created_at'],
            ];
        }

        return $rows;
    }

    public static function updateCurrentValue(
        int $userId,
        int $assetTypeId,
        float $newValue,
        ?string $recordedAt = null,
        string $note = ''
    ): array {
        self::assertModuleEnabled($userId);

        $value = round($newValue, 2);
        if ($value < 0) {
            Response::error('Current value cannot be negative.', 422);
        }

        $recordedAtValue = Validator::dateTime($recordedAt, true) ?? date('Y-m-d H:i:s');
        $noteValue = Validator::string($note, 255);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            self::assertAssetType($assetTypeId, $userId, $pdo, true);

            $updateStmt = $pdo->prepare(
                'UPDATE asset_types
                 SET current_value = :current_value
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0'
            );
            $updateStmt->execute([
                ':current_value' => $value,
                ':id' => $assetTypeId,
                ':user_id' => $userId,
            ]);

            $historyStmt = $pdo->prepare(
                'INSERT INTO asset_value_history (
                    user_id, asset_type_id, value, note, source, recorded_at
                ) VALUES (
                    :user_id, :asset_type_id, :value, :note, :source, :recorded_at
                )'
            );
            $historyStmt->execute([
                ':user_id' => $userId,
                ':asset_type_id' => $assetTypeId,
                ':value' => $value,
                ':note' => $noteValue !== '' ? $noteValue : null,
                ':source' => 'manual',
                ':recorded_at' => $recordedAtValue,
            ]);
            $historyId = (int) $pdo->lastInsertId();

            $historyFetch = $pdo->prepare(
                'SELECT id, asset_type_id, value, note, source, recorded_at, created_at
                 FROM asset_value_history
                 WHERE id = :id
                   AND user_id = :user_id
                 LIMIT 1'
            );
            $historyFetch->execute([
                ':id' => $historyId,
                ':user_id' => $userId,
            ]);
            $historyRow = $historyFetch->fetch();

            $pdo->commit();

            return [
                'asset_type' => self::getType($assetTypeId, $userId),
                'history' => $historyRow
                    ? [
                        'id' => (int) $historyRow['id'],
                        'asset_type_id' => (int) $historyRow['asset_type_id'],
                        'value' => round((float) $historyRow['value'], 2),
                        'note' => $historyRow['note'] ?: null,
                        'source' => (string) $historyRow['source'],
                        'recorded_at' => (string) $historyRow['recorded_at'],
                        'created_at' => (string) $historyRow['created_at'],
                    ]
                    : null,
            ];
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function applyTransactionDelta(PDO $pdo, int $userId, ?array $before, ?array $after): void
    {
        $deltaByAsset = [];
        self::applyEffect($deltaByAsset, $before, -1);
        self::applyEffect($deltaByAsset, $after, 1);

        if ($deltaByAsset === []) {
            return;
        }

        $assetIds = array_map(static fn ($value): int => (int) $value, array_keys($deltaByAsset));
        $placeholders = [];
        $params = [':user_id' => $userId];
        foreach ($assetIds as $index => $assetId) {
            $key = ':asset_id_' . $index;
            $placeholders[] = $key;
            $params[$key] = $assetId;
        }

        $stmt = $pdo->prepare(
            'SELECT id, name, current_value
             FROM asset_types
             WHERE user_id = :user_id
               AND is_deleted = 0
               AND id IN (' . implode(',', $placeholders) . ')
             FOR UPDATE'
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $assetById = [];
        foreach ($rows as $row) {
            $assetById[(int) $row['id']] = $row;
        }

        foreach ($deltaByAsset as $assetId => $delta) {
            $id = (int) $assetId;
            if (!isset($assetById[$id])) {
                Response::error('Asset type not found for transaction.', 422);
            }
            $current = round((float) ($assetById[$id]['current_value'] ?? 0), 2);
            $next = round($current + (float) $delta, 2);
            if ($next < 0) {
                $name = (string) ($assetById[$id]['name'] ?? ('#' . $id));
                Response::error('Insufficient current value in asset: ' . $name, 422);
            }
        }

        $updateStmt = $pdo->prepare(
            'UPDATE asset_types
             SET current_value = :current_value
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0'
        );
        foreach ($deltaByAsset as $assetId => $delta) {
            $id = (int) $assetId;
            $current = round((float) ($assetById[$id]['current_value'] ?? 0), 2);
            $next = round($current + (float) $delta, 2);
            $updateStmt->execute([
                ':current_value' => $next,
                ':id' => $id,
                ':user_id' => $userId,
            ]);
        }
    }

    public static function assertAssetType(
        int $assetTypeId,
        int $userId,
        ?PDO $pdo = null,
        bool $forUpdate = false
    ): array {
        $db = $pdo ?? db();
        $sql = 'SELECT id, name, current_value
                FROM asset_types
                WHERE id = :id
                  AND user_id = :user_id
                  AND is_deleted = 0
                LIMIT 1';
        if ($forUpdate) {
            $sql .= ' FOR UPDATE';
        }

        $stmt = $db->prepare($sql);
        $stmt->execute([
            ':id' => $assetTypeId,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Invalid asset type selected.', 422);
        }
        return $row;
    }

    private static function applyEffect(array &$deltaByAsset, ?array $transaction, int $multiplier): void
    {
        if (!$transaction) {
            return;
        }
        if ((string) ($transaction['type'] ?? '') !== 'asset') {
            return;
        }

        $amount = round((float) ($transaction['amount'] ?? 0), 2);
        if ($amount <= 0) {
            return;
        }

        $fromAssetTypeId = isset($transaction['from_asset_type_id']) && $transaction['from_asset_type_id'] !== null
            ? (int) $transaction['from_asset_type_id']
            : null;
        $toAssetTypeId = isset($transaction['to_asset_type_id']) && $transaction['to_asset_type_id'] !== null
            ? (int) $transaction['to_asset_type_id']
            : null;

        if ($toAssetTypeId !== null) {
            $deltaByAsset[$toAssetTypeId] = round(($deltaByAsset[$toAssetTypeId] ?? 0) + ($multiplier * $amount), 2);
        }
        if ($fromAssetTypeId !== null) {
            $deltaByAsset[$fromAssetTypeId] = round(($deltaByAsset[$fromAssetTypeId] ?? 0) - ($multiplier * $amount), 2);
        }
    }

    private static function sanitizeColor(mixed $value): ?string
    {
        $color = Validator::string($value ?? '', 20);
        if ($color === '') {
            return null;
        }

        if (!preg_match('/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $color)) {
            Response::error('Asset color must be a valid hex code.', 422);
        }

        return strtoupper($color);
    }

    private static function assertModuleEnabled(int $userId, ?PDO $pdo = null): void
    {
        if (!UserSettingsService::isModuleEnabled($userId, 'assets', $pdo)) {
            Response::error('Assets / Wealth module is disabled.', 403);
        }
    }
}
