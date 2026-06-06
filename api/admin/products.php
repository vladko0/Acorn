<?php
require_once dirname(__DIR__) . '/_bootstrap.php';
require_once dirname(__DIR__) . '/_publishing.php';

if (!in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), ['POST', 'PUT'], true)) {
    acorn_error('Неподдържан метод.', 405);
}
acorn_require_admin();
try {
    $previousCatalog = acorn_read_catalog();
    $catalog = acorn_validate_catalog(acorn_read_json());
    acorn_save_catalog($catalog);
    acorn_publish_catalog($catalog, $previousCatalog);
    acorn_json($catalog);
} catch (RuntimeException $error) {
    acorn_error($error->getMessage());
}
