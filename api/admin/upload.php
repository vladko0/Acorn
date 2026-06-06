<?php
require_once dirname(__DIR__) . '/_bootstrap.php';

acorn_require_method('POST');
acorn_require_admin();
try {
    acorn_json(['path' => acorn_save_image(acorn_read_json())], 201);
} catch (RuntimeException $error) {
    acorn_error($error->getMessage());
}
