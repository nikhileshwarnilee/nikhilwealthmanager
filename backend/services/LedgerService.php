<?php

declare(strict_types=1);

final class LedgerService
{
    public static function summary(int $userId): array
    {
        self::assertModuleEnabled($userId);

        $stmt = db()->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN status = \'open\' AND direction = \'receivable\' THEN amount ELSE 0 END), 0) AS receivable_total,
                COALESCE(SUM(CASE WHEN status = \'open\' AND direction = \'payable\' THEN amount ELSE 0 END), 0) AS payable_total,
                SUM(CASE WHEN status = \'open\' THEN 1 ELSE 0 END) AS open_entries_count
             FROM ledger_entries
             WHERE user_id = :user_id
               AND contact_id IN (
                    SELECT id
                    FROM ledger_contacts
                    WHERE user_id = :user_id_contacts
                      AND is_deleted = 0
               )'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':user_id_contacts' => $userId,
        ]);
        $row = $stmt->fetch() ?: [];

        $contactsStmt = db()->prepare(
            'SELECT COUNT(*) AS total
             FROM ledger_contacts
             WHERE user_id = :user_id
               AND is_deleted = 0'
        );
        $contactsStmt->execute([':user_id' => $userId]);
        $contactsRow = $contactsStmt->fetch() ?: [];

        $receivableTotal = round((float) ($row['receivable_total'] ?? 0), 2);
        $payableTotal = round((float) ($row['payable_total'] ?? 0), 2);

        return [
            'receivable_total' => $receivableTotal,
            'payable_total' => $payableTotal,
            'net_total' => round($receivableTotal - $payableTotal, 2),
            'open_entries_count' => (int) ($row['open_entries_count'] ?? 0),
            'contacts_count' => (int) ($contactsRow['total'] ?? 0),
        ];
    }

    public static function overview(int $userId, string $search = '', string $focus = 'all'): array
    {
        self::assertModuleEnabled($userId);

        $focus = self::normalizeFocus($focus);
        $summary = self::summary($userId);

        $params = [':user_id' => $userId];
        $contactWhere = [
            'c.user_id = :user_id',
            'c.is_deleted = 0',
        ];

        if ($search !== '') {
            $contactWhere[] = '(c.name LIKE :search OR c.phone LIKE :search OR c.email LIKE :search OR c.notes LIKE :search)';
            $params[':search'] = '%' . $search . '%';
        }

        $contactSql = 'SELECT
                c.id,
                c.user_id,
                c.name,
                c.party_type,
                c.phone,
                c.email,
                c.notes,
                c.created_at,
                c.updated_at,
                COALESCE(SUM(CASE WHEN e.status = \'open\' AND e.direction = \'receivable\' THEN e.amount ELSE 0 END), 0) AS open_receivable_total,
                COALESCE(SUM(CASE WHEN e.status = \'open\' AND e.direction = \'payable\' THEN e.amount ELSE 0 END), 0) AS open_payable_total,
                SUM(CASE WHEN e.status = \'open\' THEN 1 ELSE 0 END) AS open_entries_count,
                MAX(COALESCE(e.converted_at, e.created_at, c.updated_at)) AS last_activity_at
             FROM ledger_contacts c
             LEFT JOIN ledger_entries e
               ON e.contact_id = c.id
              AND e.user_id = c.user_id
              AND e.status <> \'cancelled\'
             WHERE ' . implode(' AND ', $contactWhere) . '
             GROUP BY c.id, c.user_id, c.name, c.party_type, c.phone, c.email, c.notes, c.created_at, c.updated_at
             ORDER BY last_activity_at DESC, c.name ASC';

        $contactStmt = db()->prepare($contactSql);
        $contactStmt->execute($params);

        $contacts = [];
        foreach ($contactStmt->fetchAll() as $row) {
            $receivable = round((float) ($row['open_receivable_total'] ?? 0), 2);
            $payable = round((float) ($row['open_payable_total'] ?? 0), 2);

            if ($focus === 'receivable' && $receivable <= 0) {
                continue;
            }
            if ($focus === 'payable' && $payable <= 0) {
                continue;
            }

            $contacts[] = [
                'id' => (int) $row['id'],
                'user_id' => (int) $row['user_id'],
                'name' => (string) $row['name'],
                'party_type' => (string) $row['party_type'],
                'phone' => $row['phone'] ?: null,
                'email' => $row['email'] ?: null,
                'notes' => $row['notes'] ?: null,
                'open_receivable_total' => $receivable,
                'open_payable_total' => $payable,
                'open_entries_count' => (int) ($row['open_entries_count'] ?? 0),
                'last_activity_at' => $row['last_activity_at'] ?: (string) $row['updated_at'],
                'created_at' => (string) $row['created_at'],
                'updated_at' => (string) $row['updated_at'],
            ];
        }

        return [
            'focus' => $focus,
            'summary' => $summary,
            'contacts' => $contacts,
            'open_entries' => self::listOpenEntries($userId, $search, $focus),
        ];
    }

    public static function createContact(int $userId, array $input): array
    {
        self::assertModuleEnabled($userId);

        $name = Validator::string($input['name'] ?? '', 120);
        $partyType = self::normalizePartyType($input['party_type'] ?? 'customer');
        $phone = Validator::string($input['phone'] ?? '', 40);
        $email = Validator::string($input['email'] ?? '', 150);
        $notes = Validator::string($input['notes'] ?? '', 255);

        if ($name === '') {
            Response::error('Contact name is required.', 422);
        }

        $existingStmt = db()->prepare(
            'SELECT id, is_deleted
             FROM ledger_contacts
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
            Response::error('Contact already exists.', 409);
        }

        if ($existing && (int) ($existing['is_deleted'] ?? 0) === 1) {
            $restoreStmt = db()->prepare(
                'UPDATE ledger_contacts
                 SET party_type = :party_type,
                     phone = :phone,
                     email = :email,
                     notes = :notes,
                     is_deleted = 0
                 WHERE id = :id
                   AND user_id = :user_id
                 LIMIT 1'
            );
            $restoreStmt->execute([
                ':id' => (int) $existing['id'],
                ':user_id' => $userId,
                ':party_type' => $partyType,
                ':phone' => $phone !== '' ? $phone : null,
                ':email' => $email !== '' ? $email : null,
                ':notes' => $notes !== '' ? $notes : null,
            ]);

            return self::getContact((int) $existing['id'], $userId);
        }

        $stmt = db()->prepare(
            'INSERT INTO ledger_contacts (user_id, name, party_type, phone, email, notes, is_deleted)
             VALUES (:user_id, :name, :party_type, :phone, :email, :notes, 0)'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':name' => $name,
            ':party_type' => $partyType,
            ':phone' => $phone !== '' ? $phone : null,
            ':email' => $email !== '' ? $email : null,
            ':notes' => $notes !== '' ? $notes : null,
        ]);

        return self::getContact((int) db()->lastInsertId(), $userId);
    }

    public static function updateContact(int $userId, int $contactId, array $input): array
    {
        self::assertModuleEnabled($userId);
        self::assertContact($contactId, $userId);

        $name = Validator::string($input['name'] ?? '', 120);
        $partyType = self::normalizePartyType($input['party_type'] ?? 'customer');
        $phone = Validator::string($input['phone'] ?? '', 40);
        $email = Validator::string($input['email'] ?? '', 150);
        $notes = Validator::string($input['notes'] ?? '', 255);

        if ($name === '') {
            Response::error('Contact name is required.', 422);
        }

        $stmt = db()->prepare(
            'UPDATE ledger_contacts
             SET name = :name,
                 party_type = :party_type,
                 phone = :phone,
                 email = :email,
                 notes = :notes
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0'
        );

        try {
            $stmt->execute([
                ':name' => $name,
                ':party_type' => $partyType,
                ':phone' => $phone !== '' ? $phone : null,
                ':email' => $email !== '' ? $email : null,
                ':notes' => $notes !== '' ? $notes : null,
                ':id' => $contactId,
                ':user_id' => $userId,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                Response::error('Contact already exists.', 409);
            }
            throw $exception;
        }

        return self::getContact($contactId, $userId);
    }

    public static function deleteContact(int $userId, int $contactId): array
    {
        self::assertModuleEnabled($userId);
        $contact = self::getContact($contactId, $userId);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            $cancelStmt = $pdo->prepare(
                'UPDATE ledger_entries
                 SET status = \'cancelled\'
                 WHERE user_id = :user_id
                   AND contact_id = :contact_id
                   AND status = \'open\''
            );
            $cancelStmt->execute([
                ':user_id' => $userId,
                ':contact_id' => $contactId,
            ]);

            $deleteStmt = $pdo->prepare(
                'UPDATE ledger_contacts
                 SET is_deleted = 1
                 WHERE id = :id
                   AND user_id = :user_id
                   AND is_deleted = 0
                 LIMIT 1'
            );
            $deleteStmt->execute([
                ':id' => $contactId,
                ':user_id' => $userId,
            ]);

            $pdo->commit();
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }

        return [
            'contact_id' => $contactId,
            'name' => (string) ($contact['name'] ?? ''),
            'status' => 'deleted',
        ];
    }

    public static function getContact(int $contactId, int $userId): array
    {
        self::assertModuleEnabled($userId);

        $stmt = db()->prepare(
            'SELECT id, user_id, name, party_type, phone, email, notes, created_at, updated_at
             FROM ledger_contacts
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $contactId,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Ledger contact not found.', 404);
        }

        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'name' => (string) $row['name'],
            'party_type' => (string) $row['party_type'],
            'phone' => $row['phone'] ?: null,
            'email' => $row['email'] ?: null,
            'notes' => $row['notes'] ?: null,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    public static function createEntry(int $userId, array $input): array
    {
        self::assertModuleEnabled($userId);

        $contactId = Validator::positiveInt($input['contact_id'] ?? 0, 'contact_id');
        $direction = self::normalizeDirection($input['direction'] ?? '');
        $amount = Validator::amount($input['amount'] ?? null);
        $note = Validator::string($input['note'] ?? '', 255);
        $attachmentPath = Validator::string($input['attachment_path'] ?? '', 255);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            self::assertContact($contactId, $userId, $pdo);
            self::syncContactPartyType($contactId, $userId, self::directionPartyType($direction), $pdo);

            $stmt = $pdo->prepare(
                'INSERT INTO ledger_entries (
                    user_id, contact_id, direction, amount, note, attachment_path, status
                 ) VALUES (
                    :user_id, :contact_id, :direction, :amount, :note, :attachment_path, \'open\'
                 )'
            );
            $stmt->execute([
                ':user_id' => $userId,
                ':contact_id' => $contactId,
                ':direction' => $direction,
                ':amount' => $amount,
                ':note' => $note !== '' ? $note : null,
                ':attachment_path' => $attachmentPath !== '' ? $attachmentPath : null,
            ]);

            $entryId = (int) $pdo->lastInsertId();
            $pdo->commit();

            return self::getEntry($entryId, $userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function updateEntry(int $userId, int $entryId, array $input): array
    {
        self::assertModuleEnabled($userId);

        $existing = self::assertOpenEntry($entryId, $userId);
        $contactId = Validator::positiveInt($input['contact_id'] ?? $existing['contact_id'] ?? 0, 'contact_id');
        $direction = self::normalizeDirection($input['direction'] ?? $existing['direction'] ?? '');
        $amount = Validator::amount($input['amount'] ?? $existing['amount'] ?? null);
        $note = Validator::string($input['note'] ?? $existing['note'] ?? '', 255);
        $attachmentPath = Validator::string($input['attachment_path'] ?? $existing['attachment_path'] ?? '', 255);

        $pdo = db();
        $pdo->beginTransaction();
        try {
            self::assertContact($contactId, $userId, $pdo);
            self::syncContactPartyType($contactId, $userId, self::directionPartyType($direction), $pdo);

            $stmt = $pdo->prepare(
                'UPDATE ledger_entries
                 SET contact_id = :contact_id,
                     direction = :direction,
                     amount = :amount,
                     note = :note,
                     attachment_path = :attachment_path
                 WHERE id = :id
                   AND user_id = :user_id
                   AND status = \'open\'
                 LIMIT 1'
            );
            $stmt->execute([
                ':contact_id' => $contactId,
                ':direction' => $direction,
                ':amount' => $amount,
                ':note' => $note !== '' ? $note : null,
                ':attachment_path' => $attachmentPath !== '' ? $attachmentPath : null,
                ':id' => $entryId,
                ':user_id' => $userId,
            ]);

            $pdo->commit();

            return self::getEntry($entryId, $userId);
        } catch (Throwable $exception) {
            $pdo->rollBack();
            throw $exception;
        }
    }

    public static function cancelEntry(int $userId, int $entryId): array
    {
        self::assertModuleEnabled($userId);

        $entry = self::assertOpenEntry($entryId, $userId);

        $stmt = db()->prepare(
            'UPDATE ledger_entries
             SET status = \'cancelled\'
             WHERE id = :id
               AND user_id = :user_id
               AND status = \'open\'
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $entryId,
            ':user_id' => $userId,
        ]);

        return [
            'entry_id' => (int) $entry['id'],
            'status' => 'cancelled',
        ];
    }

    public static function getEntry(int $entryId, int $userId, ?PDO $pdo = null): array
    {
        self::assertModuleEnabled($userId, $pdo);

        $db = $pdo ?? db();
        $stmt = $db->prepare(
            'SELECT
                e.id,
                e.user_id,
                e.contact_id,
                e.direction,
                e.amount,
                e.note,
                e.attachment_path,
                e.status,
                e.converted_transaction_id,
                e.converted_at,
                e.created_at,
                e.updated_at,
                c.name AS contact_name,
                c.party_type AS contact_party_type
             FROM ledger_entries e
             INNER JOIN ledger_contacts c
               ON c.id = e.contact_id
              AND c.user_id = e.user_id
              AND c.is_deleted = 0
             WHERE e.id = :id
               AND e.user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $entryId,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Ledger entry not found.', 404);
        }

        return self::mapEntryRow($row);
    }

    public static function assertOpenEntry(int $entryId, int $userId, ?PDO $pdo = null): array
    {
        $entry = self::getEntry($entryId, $userId, $pdo);
        if ((string) ($entry['status'] ?? '') !== 'open') {
            Response::error('Ledger entry is already closed.', 422);
        }

        return $entry;
    }

    public static function markConverted(int $userId, int $entryId, int $transactionId, ?PDO $pdo = null): array
    {
        self::assertModuleEnabled($userId, $pdo);

        $db = $pdo ?? db();
        $entry = self::assertOpenEntry($entryId, $userId, $db);

        $stmt = $db->prepare(
            'UPDATE ledger_entries
             SET status = \'converted\',
                 converted_transaction_id = :transaction_id,
                 converted_at = NOW()
             WHERE id = :id
               AND user_id = :user_id
               AND status = \'open\'
             LIMIT 1'
        );
        $stmt->execute([
            ':transaction_id' => $transactionId,
            ':id' => $entryId,
            ':user_id' => $userId,
        ]);

        return [
            'entry_id' => (int) $entry['id'],
            'transaction_id' => $transactionId,
            'status' => 'converted',
        ];
    }

    public static function contactView(int $userId, int $contactId): array
    {
        self::assertModuleEnabled($userId);

        $contact = self::getContact($contactId, $userId);
        $summaryStmt = db()->prepare(
            'SELECT
                COALESCE(SUM(CASE WHEN status = \'open\' AND direction = \'receivable\' THEN amount ELSE 0 END), 0) AS open_receivable_total,
                COALESCE(SUM(CASE WHEN status = \'open\' AND direction = \'payable\' THEN amount ELSE 0 END), 0) AS open_payable_total,
                COALESCE(SUM(CASE WHEN status = \'converted\' AND direction = \'receivable\' THEN amount ELSE 0 END), 0) AS settled_receivable_total,
                COALESCE(SUM(CASE WHEN status = \'converted\' AND direction = \'payable\' THEN amount ELSE 0 END), 0) AS settled_payable_total,
                SUM(CASE WHEN status = \'open\' THEN 1 ELSE 0 END) AS open_count,
                SUM(CASE WHEN status = \'converted\' THEN 1 ELSE 0 END) AS settled_count
             FROM ledger_entries
             WHERE user_id = :user_id
               AND contact_id = :contact_id'
        );
        $summaryStmt->execute([
            ':user_id' => $userId,
            ':contact_id' => $contactId,
        ]);
        $summaryRow = $summaryStmt->fetch() ?: [];

        $openEntriesStmt = db()->prepare(
            'SELECT
                e.id,
                e.user_id,
                e.contact_id,
                e.direction,
                e.amount,
                e.note,
                e.attachment_path,
                e.status,
                e.converted_transaction_id,
                e.converted_at,
                e.created_at,
                e.updated_at,
                c.name AS contact_name,
                c.party_type AS contact_party_type
             FROM ledger_entries e
             INNER JOIN ledger_contacts c
               ON c.id = e.contact_id
              AND c.user_id = e.user_id
              AND c.is_deleted = 0
             WHERE e.user_id = :user_id
               AND e.contact_id = :contact_id
               AND e.status = \'open\'
             ORDER BY e.created_at DESC, e.id DESC'
        );
        $openEntriesStmt->execute([
            ':user_id' => $userId,
            ':contact_id' => $contactId,
        ]);

        $historyStmt = db()->prepare(
            'SELECT
                e.id AS ledger_entry_id,
                e.direction,
                e.amount,
                e.note AS ledger_note,
                e.attachment_path,
                e.converted_at,
                t.id AS transaction_id,
                t.type AS transaction_type,
                t.transaction_date,
                t.note AS transaction_note,
                fa.name AS from_account_name,
                ta.name AS to_account_name,
                c.name AS category_name
             FROM ledger_entries e
             LEFT JOIN transactions t
               ON t.id = e.converted_transaction_id
              AND t.user_id = e.user_id
              AND t.is_deleted = 0
             LEFT JOIN accounts fa
               ON fa.id = t.from_account_id
              AND fa.user_id = t.user_id
              AND fa.is_deleted = 0
             LEFT JOIN accounts ta
               ON ta.id = t.to_account_id
              AND ta.user_id = t.user_id
              AND ta.is_deleted = 0
             LEFT JOIN categories c
               ON c.id = t.category_id
              AND c.user_id = t.user_id
              AND c.is_deleted = 0
             WHERE e.user_id = :user_id
               AND e.contact_id = :contact_id
               AND e.status = \'converted\'
             ORDER BY COALESCE(t.transaction_date, e.converted_at) DESC, e.id DESC'
        );
        $historyStmt->execute([
            ':user_id' => $userId,
            ':contact_id' => $contactId,
        ]);

        $openEntries = array_map([self::class, 'mapEntryRow'], $openEntriesStmt->fetchAll());
        $history = [];
        foreach ($historyStmt->fetchAll() as $row) {
            $history[] = [
                'ledger_entry_id' => (int) $row['ledger_entry_id'],
                'transaction_id' => $row['transaction_id'] !== null ? (int) $row['transaction_id'] : null,
                'direction' => (string) $row['direction'],
                'amount' => round((float) ($row['amount'] ?? 0), 2),
                'note' => $row['transaction_note'] ?: ($row['ledger_note'] ?: null),
                'attachment_path' => $row['attachment_path'] ?: null,
                'converted_at' => $row['converted_at'] ?: null,
                'transaction_type' => $row['transaction_type'] ?: null,
                'transaction_date' => $row['transaction_date'] ?: null,
                'account_name' => $row['direction'] === 'receivable'
                    ? ($row['to_account_name'] ?: null)
                    : ($row['from_account_name'] ?: null),
                'category_name' => $row['category_name'] ?: null,
            ];
        }

        return [
            'contact' => $contact,
            'summary' => [
                'open_receivable_total' => round((float) ($summaryRow['open_receivable_total'] ?? 0), 2),
                'open_payable_total' => round((float) ($summaryRow['open_payable_total'] ?? 0), 2),
                'settled_receivable_total' => round((float) ($summaryRow['settled_receivable_total'] ?? 0), 2),
                'settled_payable_total' => round((float) ($summaryRow['settled_payable_total'] ?? 0), 2),
                'open_count' => (int) ($summaryRow['open_count'] ?? 0),
                'settled_count' => (int) ($summaryRow['settled_count'] ?? 0),
            ],
            'open_entries' => $openEntries,
            'history' => $history,
        ];
    }

    public static function openItemsReport(int $userId, string $focus = 'all', string $dateFromRaw = '', string $dateToRaw = ''): array
    {
        self::assertModuleEnabled($userId);

        $focus = self::normalizeFocus($focus);
        [$rangeStart, $rangeEnd] = self::normalizeReportRange($dateFromRaw, $dateToRaw);

        $params = [':user_id' => $userId];
        $where = [
            'e.user_id = :user_id',
            'e.status = \'open\'',
            'c.is_deleted = 0',
        ];

        if ($focus === 'receivable' || $focus === 'payable') {
            $where[] = 'e.direction = :direction';
            $params[':direction'] = $focus;
        }
        if ($rangeStart !== null && $rangeEnd !== null) {
            $where[] = 'e.created_at BETWEEN :start_date AND :end_date';
            $params[':start_date'] = $rangeStart;
            $params[':end_date'] = $rangeEnd;
        }

        $stmt = db()->prepare(
            'SELECT
                e.id,
                e.user_id,
                e.contact_id,
                e.direction,
                e.amount,
                e.note,
                e.attachment_path,
                e.status,
                e.converted_transaction_id,
                e.converted_at,
                e.created_at,
                e.updated_at,
                c.name AS contact_name,
                c.party_type AS contact_party_type
             FROM ledger_entries e
             INNER JOIN ledger_contacts c
               ON c.id = e.contact_id
              AND c.user_id = e.user_id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY e.created_at DESC, e.id DESC'
        );
        $stmt->execute($params);
        $openEntries = array_map([self::class, 'mapEntryRow'], $stmt->fetchAll());

        $receivableTotal = 0.0;
        $payableTotal = 0.0;
        foreach ($openEntries as $entry) {
            if ((string) ($entry['direction'] ?? '') === 'payable') {
                $payableTotal += (float) ($entry['amount'] ?? 0);
            } else {
                $receivableTotal += (float) ($entry['amount'] ?? 0);
            }
        }

        $receivableTotal = round($receivableTotal, 2);
        $payableTotal = round($payableTotal, 2);

        return [
            'focus' => $focus,
            'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
            'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
            'summary' => [
                'receivable_total' => $receivableTotal,
                'payable_total' => $payableTotal,
                'net_total' => round($receivableTotal - $payableTotal, 2),
                'open_entries_count' => count($openEntries),
            ],
            'open_entries' => $openEntries,
        ];
    }

    public static function contactReport(int $userId, int $contactId, string $dateFromRaw = '', string $dateToRaw = ''): array
    {
        self::assertModuleEnabled($userId);

        $contact = self::getContact($contactId, $userId);
        [$rangeStart, $rangeEnd] = self::normalizeReportRange($dateFromRaw, $dateToRaw);

        $openSql = 'SELECT
                e.id,
                e.user_id,
                e.contact_id,
                e.direction,
                e.amount,
                e.note,
                e.attachment_path,
                e.status,
                e.converted_transaction_id,
                e.converted_at,
                e.created_at,
                e.updated_at,
                c.name AS contact_name,
                c.party_type AS contact_party_type
             FROM ledger_entries e
             INNER JOIN ledger_contacts c
               ON c.id = e.contact_id
              AND c.user_id = e.user_id
              AND c.is_deleted = 0
             WHERE e.user_id = :user_id
               AND e.contact_id = :contact_id
               AND e.status = \'open\'';
        $openParams = [
            ':user_id' => $userId,
            ':contact_id' => $contactId,
        ];
        if ($rangeStart !== null && $rangeEnd !== null) {
            $openSql .= ' AND e.created_at BETWEEN :start_date AND :end_date';
            $openParams[':start_date'] = $rangeStart;
            $openParams[':end_date'] = $rangeEnd;
        }
        $openSql .= ' ORDER BY e.created_at DESC, e.id DESC';

        $openEntriesStmt = db()->prepare($openSql);
        $openEntriesStmt->execute($openParams);
        $openEntries = array_map([self::class, 'mapEntryRow'], $openEntriesStmt->fetchAll());

        $historySql = 'SELECT
                e.id AS ledger_entry_id,
                e.direction,
                e.amount,
                e.note AS ledger_note,
                e.attachment_path,
                e.converted_at,
                t.id AS transaction_id,
                t.type AS transaction_type,
                t.transaction_date,
                t.note AS transaction_note,
                fa.name AS from_account_name,
                ta.name AS to_account_name,
                c.name AS category_name
             FROM ledger_entries e
             LEFT JOIN transactions t
               ON t.id = e.converted_transaction_id
              AND t.user_id = e.user_id
              AND t.is_deleted = 0
             LEFT JOIN accounts fa
               ON fa.id = t.from_account_id
              AND fa.user_id = t.user_id
              AND fa.is_deleted = 0
             LEFT JOIN accounts ta
               ON ta.id = t.to_account_id
              AND ta.user_id = t.user_id
              AND ta.is_deleted = 0
             LEFT JOIN categories c
               ON c.id = t.category_id
              AND c.user_id = t.user_id
              AND c.is_deleted = 0
             WHERE e.user_id = :user_id
               AND e.contact_id = :contact_id
               AND e.status = \'converted\'';
        $historyParams = [
            ':user_id' => $userId,
            ':contact_id' => $contactId,
        ];
        if ($rangeStart !== null && $rangeEnd !== null) {
            $historySql .= ' AND COALESCE(t.transaction_date, e.converted_at) BETWEEN :start_date AND :end_date';
            $historyParams[':start_date'] = $rangeStart;
            $historyParams[':end_date'] = $rangeEnd;
        }
        $historySql .= ' ORDER BY COALESCE(t.transaction_date, e.converted_at) DESC, e.id DESC';

        $historyStmt = db()->prepare($historySql);
        $historyStmt->execute($historyParams);

        $history = [];
        foreach ($historyStmt->fetchAll() as $row) {
            $history[] = [
                'ledger_entry_id' => (int) $row['ledger_entry_id'],
                'transaction_id' => $row['transaction_id'] !== null ? (int) $row['transaction_id'] : null,
                'direction' => (string) $row['direction'],
                'amount' => round((float) ($row['amount'] ?? 0), 2),
                'note' => $row['transaction_note'] ?: ($row['ledger_note'] ?: null),
                'attachment_path' => $row['attachment_path'] ?: null,
                'converted_at' => $row['converted_at'] ?: null,
                'transaction_type' => $row['transaction_type'] ?: null,
                'transaction_date' => $row['transaction_date'] ?: null,
                'account_name' => $row['direction'] === 'receivable'
                    ? ($row['to_account_name'] ?: null)
                    : ($row['from_account_name'] ?: null),
                'category_name' => $row['category_name'] ?: null,
            ];
        }

        $openReceivableTotal = 0.0;
        $openPayableTotal = 0.0;
        foreach ($openEntries as $entry) {
            if ((string) ($entry['direction'] ?? '') === 'payable') {
                $openPayableTotal += (float) ($entry['amount'] ?? 0);
            } else {
                $openReceivableTotal += (float) ($entry['amount'] ?? 0);
            }
        }

        $settledReceivableTotal = 0.0;
        $settledPayableTotal = 0.0;
        foreach ($history as $item) {
            if ((string) ($item['direction'] ?? '') === 'payable') {
                $settledPayableTotal += (float) ($item['amount'] ?? 0);
            } else {
                $settledReceivableTotal += (float) ($item['amount'] ?? 0);
            }
        }

        return [
            'date_from' => $rangeStart !== null ? date('Y-m-d', strtotime($rangeStart)) : null,
            'date_to' => $rangeEnd !== null ? date('Y-m-d', strtotime($rangeEnd)) : null,
            'contact' => $contact,
            'summary' => [
                'open_receivable_total' => round($openReceivableTotal, 2),
                'open_payable_total' => round($openPayableTotal, 2),
                'settled_receivable_total' => round($settledReceivableTotal, 2),
                'settled_payable_total' => round($settledPayableTotal, 2),
                'open_count' => count($openEntries),
                'settled_count' => count($history),
            ],
            'open_entries' => $openEntries,
            'history' => $history,
        ];
    }

    public static function buildTransactionNote(array $entry, ?string $noteOverride = null): string
    {
        $contactName = trim((string) ($entry['contact_name'] ?? $entry['name'] ?? ''));
        $note = Validator::string($noteOverride ?? ($entry['note'] ?? ''), 255);

        if ($contactName === '') {
            return $note;
        }
        if ($note === '') {
            return $contactName;
        }
        if (stripos($note, $contactName) === 0) {
            return $note;
        }

        return $contactName . ' - ' . $note;
    }

    public static function assertContact(int $contactId, int $userId, ?PDO $pdo = null): array
    {
        self::assertModuleEnabled($userId, $pdo);

        $db = $pdo ?? db();
        $stmt = $db->prepare(
            'SELECT id, user_id, name, party_type, phone, email, notes
             FROM ledger_contacts
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $contactId,
            ':user_id' => $userId,
        ]);
        $row = $stmt->fetch();
        if (!$row) {
            Response::error('Invalid ledger contact selected.', 422);
        }

        return $row;
    }

    private static function listOpenEntries(int $userId, string $search = '', string $focus = 'all'): array
    {
        $params = [':user_id' => $userId];
        $where = [
            'e.user_id = :user_id',
            'e.status = \'open\'',
            'c.is_deleted = 0',
        ];

        if ($search !== '') {
            $where[] = '(c.name LIKE :search OR e.note LIKE :search)';
            $params[':search'] = '%' . $search . '%';
        }
        if ($focus === 'receivable' || $focus === 'payable') {
            $where[] = 'e.direction = :direction';
            $params[':direction'] = $focus;
        }

        $stmt = db()->prepare(
            'SELECT
                e.id,
                e.user_id,
                e.contact_id,
                e.direction,
                e.amount,
                e.note,
                e.attachment_path,
                e.status,
                e.converted_transaction_id,
                e.converted_at,
                e.created_at,
                e.updated_at,
                c.name AS contact_name,
                c.party_type AS contact_party_type
             FROM ledger_entries e
             INNER JOIN ledger_contacts c
               ON c.id = e.contact_id
              AND c.user_id = e.user_id
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY e.created_at DESC, e.id DESC
             LIMIT 40'
        );
        $stmt->execute($params);

        return array_map([self::class, 'mapEntryRow'], $stmt->fetchAll());
    }

    private static function syncContactPartyType(int $contactId, int $userId, string $requiredPartyType, PDO $pdo): void
    {
        $contact = self::assertContact($contactId, $userId, $pdo);
        $current = (string) ($contact['party_type'] ?? 'customer');
        if ($current === 'both' || $current === $requiredPartyType) {
            return;
        }

        $stmt = $pdo->prepare(
            'UPDATE ledger_contacts
             SET party_type = \'both\'
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $contactId,
            ':user_id' => $userId,
        ]);
    }

    private static function normalizeDirection($direction): string
    {
        return Validator::enum((string) $direction, ['receivable', 'payable'], 'ledger direction');
    }

    private static function normalizePartyType($partyType): string
    {
        return Validator::enum((string) $partyType, ['customer', 'supplier', 'both'], 'ledger party type');
    }

    private static function directionPartyType(string $direction): string
    {
        return $direction === 'receivable' ? 'customer' : 'supplier';
    }

    private static function normalizeFocus(string $focus): string
    {
        return in_array($focus, ['receivable', 'payable'], true) ? $focus : 'all';
    }

    private static function normalizeReportRange(string $dateFromRaw = '', string $dateToRaw = ''): array
    {
        $from = trim($dateFromRaw);
        $to = trim($dateToRaw);
        if ($from === '' && $to === '') {
            return [null, null];
        }
        if ($from === '' || $to === '') {
            Response::error('Both date_from and date_to are required for ledger reports.', 422);
        }

        $fromDate = Validator::dateTime($from, false);
        $toDate = Validator::dateTime($to, false);
        $rangeStart = date('Y-m-d 00:00:00', strtotime((string) $fromDate));
        $rangeEnd = date('Y-m-d 23:59:59', strtotime((string) $toDate));
        if (strtotime($rangeStart) > strtotime($rangeEnd)) {
            Response::error('date_from must be before or equal to date_to.', 422);
        }

        return [$rangeStart, $rangeEnd];
    }

    private static function mapEntryRow(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'contact_id' => (int) $row['contact_id'],
            'contact_name' => (string) ($row['contact_name'] ?? ''),
            'contact_party_type' => (string) ($row['contact_party_type'] ?? 'customer'),
            'direction' => (string) $row['direction'],
            'amount' => round((float) ($row['amount'] ?? 0), 2),
            'note' => $row['note'] ?: null,
            'attachment_path' => $row['attachment_path'] ?: null,
            'status' => (string) $row['status'],
            'converted_transaction_id' => $row['converted_transaction_id'] !== null
                ? (int) $row['converted_transaction_id']
                : null,
            'converted_at' => $row['converted_at'] ?: null,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    private static function assertModuleEnabled(int $userId, ?PDO $pdo = null): void
    {
        if (!UserSettingsService::isModuleEnabled($userId, 'ledger', $pdo)) {
            Response::error('Ledger module is disabled.', 403);
        }
    }
}
