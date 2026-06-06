<?php
require_once __DIR__ . '/_bootstrap.php';

acorn_require_method('GET');
acorn_json(acorn_read_catalog());
