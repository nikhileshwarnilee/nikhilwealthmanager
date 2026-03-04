<?php

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/env.php';
require_once dirname(__DIR__) . '/config/database.php';

/**
 * Import Hysab Kytab export JSON files into this app schema.
 *
 * Usage:
 * php backend/scripts/import_hysab_export.php
 * php backend/scripts/import_hysab_export.php --user=1 --activities=... --accounts=... --categories=...
 */

function readJsonArray(string $path): array
{
    if (!is_file($path)) {
        throw new RuntimeException("File not found: {$path}");
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        throw new RuntimeException("Unable to read file: {$path}");
    }
    if (str_starts_with($raw, "\xEF\xBB\xBF")) {
        $raw = substr($raw, 3);
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException("Invalid JSON array in file: {$path}");
    }

    return $data;
}

function normalizeText(mixed $value, int $maxLength = 255): string
{
    $text = trim((string) ($value ?? ''));
    $text = preg_replace('/\s+/u', ' ', $text) ?? '';
    if (str_starts_with($text, "\xEF\xBB\xBF")) {
        $text = substr($text, 3);
    }
    if ($maxLength > 0 && strlen($text) > $maxLength) {
        $text = substr($text, 0, $maxLength);
    }
    return $text;
}

function lowerKey(string $text): string
{
    return strtolower(normalizeText($text));
}

function parseNumber(mixed $value): float
{
    $raw = trim((string) ($value ?? ''));
    if ($raw === '') {
        return 0.0;
    }

    $raw = str_replace(['₹', ',', ' '], '', $raw);
    if ($raw === '' || $raw === '-') {
        return 0.0;
    }

    if (!is_numeric($raw)) {
        return 0.0;
    }

    return round((float) $raw, 2);
}

function parseDateYmd(string $value): string
{
    $raw = normalizeText($value, 50);
    if ($raw === '') {
        throw new RuntimeException('Encountered empty date while importing.');
    }

    $formats = ['d/m/Y', 'd-m-Y', 'Y-m-d', 'm/d/Y'];
    foreach ($formats as $format) {
        $dt = DateTimeImmutable::createFromFormat($format, $raw);
        if ($dt instanceof DateTimeImmutable) {
            return $dt->format('Y-m-d');
        }
    }

    $ts = strtotime($raw);
    if ($ts === false) {
        throw new RuntimeException("Unable to parse date: {$raw}");
    }

    return date('Y-m-d', $ts);
}

function buildDateTime(string $ymd, int $sequence): string
{
    $seconds = max(0, $sequence % 86400);
    $h = intdiv($seconds, 3600);
    $m = intdiv($seconds % 3600, 60);
    $s = $seconds % 60;
    return sprintf('%s %02d:%02d:%02d', $ymd, $h, $m, $s);
}

function inferAccountType(string $name, float $closingBalance): string
{
    $n = lowerKey($name);
    if ($closingBalance < 0) {
        return 'credit';
    }
    if (str_contains($n, 'credit')) {
        return 'credit';
    }
    if (str_contains($n, 'upi') || str_contains($n, 'paytm') || str_contains($n, 'phonepe') || str_contains($n, 'gpay')) {
        return 'upi';
    }
    if (str_contains($n, 'wallet')) {
        return 'wallet';
    }
    if (str_contains($n, 'cash')) {
        return 'cash';
    }
    if (
        str_contains($n, 'bank')
        || str_contains($n, 'account')
        || str_contains($n, 'saving')
        || str_contains($n, 'finance')
        || str_contains($n, 'investment')
        || $n === 'savings'
    ) {
        return 'bank';
    }

    // Person-like ledgers should allow negative safely.
    return 'credit';
}

