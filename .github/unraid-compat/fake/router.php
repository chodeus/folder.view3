<?php
// php -S router doing what Unraid's nginx does (rc.nginx build_locations): a file as it is, a .php file after Unraid's
// local_prepend.php, a path starting with a capital letter to webGui/template.php; a dot path or anything else is a 404.
$_SERVER['DOCUMENT_ROOT'] = '/usr/local/emhttp';
$fv3rScript = (function (string $root): ?string {
    $path = (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if (str_contains($path, '/.')) return null;
    if (is_file($root . $path)) return str_ends_with($path, '.php') ? $path : '';
    return preg_match('#^/[A-Z]#', $path) ? '/webGui/template.php' : null;
})($_SERVER['DOCUMENT_ROOT']);
if ($fv3rScript === '') return false;
if ($fv3rScript === null) { http_response_code(404); return true; }
$_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = $fv3rScript;
$_SERVER['SCRIPT_FILENAME'] = $_SERVER['DOCUMENT_ROOT'] . $fv3rScript;
unset($fv3rScript);
// PHP 8.3's php -S skips auto_prepend_file for the router, so the prepend's work is done here
require_once __DIR__ . '/libvirt.php';
require '/usr/local/emhttp/webGui/include/local_prepend.php';
require $_SERVER['SCRIPT_FILENAME'];
