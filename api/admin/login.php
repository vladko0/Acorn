<?php
require_once dirname(__DIR__) . '/_bootstrap.php';

acorn_require_method('POST');
$input = acorn_read_json();
$config = acorn_config();
$storedHash = acorn_text($config['admin_password_sha256'] ?? '');
$inputHash = hash('sha256', trim(acorn_text($input['password'] ?? '')));
if ($storedHash === '' || !hash_equals($storedHash, $inputHash)) {
    acorn_error('Грешна парола.', 401);
}

acorn_start_session();
session_regenerate_id(true);
$_SESSION['is_admin'] = true;
$_SESSION['last_active'] = time();
acorn_json(['authenticated' => true]);
