<?php
require_once dirname(__DIR__) . '/_bootstrap.php';

acorn_require_method('POST');
acorn_start_session();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
}
session_destroy();
acorn_json(['authenticated' => false]);
