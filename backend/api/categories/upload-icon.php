<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/bootstrap.php';

RateLimitMiddleware::enforce('categories_upload_icon', 120, 600);
Request::enforceMethod('POST');
$user = AuthMiddleware::user();
$userId = (int) $user['id'];

if (!isset($_FILES['icon']) || !is_array($_FILES['icon'])) {
    Response::error('icon file is required.', 422);
}

$file = $_FILES['icon'];
if ((int) ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    Response::error('Failed to upload icon file.', 422);
}

$maxSize = 2 * 1024 * 1024;
$size = (int) ($file['size'] ?? 0);
if ($size <= 0 || $size > $maxSize) {
    Response::error('Icon must be smaller than 2MB.', 422);
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
    'image/webp' => 'webp',
    'image/gif' => 'gif',
];

$extension = $allowed[$mime] ?? null;
if ($extension === null) {
    Response::error('Allowed icon types: jpg, jpeg, png, webp, gif.', 422);
}

$uploadDir = dirname(__DIR__, 2) . '/uploads/category-icons/' . $userId;
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
    Response::error('Could not create upload directory.', 500);
}

$filename = bin2hex(random_bytes(16)) . '.' . $extension;
$absolutePath = $uploadDir . '/' . $filename;

if (!move_uploaded_file($tmpPath, $absolutePath)) {
    Response::error('Could not save uploaded icon.', 500);
}

$relativePath = 'uploads/category-icons/' . $userId . '/' . $filename;
$publicUrl = '/nikhilwealthmanager/backend/' . $relativePath;

Response::success('Icon uploaded.', [
    'icon_path' => $relativePath,
    'icon_url' => $publicUrl,
    'mime_type' => $mime,
    'size' => $size,
]);