function inferCategoryIcon(string $name, string $type): ?string
{
    $n = lowerKey($name);
    if (str_contains($n, 'food') || str_contains($n, 'grocery') || str_contains($n, 'restaurant')) {
        return 'food';
    }
    if (str_contains($n, 'transport') || str_contains($n, 'travel') || str_contains($n, 'fuel') || str_contains($n, 'cab')) {
        return 'transport';
    }
    if (str_contains($n, 'shop') || str_contains($n, 'cloth') || str_contains($n, 'purchase')) {
        return 'shopping';
    }
    if (str_contains($n, 'util') || str_contains($n, 'electric') || str_contains($n, 'bill')) {
        return 'utilities';
    }
    if (str_contains($n, 'salary')) {
        return 'salary';
    }
    if (str_contains($n, 'business') || str_contains($n, 'freelance') || str_contains($n, 'commission')) {
        return 'freelance';
    }
    if (str_contains($n, 'health') || str_contains($n, 'medical') || str_contains($n, 'hospital')) {
        return 'heart';
    }

    return $type === 'income' ? 'income' : 'expense';
}

function findMatchingNegativeTransfer(array $pendingNegatives, array $positive): ?int
{
    $targetDate = $positive['date'];
    $targetAmount = $positive['amount'];
    $targetDesc = lowerKey($positive['description']);

    foreach ($pendingNegatives as $idx => $neg) {
        if ($neg['date'] !== $targetDate) {
            continue;
        }
        if (abs($neg['amount'] - $targetAmount) > 0.0001) {
            continue;
        }
        if (lowerKey($neg['description']) === $targetDesc) {
            return $idx;
        }
    }

    foreach ($pendingNegatives as $idx => $neg) {
        if ($neg['date'] !== $targetDate) {
            continue;
        }
        if (abs($neg['amount'] - $targetAmount) > 0.0001) {
            continue;
        }
        return $idx;
    }

    return null;
}

function recalculateBalances(PDO $pdo, int $userId): void
{
    $accStmt = $pdo->prepare(
        'SELECT id, initial_balance
         FROM accounts
         WHERE user_id = :user_id
           AND is_deleted = 0
         ORDER BY id ASC'
    );
    $accStmt->execute([':user_id' => $userId]);
    $accounts = $accStmt->fetchAll(PDO::FETCH_ASSOC);

    $balances = [];
    foreach ($accounts as $account) {
        $balances[(int) $account['id']] = round((float) $account['initial_balance'], 2);
    }

    $txnStmt = $pdo->prepare(
        'SELECT id, type, amount, from_account_id, to_account_id
         FROM transactions
         WHERE user_id = :user_id
           AND is_deleted = 0
         ORDER BY transaction_date ASC, id ASC'
    );
    $txnStmt->execute([':user_id' => $userId]);
    $transactions = $txnStmt->fetchAll(PDO::FETCH_ASSOC);

    $updateRunningStmt = $pdo->prepare(
        'UPDATE transactions
         SET running_balance = :running_balance
         WHERE id = :id
           AND user_id = :user_id'
    );

    foreach ($transactions as $txn) {
        $type = (string) $txn['type'];
        $amount = round((float) $txn['amount'], 2);
        $fromId = $txn['from_account_id'] !== null ? (int) $txn['from_account_id'] : null;
        $toId = $txn['to_account_id'] !== null ? (int) $txn['to_account_id'] : null;

        if ($type === 'income') {
            if ($toId !== null && array_key_exists($toId, $balances)) {
                $balances[$toId] = round($balances[$toId] + $amount, 2);
            }
        } elseif ($type === 'expense') {
            if ($fromId !== null && array_key_exists($fromId, $balances)) {
                $balances[$fromId] = round($balances[$fromId] - $amount, 2);
            }
        } elseif ($type === 'transfer') {
            if ($fromId !== null && array_key_exists($fromId, $balances)) {
                $balances[$fromId] = round($balances[$fromId] - $amount, 2);
            }
            if ($toId !== null && array_key_exists($toId, $balances)) {
                $balances[$toId] = round($balances[$toId] + $amount, 2);
            }
        } elseif ($type === 'opening_adjustment') {
            if ($toId !== null && array_key_exists($toId, $balances)) {
                $balances[$toId] = round($balances[$toId] + $amount, 2);
            }
        }

        $primaryId = null;
        if ($type === 'income' || $type === 'opening_adjustment') {
            $primaryId = $toId;
        } elseif ($type === 'expense' || $type === 'transfer') {
            $primaryId = $fromId;
        }

        $running = ($primaryId !== null && array_key_exists($primaryId, $balances))
            ? (float) $balances[$primaryId]
            : 0.0;

        $updateRunningStmt->execute([
            ':running_balance' => round($running, 2),
            ':id' => (int) $txn['id'],
            ':user_id' => $userId,
        ]);
    }

    $updateAccountStmt = $pdo->prepare(
        'UPDATE accounts
         SET current_balance = :balance
         WHERE id = :id
           AND user_id = :user_id'
    );

    foreach ($balances as $accountId => $balance) {
        $updateAccountStmt->execute([
            ':balance' => round($balance, 2),
            ':id' => (int) $accountId,
            ':user_id' => $userId,
        ]);
    }
}

