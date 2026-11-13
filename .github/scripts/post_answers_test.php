<?php
// php .github/scripts/post_answers_test.php [plugin-dir] — every POST endpoint, run as its own process on four states of the config folder,
// answers JSON when it succeeds and never after a write that failed: langs/script.php reads any other success as a POST Unraid dropped
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-post-answers-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time
$fv3tDockerClient = <<<'PHP'
<?php
class DockerClient {
    function getDockerContainers() { return [['Name' => 'app-a'], ['Name' => 'app-b']]; }
    function getDockerJSON($url) { return [['Names' => ['/app-a'], 'Labels' => []], ['Names' => ['/app-b'], 'Labels' => []]]; }
}
class DockerUpdate {}
PHP;
foreach (['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => $fv3tDockerClient] as $rel => $src) {
    @mkdir(dirname("$fv3tTmp/docroot/$rel"), 0777, true);
    file_put_contents("$fv3tTmp/docroot/$rel", $src);
}
$configDir = "$fv3tTmp/config";
$dockerManDir = "$fv3tTmp/dockerMan";
// Everything under one of this test's own temp folders, the folder included
$wipe = function (string $dir) use ($fv3tTmp): void {
    if (!str_starts_with($dir, "$fv3tTmp/") || !is_dir($dir)) return;
    $items = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($items as $item) { $item->isDir() && !$item->isLink() ? rmdir($item->getPathname()) : unlink($item->getPathname()); }
    rmdir($dir);
};

$folder = json_encode(['name' => 'Media', 'icon' => '', 'regex' => '', 'containers' => ['app-a'], 'settings' => new stdClass(), 'actions' => []]);
$themes = ['styles/demo.css' => 'a{}', 'styles/old.css' => 'b{}'];
// The config folder before each request: file => contents, or null for no config folder at all (the flash is not mounted)
$setups = [
    'a fresh install' => [],
    'a saved setup' => ['docker.json' => "{\"abc\":$folder}", 'vm.json' => '{}', 'settings.json' => '{}'] + $themes,
    'config files cut off mid-write' => ['docker.json' => '{', 'vm.json' => '{', 'settings.json' => '{', 'autostart.json' => '{', 'css-config.json' => '{'] + $themes,
    'no config folder' => null,
];
$prepare = function (?array $files) use ($configDir, $dockerManDir, $fv3tTmp, $wipe): void {
    $wipe($configDir);
    $wipe($dockerManDir);
    mkdir($dockerManDir);
    file_put_contents("$dockerManDir/dockerMan.cfg", "autostart-file=\"$fv3tTmp/unraid-autostart\"\n");
    file_put_contents("$fv3tTmp/unraid-autostart", "app-b\napp-a\n");
    foreach ($files ?? [] as $rel => $contents) {
        @mkdir(dirname("$configDir/$rel"), 0777, true);
        file_put_contents("$configDir/$rel", $contents);
    }
    if ($files === []) mkdir($configDir);
};
// One POST to a shipped endpoint as its own process (it exits, and its require is an absolute Unraid path): [status, body]
$post = function (string $name, array $fields) use ($fv3tPlugin, $fv3tTmp, $configDir, $dockerManDir): array {
    $copy = "$fv3tTmp/$name";
    file_put_contents($copy, str_replace('require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");',
        'require_once(' . var_export("$fv3tPlugin/server/lib.php", true) . '); $configDir = ' . var_export($configDir, true) . '; $fv3DockerManDir = ' . var_export($dockerManDir, true) . ';',
        file_get_contents("$fv3tPlugin/server/$name"), $swapped));
    if ($swapped !== 1) throw new RuntimeException("$name: the lib.php require was not found");
    $boot = '$_SERVER["DOCUMENT_ROOT"] = ' . var_export("$fv3tTmp/docroot", true) . '; $_SERVER["REQUEST_METHOD"] = "POST"; $_POST = ' . var_export($fields, true) . ';'
        . ' register_shutdown_function(function () { fwrite(STDERR, (string)(http_response_code() ?: 200)); });'
        . ' include ' . var_export($copy, true) . ';';
    $proc = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-r', $boot], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $body = stream_get_contents($pipes[1]);
    $status = stream_get_contents($pipes[2]);
    proc_close($proc);
    return [$status, $body];
};

// A request that goes through on a saved setup, per endpoint. The first nine answered nothing before fv3_ok()
$silent = ['create.php', 'update.php', 'delete.php', 'update_ids.php', 'update_settings.php', 'update_css_config.php', 'toggle_theme.php', 'delete_theme.php', 'sync_order.php'];
$requests = [
    'create.php' => ['type' => 'docker', 'content' => $folder],
    'update.php' => ['type' => 'docker', 'content' => $folder, 'id' => 'abc'],
    'delete.php' => ['type' => 'docker', 'id' => 'abc'],
    'update_ids.php' => ['type' => 'docker', 'data' => '{}'],
    'apply_defaults.php' => ['type' => 'docker', 'settings' => '{"preview":2}'],
    'update_settings.php' => ['key' => 'dashboard_docker_layout', 'value' => 'classic'],
    'update_css_config.php' => ['config' => '{}'],
    'toggle_theme.php' => ['entry' => 'demo.css', 'enable' => 'false'],
    'delete_theme.php' => ['entry' => 'old.css'],
    'sync_order.php' => ['type' => 'docker'],
    'import_order.php' => ['ids' => '["abc"]'],
    'update_settings_batch.php' => ['settings' => '{"dashboard_docker_layout":"classic"}'],
    'update_order.php' => ['type' => 'docker', 'names' => 'app-a;folder-abc'],
    'update_organizer_registry.php' => ['folders' => '[]'],
    'update_autostart.php' => ['mode' => 'folder', 'sequence' => '[]', 'waits' => '{}'],
    'import_all.php' => ['bundle' => '{"fv3_export_version":1}'],
    'import_foreign.php' => ['bundle' => '{}', 'type' => 'docker', 'action' => 'preview'],
    'import_theme.php' => ['repo' => 'not a repo'],
];

$failed = 0;
$check = function (string $label, bool $ok, $detail = null) use (&$failed): void {
    if ($ok) { echo "ok   $label\n"; return; }
    $failed++;
    echo "FAIL $label" . ($detail === null ? '' : ' — ' . json_encode($detail)) . "\n";
};

$shipped = [];
foreach (glob("$fv3tPlugin/server/*.php") as $file) {
    if (basename($file) !== 'lib.php' && str_contains(file_get_contents($file), 'fv3_post_init();')) $shipped[] = basename($file);
}
$listed = array_keys($requests);
sort($shipped);
sort($listed);
$check('every endpoint that takes a POST is in this test', $shipped === $listed, ['shipped' => $shipped, 'tested' => $listed]);

$empty = [];
$answers = [];
$successes = 0;
foreach ($setups as $setup => $files) {
    foreach ($requests as $name => $fields) {
        // the request as the pages send it, with no fields, with each field as an array (x[]=), and for VMs where it has a type
        $variants = ['as sent' => $fields, 'no fields' => [], 'array fields' => array_map(fn($v) => [$v], $fields)];
        if (isset($fields['type'])) $variants['for VMs'] = ['type' => 'vm'] + $fields;
        foreach ($variants as $variant => $sent) {
            $prepare($files);
            [$status, $body] = $post($name, $sent);
            $answers["$setup | $name | $variant"] = [$status, $body];
            if ($status[0] === '2') { $successes++; if (json_decode($body) === null && trim($body) !== 'null') $empty[] = "$setup | $name | $variant: " . substr($body, 0, 60); }
        }
    }
}
$check(count($answers) . " requests, $successes of them a success: every one of those answered JSON", $successes > 60 && $empty === [], $empty);
// the command line keeps no response headers, so the header itself is held to the source
$init = (string)preg_replace('/^.*?function fv3_post_init\(\): void \{(.*?)\n    \}.*$/s', '$1', file_get_contents("$fv3tPlugin/server/lib.php"));
$check('fv3_post_init() sends the X-FV3-Answer header script.php looks for', str_contains($init, "header('X-FV3-Answer: 1');")
    && str_contains(file_get_contents("$fv3tPlugin/langs/script.php"), "getResponseHeader('X-FV3-Answer')"), $init);
$wrong = [];
foreach (['a saved setup' => $silent, 'a fresh install' => array_diff($silent, ['toggle_theme.php', 'delete_theme.php'])] as $setup => $names) {
    foreach ($names as $name) {
        if ($answers["$setup | $name | as sent"] !== ['200', '{"success":true}']) $wrong["$setup | $name"] = $answers["$setup | $name | as sent"];
    }
}
$check('the nine endpoints that used to answer nothing answer {"success":true} when the save goes through', $wrong === [], $wrong);
$check('a theme that is not there is still a 404, not a success', [$answers['a fresh install | toggle_theme.php | as sent'][0], $answers['a fresh install | delete_theme.php | as sent'][0]] === ['404', '404'],
    [$answers['a fresh install | toggle_theme.php | as sent'], $answers['a fresh install | delete_theme.php | as sent']]);

// A write that fails must not be followed by fv3_ok(): the folder config made read-only, in a read-only folder. The lock
// file is there from an earlier save, so the lock is taken and the write is what fails (folder_lock_test.php has the other case)
if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
    $refused = [];
    foreach (['create.php', 'update.php', 'delete.php'] as $name) {
        $prepare($setups['a saved setup']);
        $before = file_get_contents("$configDir/docker.json");
        touch("$configDir/docker.json.lock");
        chmod("$configDir/docker.json", 0444);
        chmod($configDir, 0555);
        [$status, $body] = $post($name, $requests[$name]);
        chmod($configDir, 0777);
        chmod("$configDir/docker.json", 0666);
        $refused[$name] = [$status, json_decode($body, true)['error'] ?? $body, file_get_contents("$configDir/docker.json") === $before];
    }
    $want = ['500', 'Could not write docker.json — nothing was saved', true];
    $check('a folder save, update or delete that cannot be written answers 500 with the reason and leaves the file as it was',
        $refused === ['create.php' => $want, 'update.php' => $want, 'delete.php' => $want], $refused);
}

$wipe("$fv3tTmp/config");
$wipe("$fv3tTmp/dockerMan");
$wipe("$fv3tTmp/docroot");
array_map('unlink', glob("$fv3tTmp/*"));
rmdir($fv3tTmp);
echo $failed ? "\n$failed FAILED\n" : "\nall passed\n";
exit($failed ? 1 : 0);
