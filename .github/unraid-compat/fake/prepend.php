<?php
// auto_prepend_file of the PHP processes here, where Unraid's php.ini names local_prepend.php: the php-libvirt stand-in, then
// Unraid's own prepend. The php -S router does both itself, once it has set the script the request is for.
require_once __DIR__ . '/libvirt.php';
if (PHP_SAPI !== 'cli-server') require_once '/usr/local/emhttp/webGui/include/local_prepend.php';