$options = getopt('', ['user::', 'activities::', 'accounts::', 'categories::']);
$userId = isset($options['user']) ? max(1, (int) $options['user']) : 1;

$basePath = dirname(__DIR__) . '/storage/import';
$activitiesPath = (string) ($options['activities'] ?? ($basePath . '/activities.json'));
$accountsPath = (string) ($options['accounts'] ?? ($basePath . '/accounts.json'));
$categoriesPath = (string) ($options['categories'] ?? ($basePath . '/categories.json'));

$activities = readJsonArray($activitiesPath);
$accountsSheet = readJsonArray($accountsPath);
$categoriesSheet = readJsonArray($categoriesPath);

if (count($activities) === 0) {
    throw new RuntimeException('No activities found in input JSON.');
}

$pdo = db();
$pdo->beginTransaction();

try {
    $sourceOpening = [];
    $sourceClosing = [];

    $orderedAccountNames = [];
    $accountSeen = [];
    foreach ($accountsSheet as $row) {
        $name = normalizeText($row['Title'] ?? '', 120);
        if ($name === '') {
            continue;
        }
        $key = lowerKey($name);
        if (!isset($accountSeen[$key])) {
            $orderedAccountNames[] = $name;
            $accountSeen[$key] = true;
        }
        $sourceOpening[$key] = parseNumber($row['Opening Balance'] ?? 0);
        $sourceClosing[$key] = parseNumber($row['Closing Balance'] ?? 0);
    }

    foreach ($activities as $row) {
        $name = normalizeText($row['Account Name'] ?? '', 120);
        if ($name === '') {
            continue;
        }
        $key = lowerKey($name);
        if (!isset($accountSeen[$key])) {
            $orderedAccountNames[] = $name;
            $accountSeen[$key] = true;
            $sourceOpening[$key] = 0.0;
            $sourceClosing[$key] = 0.0;
        }
    }

    $palette = ['#7c3aed', '#0ea5e9', '#16a34a', '#f97316', '#dc2626', '#f59e0b', '#14b8a6', '#e11d48', '#475569'];
    $paletteIndex = 0;

    $pdo->prepare('DELETE FROM budgets WHERE user_id = :user_id')->execute([':user_id' => $userId]);
    $pdo->prepare('DELETE FROM transactions WHERE user_id = :user_id')->execute([':user_id' => $userId]);
    $pdo->prepare('DELETE FROM categories WHERE user_id = :user_id')->execute([':user_id' => $userId]);
    $pdo->prepare('DELETE FROM accounts WHERE user_id = :user_id')->execute([':user_id' => $userId]);

    $accountInsert = $pdo->prepare(
        'INSERT INTO accounts (
            user_id, name, type, initial_balance, current_balance, currency, is_archived, is_deleted
         ) VALUES (
            :user_id, :name, :type, :initial_balance, :current_balance, :currency, 0, 0
         )'
    );

    $accountIdByName = [];
    foreach ($orderedAccountNames as $name) {
        $key = lowerKey($name);
        $opening = $sourceOpening[$key] ?? 0.0;
        $closing = $sourceClosing[$key] ?? 0.0;
        $type = inferAccountType($name, $closing);

        $accountInsert->execute([
            ':user_id' => $userId,
            ':name' => $name,
            ':type' => $type,
            ':initial_balance' => round($opening, 2),
            ':current_balance' => round($closing, 2),
            ':currency' => 'INR',
        ]);
        $accountIdByName[$key] = (int) $pdo->lastInsertId();
    }

    $categoryInsert = $pdo->prepare(
        'INSERT INTO categories (
            user_id, name, type, icon, color, is_default, is_deleted
         ) VALUES (
            :user_id, :name, :type, :icon, :color, 0, 0
         )'
    );

    $categoryIdByTypeName = [];
    foreach ($categoriesSheet as $row) {
        $name = normalizeText($row['Title'] ?? '', 120);
        $rawType = lowerKey((string) ($row['Category Type'] ?? ''));
        if ($name === '' || ($rawType !== 'income' && $rawType !== 'expense')) {
            continue;
        }

        $mapKey = $rawType . '|' . lowerKey($name);
        if (isset($categoryIdByTypeName[$mapKey])) {
            continue;
        }

        $color = $palette[$paletteIndex % count($palette)];
        $paletteIndex++;
        $icon = inferCategoryIcon($name, $rawType);

        $categoryInsert->execute([
            ':user_id' => $userId,
            ':name' => $name,
            ':type' => $rawType,
            ':icon' => $icon,
            ':color' => $color,
        ]);

        $categoryIdByTypeName[$mapKey] = (int) $pdo->lastInsertId();
    }

    $normalized = [];
    $sequence = 0;
    foreach ($activities as $row) {
        $voucherType = lowerKey((string) ($row['Voucher Type'] ?? ''));
        if (!in_array($voucherType, ['income', 'expense', 'transfer'], true)) {
            continue;
        }

        $amount = parseNumber($row['Voucher Amount'] ?? 0);
        if (abs($amount) < 0.0001) {
            continue;
        }

        $dateYmd = parseDateYmd((string) ($row['Voucher Date'] ?? ''));
        $description = normalizeText($row['Description'] ?? '', 220);
        $tags = normalizeText($row['Tags'] ?? '', 100);
        $events = normalizeText($row['Events'] ?? '', 100);
        $noteParts = [];
        if ($description !== '') {
            $noteParts[] = $description;
        }
        if ($tags !== '') {
            $noteParts[] = 'Tags: ' . $tags;
        }
        if ($events !== '') {
            $noteParts[] = 'Event: ' . $events;
        }
        $note = normalizeText(implode(' | ', $noteParts), 255);
        $location = normalizeText(($row['Place'] ?? '') !== '' ? $row['Place'] : ($row['Travel Location'] ?? ''), 255);

        $normalized[] = [
            'row_index' => ++$sequence,
            'type' => $voucherType,
            'date' => $dateYmd,
            'datetime' => buildDateTime($dateYmd, $sequence),
            'amount_raw' => $amount,
            'amount' => abs($amount),
            'description' => $description,
            'note' => $note !== '' ? $note : null,
            'location' => $location !== '' ? $location : null,
            'category_name' => normalizeText($row['Category Name'] ?? '', 120),
            'account_name' => normalizeText($row['Account Name'] ?? '', 120),
        ];
    }

    $transactionInsert = $pdo->prepare(
        'INSERT INTO transactions (
            user_id, from_account_id, to_account_id, category_id, amount, type, running_balance,
            reference_type, reference_id, note, location, receipt_path, transaction_date, is_deleted
         ) VALUES (
            :user_id, :from_account_id, :to_account_id, :category_id, :amount, :type, 0,
            :reference_type, NULL, :note, :location, NULL, :transaction_date, 0
         )'
    );

    $ensureCategory = function (string $name, string $type) use (
        &$categoryIdByTypeName,
        $categoryInsert,
        $userId,
        &$paletteIndex,
        $palette
    ): ?int {
        $cleanName = normalizeText($name, 120);
        if ($cleanName === '' || lowerKey($cleanName) === 'no category') {
            return null;
        }

        $mapKey = $type . '|' . lowerKey($cleanName);
        if (isset($categoryIdByTypeName[$mapKey])) {
            return $categoryIdByTypeName[$mapKey];
        }

        $color = $palette[$paletteIndex % count($palette)];
        $paletteIndex++;
        $icon = inferCategoryIcon($cleanName, $type);
        $categoryInsert->execute([
            ':user_id' => $userId,
            ':name' => $cleanName,
            ':type' => $type,
            ':icon' => $icon,
            ':color' => $color,
        ]);
        $id = (int) db()->lastInsertId();
        $categoryIdByTypeName[$mapKey] = $id;
        return $id;
    };

    $insertTransaction = function (
        string $type,
        float $amount,
        ?int $fromAccountId,
        ?int $toAccountId,
        ?int $categoryId,
        ?string $note,
        ?string $location,
        string $transactionDate
    ) use ($transactionInsert, $userId): void {
        $transactionInsert->execute([
            ':user_id' => $userId,
            ':from_account_id' => $fromAccountId,
            ':to_account_id' => $toAccountId,
            ':category_id' => $categoryId,
            ':amount' => round(abs($amount), 2),
            ':type' => $type,
            ':reference_type' => 'imported_hysab',
            ':note' => $note,
            ':location' => $location,
            ':transaction_date' => $transactionDate,
        ]);
    };

    $pendingNegatives = [];
    $unmatchedPositiveTransfers = [];
    $negativeTransfers = [];
    $positiveTransfers = [];
    $nonTransferItems = [];
    $importedCounts = ['income' => 0, 'expense' => 0, 'transfer' => 0];

    foreach ($normalized as $item) {
        if ($item['type'] === 'transfer') {
            if ($item['amount_raw'] < 0) {
                $negativeTransfers[] = $item;
            } else {
                $positiveTransfers[] = $item;
            }
            continue;
        }
        $nonTransferItems[] = $item;
    }

    foreach ($nonTransferItems as $item) {
        $accountKey = lowerKey($item['account_name']);
        $accountId = $accountIdByName[$accountKey] ?? null;
        if ($accountId === null) {
            continue;
        }

        if ($item['type'] === 'expense') {
            $categoryId = $ensureCategory($item['category_name'], 'expense');
            $insertTransaction('expense', $item['amount'], $accountId, null, $categoryId, $item['note'], $item['location'], $item['datetime']);
            $importedCounts['expense']++;
            continue;
        }

        $categoryId = $ensureCategory($item['category_name'], 'income');
        $insertTransaction('income', $item['amount'], null, $accountId, $categoryId, $item['note'], $item['location'], $item['datetime']);
        $importedCounts['income']++;
    }

    $pendingNegatives = $negativeTransfers;
    foreach ($positiveTransfers as $item) {
        $matchIdx = findMatchingNegativeTransfer($pendingNegatives, $item);
        if ($matchIdx === null) {
            $unmatchedPositiveTransfers[] = $item;
            continue;
        }

        $negative = $pendingNegatives[$matchIdx];
        unset($pendingNegatives[$matchIdx]);
        $pendingNegatives = array_values($pendingNegatives);

        $fromAccountId = $accountIdByName[lowerKey($negative['account_name'])] ?? null;
        $toAccountId = $accountIdByName[lowerKey($item['account_name'])] ?? null;
        if ($fromAccountId === null || $toAccountId === null) {
            continue;
        }

        $note = $negative['note'];
        if (($item['note'] ?? null) !== null && $item['note'] !== $note) {
            $note = normalizeText(trim((string) $note . ' | ' . (string) $item['note']), 255);
        }

        $location = $negative['location'] ?? $item['location'];
        $txDate = $item['datetime'];
        $amount = $item['amount'];
        $insertTransaction('transfer', $amount, $fromAccountId, $toAccountId, null, $note, $location, $txDate);
        $importedCounts['transfer']++;
    }

    // Fallbacks to preserve data even if some transfers are not pairable.
    foreach ($pendingNegatives as $item) {
        $fromId = $accountIdByName[lowerKey($item['account_name'])] ?? null;
        if ($fromId === null) {
            continue;
        }
        $note = normalizeText('Imported unpaired transfer debit' . ($item['note'] ? ' | ' . $item['note'] : ''), 255);
        $insertTransaction('expense', $item['amount'], $fromId, null, null, $note, $item['location'], $item['datetime']);
        $importedCounts['expense']++;
    }

    foreach ($unmatchedPositiveTransfers as $item) {
        $toId = $accountIdByName[lowerKey($item['account_name'])] ?? null;
        if ($toId === null) {
            continue;
        }
        $note = normalizeText('Imported unpaired transfer credit' . ($item['note'] ? ' | ' . $item['note'] : ''), 255);
        $insertTransaction('income', $item['amount'], null, $toId, null, $note, $item['location'], $item['datetime']);
        $importedCounts['income']++;
    }

    recalculateBalances($pdo, $userId);

    $pdo->commit();

    $countStmt = $pdo->prepare(
        'SELECT
            (SELECT COUNT(*) FROM accounts WHERE user_id = :user_id_a AND is_deleted = 0) AS accounts_count,
            (SELECT COUNT(*) FROM categories WHERE user_id = :user_id_c AND is_deleted = 0) AS categories_count,
            (SELECT COUNT(*) FROM transactions WHERE user_id = :user_id_t AND is_deleted = 0) AS transactions_count'
    );
    $countStmt->execute([
        ':user_id_a' => $userId,
        ':user_id_c' => $userId,
        ':user_id_t' => $userId,
    ]);
    $counts = $countStmt->fetch(PDO::FETCH_ASSOC) ?: ['accounts_count' => 0, 'categories_count' => 0, 'transactions_count' => 0];

    $accCheckStmt = $pdo->prepare(
        'SELECT name, current_balance
         FROM accounts
         WHERE user_id = :user_id
           AND is_deleted = 0'
    );
    $accCheckStmt->execute([':user_id' => $userId]);
    $dbAccounts = $accCheckStmt->fetchAll(PDO::FETCH_ASSOC);

    $diffLines = [];
    $maxDiff = 0.0;
    foreach ($dbAccounts as $account) {
        $key = lowerKey((string) $account['name']);
        if (!array_key_exists($key, $sourceClosing)) {
            continue;
        }
        $expected = (float) $sourceClosing[$key];
        $actual = round((float) $account['current_balance'], 2);
        $diff = round($actual - $expected, 2);
        $maxDiff = max($maxDiff, abs($diff));
        if (abs($diff) >= 0.01) {
            $diffLines[] = sprintf('%s => expected %.2f, actual %.2f, diff %.2f', $account['name'], $expected, $actual, $diff);
        }
    }

    echo "IMPORT_OK\n";
    echo 'User ID: ' . $userId . "\n";
    echo 'Accounts: ' . (int) $counts['accounts_count'] . "\n";
    echo 'Categories: ' . (int) $counts['categories_count'] . "\n";
    echo 'Transactions: ' . (int) $counts['transactions_count'] . "\n";
    echo 'Imported Type Counts: income=' . $importedCounts['income']
        . ', expense=' . $importedCounts['expense']
        . ', transfer=' . $importedCounts['transfer'] . "\n";
    echo 'Unpaired Transfers: debit=' . count($pendingNegatives)
        . ', credit=' . count($unmatchedPositiveTransfers) . "\n";
    echo 'Max Closing Balance Diff (vs source ACCOUNT sheet): ' . number_format($maxDiff, 2, '.', '') . "\n";
    if (count($diffLines) > 0) {
        echo "Balance Diffs:\n";
        foreach ($diffLines as $line) {
            echo '- ' . $line . "\n";
        }
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "IMPORT_FAILED: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
