<?php
// php .github/scripts/error_handler_test.php [plugin-dir] — lib.php's error handler copies a warning into FV3's error.log only when one of
// FV3's files raised it; PHP's own log (Unraid's phplog) still gets every warning
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-error-handler-test-' . bin2hex(random_bytes(4));
$docroot = "$fv3tTmp/docroot";

$fv3tFailed = 0;
function check(string $label, bool $ok, $detail = null): void {
    global $fv3tFailed;
    if ($ok) { echo "ok   $label\n"; return; }
    $fv3tFailed++;
    echo "FAIL $label" . ($detail === null ? '' : ' — ' . json_encode($detail, JSON_UNESCAPED_SLASHES)) . "\n";
}

// The plugin copied to where Unraid installs it, so its files' warnings name paths under that folder
@mkdir("$docroot/plugins", 0777, true);
exec('cp -R ' . escapeshellarg($fv3tPlugin) . ' ' . escapeshellarg("$docroot/plugins/folder.view3") . ' 2>&1', $out, $rc);
check('the plugin was copied', $rc === 0 && is_file("$docroot/plugins/folder.view3/server/lib.php"), $out);
// Each warns on its line 2: an FV3 file, Unraid's VM code, and a folder whose name only starts like FV3's
$warns = [
    'fv3-own' => "$docroot/plugins/folder.view3/server/fv3t_warn.php",
    'unraid-own' => "$docroot/plugins/dynamix.vm.manager/include/fv3t_warn.php",
    'name-prefix' => "$docroot/plugins/folder.view3-copy/fv3t_warn.php",
];
// lib.php requires these two Unraid host files at load time
$files = ['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => '<?php class DockerClient {} class DockerUpdate {}'];
foreach ($warns as $key => $path) $files[substr($path, strlen("$docroot/"))] = "<?php\n\$none = []; return \$none[" . var_export($key, true) . "];\n";
foreach ($files as $rel => $src) {
    @mkdir(dirname("$docroot/$rel"), 0777, true);
    file_put_contents("$docroot/$rel", $src);
}

// One request: load lib.php, then run each file
$request = '$_SERVER["DOCUMENT_ROOT"] = ' . var_export($docroot, true) . '; require ' . var_export("$docroot/plugins/folder.view3/server/lib.php", true) . ';'
    . ' $configDir = ' . var_export("$fv3tTmp/config", true) . '; foreach (' . var_export(array_values($warns), true) . ' as $f) include $f;';
$out = [];
exec(escapeshellarg(PHP_BINARY) . ' -d error_reporting=-1 -d display_errors=0 -d log_errors=1 -d error_log=' . escapeshellarg("$fv3tTmp/php.log")
    . ' -r ' . escapeshellarg($request) . ' 2>&1', $out, $rc);
check('the request ran with no output', $rc === 0 && $out === [], ['rc' => $rc, 'out' => $out]);

$logged = @file("$fv3tTmp/config/error.log", FILE_IGNORE_NEW_LINES) ?: [];
check("error.log holds the FV3 file's warning and nothing else",
    count($logged) === 1 && preg_match('/^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\] php-error: Undefined array key "fv3-own" at fv3t_warn\.php:2$/', $logged[0]), $logged);
$phplog = (string)@file_get_contents("$fv3tTmp/php.log");
foreach ($warns as $key => $path) {
    check("PHP's own log still has the $key warning", str_contains($phplog, "PHP Warning:  Undefined array key \"$key\" in $path on line 2"), $phplog);
}

exec('rm -rf ' . escapeshellarg($fv3tTmp));
echo $fv3tFailed ? "\n$fv3tFailed FAILED\n" : "\nall passed\n";
exit($fv3tFailed ? 1 : 0);
