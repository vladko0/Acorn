<?php
declare(strict_types=1);

define('ACORN_ROOT', dirname(__DIR__));
define('ACORN_DATA_FILE', ACORN_ROOT . '/data/products.json');
define('ACORN_UPLOAD_DIR', ACORN_ROOT . '/images/uploads');
define('ACORN_CONFIG_FILE', __DIR__ . '/config.php');
define('ACORN_MAX_REQUEST_BYTES', 8 * 1024 * 1024);
define('ACORN_MAX_IMAGE_BYTES', 5 * 1024 * 1024);
define('ACORN_SESSION_SECONDS', 8 * 60 * 60);

function acorn_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Cache-Control: no-store');
}

function acorn_json($value, int $status = 200): void
{
    acorn_headers();
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function acorn_error(string $message, int $status = 400): void
{
    acorn_json(['error' => $message], $status);
}

function acorn_require_method(string $method): void
{
    if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== $method) {
        acorn_error('Неподдържан метод.', 405);
    }
}

function acorn_read_json(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > ACORN_MAX_REQUEST_BYTES) {
        acorn_error('Твърде голяма заявка.', 413);
    }
    $input = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($input) || json_last_error() !== JSON_ERROR_NONE) {
        acorn_error('Невалиден JSON.');
    }
    return $input;
}

function acorn_config(): array
{
    $config = is_file(ACORN_CONFIG_FILE) ? require ACORN_CONFIG_FILE : null;
    if (!is_array($config)) {
        acorn_error('Липсва конфигурация за администраторски вход.', 503);
    }
    return $config;
}

function acorn_cookie_path(): string
{
    $scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '/');
    $apiPosition = strpos($scriptName, '/api/');
    $prefix = $apiPosition === false ? '' : substr($scriptName, 0, $apiPosition);
    return ($prefix === '' ? '' : $prefix) . '/';
}

function acorn_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_name('acorn_admin');
    session_set_cookie_params([
        'lifetime' => ACORN_SESSION_SECONDS,
        'path' => acorn_cookie_path(),
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function acorn_is_admin(): bool
{
    acorn_start_session();
    $lastActive = (int) ($_SESSION['last_active'] ?? 0);
    if (empty($_SESSION['is_admin']) || !$lastActive || time() - $lastActive > ACORN_SESSION_SECONDS) {
        $_SESSION = [];
        return false;
    }
    $_SESSION['last_active'] = time();
    return true;
}

function acorn_require_admin(): void
{
    if (!acorn_is_admin()) {
        acorn_error('Необходим е администраторски вход.', 401);
    }
}

function acorn_read_catalog(): array
{
    $raw = is_file(ACORN_DATA_FILE) ? file_get_contents(ACORN_DATA_FILE) : false;
    $catalog = $raw === false ? null : json_decode($raw, true);
    if (!is_array($catalog)) {
        acorn_error('Каталогът не може да бъде прочетен.', 500);
    }
    return $catalog;
}

function acorn_text($value): string
{
    return is_scalar($value) ? trim((string) $value) : '';
}

function acorn_length(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function acorn_validate_catalog(array $input): array
{
    $source = acorn_read_catalog();
    $productsInput = $input['products'] ?? null;
    if (!is_array($productsInput) || count($productsInput) > 500) {
        throw new RuntimeException('Каталогът съдържа невалиден списък с продукти.');
    }

    if (array_key_exists('categories', $input) && !is_array($input['categories'])) {
        throw new RuntimeException('Каталогът съдържа невалиден списък с категории.');
    }
    $categoriesInput = array_key_exists('categories', $input)
        ? $input['categories']
        : (is_array($source['categories'] ?? null) ? $source['categories'] : []);
    if (count($categoriesInput) < 1 || count($categoriesInput) > 50) {
        throw new RuntimeException('Каталогът съдържа невалиден списък с категории.');
    }

    $categories = [];
    $categoryIds = [];
    $usedCategories = [];
    foreach (array_values($categoriesInput) as $index => $rawCategory) {
        $category = is_array($rawCategory) ? $rawCategory : [];
        $id = acorn_text($category['id'] ?? '');
        $name = acorn_text($category['name'] ?? '');
        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id) || isset($usedCategories[$id])) {
            throw new RuntimeException('Категория ' . ($index + 1) . ' има невалиден или повторен идентификатор.');
        }
        if ($name === '' || acorn_length($name) > 80) {
            throw new RuntimeException('Категория "' . $id . '" има невалидно име.');
        }
        $usedCategories[$id] = true;
        $categoryIds[] = $id;
        $categories[] = ['id' => $id, 'name' => $name];
    }
    $categoryPattern = implode('|', array_map(function ($category): string {
        return preg_quote($category, '#');
    }, $categoryIds));

    $usedIds = [];
    $products = [];
    foreach (array_values($productsInput) as $index => $raw) {
        $item = is_array($raw) ? $raw : [];
        $id = acorn_text($item['id'] ?? '');
        $name = acorn_text($item['name'] ?? '');
        $category = acorn_text($item['category'] ?? '');
        $image = acorn_text($item['image'] ?? '');
        $url = acorn_text($item['url'] ?? '');

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $id) || isset($usedIds[$id])) {
            throw new RuntimeException('Продукт ' . ($index + 1) . ' има невалиден или повторен идентификатор.');
        }
        $usedIds[$id] = true;
        if ($name === '' || acorn_length($name) > 120 || !in_array($category, $categoryIds, true)) {
            throw new RuntimeException('Продукт "' . ($name !== '' ? $name : $id) . '" има невалидно име или категория.');
        }
        if (!preg_match('#^images/[A-Za-z0-9._/-]+$#D', $image) || strpos($image, '..') !== false) {
            throw new RuntimeException('Продукт "' . $name . '" има невалиден път до изображение.');
        }
        $existingUrl = '#^produkti/(?:' . $categoryPattern . ')/' . preg_quote($id, '#') . '$#D';
        if (!preg_match($existingUrl, $url)) {
            throw new RuntimeException('Продукт "' . $name . '" има невалиден адрес.');
        }

        $rawPrices = $item['prices'] ?? null;
        if (!is_array($rawPrices) || count($rawPrices) > 10) {
            throw new RuntimeException('Продукт "' . $name . '" съдържа невалиден списък с цени.');
        }
        $prices = [];
        foreach ($rawPrices as $rawPrice) {
            $price = is_array($rawPrice) ? $rawPrice : [];
            $size = acorn_text($price['size'] ?? '');
            $eur = acorn_text($price['eur'] ?? '');
            $bgn = acorn_text($price['bgn'] ?? '');
            if ($size === '' || $eur === '' || $bgn === '' || acorn_length($size) > 80 || acorn_length($eur) > 40 || acorn_length($bgn) > 40) {
                throw new RuntimeException('Продукт "' . $name . '" съдържа непълна цена.');
            }
            $prices[] = ['size' => $size, 'eur' => $eur, 'bgn' => $bgn];
        }

        $products[] = [
            'id' => $id,
            'name' => $name,
            'category' => $category,
            'image' => $image,
            'url' => $url,
            'published' => ($item['published'] ?? true) !== false,
            'prices' => $prices,
        ];
    }

    return [
        'version' => $source['version'] ?? 1,
        'updatedAt' => gmdate('c'),
        'categories' => $categories,
        'products' => $products,
    ];
}

