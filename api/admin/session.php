<?php
require_once dirname(__DIR__) . '/_bootstrap.php';

acorn_require_method('GET');
if (!acorn_is_admin()) {
    acorn_json(['authenticated' => false], 401);
}
acorn_json(['authenticated' => true]);
