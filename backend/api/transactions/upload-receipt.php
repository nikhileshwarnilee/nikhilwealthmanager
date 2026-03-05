<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('transactions_upload_receipt', 120, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

if (!isset($_FILES['receipt']) || !is_array($_FILES['receipt'])) {
    Response::error('receipt file is required.', 422);
}

$file = $_FILES['receipt'];
if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    Response::error('Failed to upload receipt file.', 422);
}

$maxSize = 5 * 1024 * 1024;
$size = (int) ($file['size'] ?? 0);
if ($size <= 0 || $size > $maxSize) {
    Response::error('Receipt must be smaller than 5MB.', 422);
}

$tmpPath = (string) ($file['tmp_name'] ?? '');
if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
    Response::error('Invalid uploaded file.', 422);
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = $finfo ? finfo_file($finfo, $tmpPath) : '';
if ($finfo) {
    finfo_close($finfo);
}

$allowed = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'application/pdf' => 'pdf',
];

$extension = $allowed[$mime] ?? null;
if ($extension === null) {
    Response::error('Allowed receipt types: jpg, jpeg, png, pdf.', 422);
}

$uploadDir = dirname(__DIR__, 2) . '/uploads/receipts/' . $userId;
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
    Response::error('Could not create upload directory.', 500);
}

$filename = bin2hex(random_bytes(16)) . '.' . $extension;
$absolutePath = $uploadDir . '/' . $filename;

if (!move_uploaded_file($tmpPath, $absolutePath)) {
    Response::error('Could not save uploaded receipt.', 500);
}

$relativePath = 'uploads/receipts/' . $userId . '/' . $filename;
$appUrl = rtrim((string) env('APP_URL', ''), '/');
$backendBase = $appUrl !== '' ? ($appUrl . '/backend/') : '/backend/';
$publicUrl = $backendBase . $relativePath;

Response::success('Receipt uploaded.', [
    'receipt_path' => $relativePath,
    'receipt_url' => $publicUrl,
    'mime_type' => $mime,
    'size' => $size,
]);