function acorn_save_catalog(array $catalog): void
{
    $json = json_encode($catalog, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    $temporary = ACORN_DATA_FILE . '.tmp-' . bin2hex(random_bytes(4));
    if (file_put_contents($temporary, $json, LOCK_EX) === false || !rename($temporary, ACORN_DATA_FILE)) {
        @unlink($temporary);
        throw new RuntimeException('Каталогът не може да бъде записан. Проверете правата на папка data/.');
    }
}

function acorn_save_image(array $input): string
{
    $type = strtolower(acorn_text($input['type'] ?? ''));
    $extensions = ['image/jpeg' => '.jpg', 'image/png' => '.png', 'image/webp' => '.webp'];
    if (!isset($extensions[$type])) {
        throw new RuntimeException('Разрешени са изображения JPG, PNG и WEBP.');
    }
    $data = preg_replace('/\s+/', '', acorn_text($input['data'] ?? ''));
    $buffer = is_string($data) ? base64_decode($data, true) : false;
    if (!is_string($buffer) || $buffer === '' || strlen($buffer) > ACORN_MAX_IMAGE_BYTES) {
        throw new RuntimeException('Снимката трябва да е до 5 MB.');
    }
    $isJpeg = $type === 'image/jpeg' && substr($buffer, 0, 2) === "\xFF\xD8" && substr($buffer, -2) === "\xFF\xD9";
    $isPng = $type === 'image/png' && substr($buffer, 0, 8) === "\x89PNG\r\n\x1A\n";
    $isWebp = $type === 'image/webp' && substr($buffer, 0, 4) === 'RIFF' && substr($buffer, 8, 4) === 'WEBP';
    if (!$isJpeg && !$isPng && !$isWebp) {
        throw new RuntimeException('Файлът не е валидно изображение.');
    }
    $original = pathinfo(basename(acorn_text($input['name'] ?? '')), PATHINFO_FILENAME);
    $safeBase = trim((string) preg_replace('/[^a-z0-9-]+/', '-', strtolower($original)), '-');
    if ($safeBase === '') {
        $safeBase = 'produkt';
    }
    $filename = $safeBase . '-' . time() . '-' . bin2hex(random_bytes(3)) . $extensions[$type];
    if (!is_dir(ACORN_UPLOAD_DIR) && !mkdir(ACORN_UPLOAD_DIR, 0755, true)) {
        throw new RuntimeException('Папката за снимки не може да бъде създадена.');
    }
    if (file_put_contents(ACORN_UPLOAD_DIR . '/' . $filename, $buffer, LOCK_EX) === false) {
        throw new RuntimeException('Снимката не може да бъде записана. Проверете правата на папка images/uploads/.');
    }
    return 'images/uploads/' . $filename;
}
