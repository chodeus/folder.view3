<?php
// php .github/scripts/page_order_test.php [plugin-dir] — the order syncContainerOrder() writes the autostart file in, and the list
// read_unraid_order.php hands the page. The fixture's order is what docker.js draws; docker_new_folder_order_test.js holds the page to the same file.
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-page-order-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time; this DockerClient answers with the names a case sets
$fv3tDockerClient = <<<'PHP'
<?php
class DockerClient {
    // fv3tDown = an answer that is not a list; fv3tOff = Docker stopped, as Unraid's client answers it: the socket error printed, then []
    function getDockerContainers() { return ($GLOBALS['fv3tDown'] ?? false) ? null : array_map(fn($n) => ['Name' => $n], $this->getDockerJSON('')); }
    // fv3tLabels = container name => its folder.view3 label
    function getDockerJSON($url) {
        if ($GLOBALS['fv3tOff'] ?? false) { echo "Couldn't create socket: [2] No such file or directory"; return []; }
        if ($url === '') return $GLOBALS['fv3tNames'] ?? [];
        if (($GLOBALS['fv3tLabelsDown'] ?? false) || ($GLOBALS['fv3tDown'] ?? false)) return null;
        return array_map(fn($n) => ['Names' => ["/$n"], 'Labels' => array_filter(['folder.view3' => $GLOBALS['fv3tLabels'][$n] ?? null])], $GLOBALS['fv3tNames'] ?? []);
    }
}
class DockerUpdate {}
PHP;
foreach (['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => $fv3tDockerClient] as $rel => $src) {
    @mkdir(dirname("$fv3tTmp/docroot/$rel"), 0777, true);
    file_put_contents("$fv3tTmp/docroot/$rel", $src);
}
$_SERVER['DOCUMENT_ROOT'] = "$fv3tTmp/docroot";
require "$fv3tPlugin/server/lib.php";
// lib.php's own handlers answer JSON and exit 0 — a warning or a crash here must fail the run instead
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity) || ($severity & (E_DEPRECATED | E_USER_DEPRECATED))) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});
set_exception_handler(function (Throwable $e): void {
    fwrite(STDERR, $e . "\n");
    exit(1);
});

$fixture = json_decode(file_get_contents(dirname(__DIR__) . '/fixtures/new-folder-order.json'), true);
// $prefs = the values of userprefs.cfg, $labels = container name => its folder.view3 label
$order = function (array $folders, array $names, array $prefs, array $labels = []): array {
    return fv3_page_order(fv3_compute_folder_membership($folders, $names, $labels, $prefs), $names, $prefs);
};
$folder = fn(string $name, array $containers = [], string $regex = '') => ['name' => $name, 'containers' => $containers, 'regex' => $regex];

// The real readers and the real writer, pointed at a temp copy of Unraid's dockerMan folder and of the autostart file
$configDir = "$fv3tTmp/config";
$fv3DockerManDir = "$fv3tTmp/dockerMan";
$fv3tAutostart = "$fv3tTmp/unraid-autostart";
mkdir($configDir);
mkdir($fv3DockerManDir);
file_put_contents("$fv3DockerManDir/dockerMan.cfg", "autostart-file=\"$fv3tAutostart\"\n");
// userprefs.cfg as Unraid writes it; $cutOff is one caught halfway through a save
$userprefs = fn(array $prefs): string => implode('', array_map(fn($i, $n) => "$i=\"$n\"\n", array_keys($prefs), $prefs));
$cutOff = "0=\"b\"\n1=\"a";
$setPrefs = function (?string $cfg) use ($fv3DockerManDir): void {
    @unlink("$fv3DockerManDir/userprefs.cfg");
    if ($cfg !== null) file_put_contents("$fv3DockerManDir/userprefs.cfg", $cfg);
};
$prefsOf = function (?string $cfg) use ($setPrefs): ?array { $setPrefs($cfg); return fv3_docker_prefs(); };
$listed = function (?array $names, ?string $cfg) use ($setPrefs): array {
    $GLOBALS['fv3tNames'] = $names ?? [];
    $GLOBALS['fv3tDown'] = $names === null;
    $setPrefs($cfg);
    try { return readUnraidOrder('docker'); } finally { $GLOBALS['fv3tDown'] = false; }
};
// What a real syncContainerOrder() answers (null, or why the file could not be put in order) and the autostart file it left. $break
// sets a failure up. null = that file does not exist ($names: an answer that is not a list); a string $autostart is written as is
$sync = function (?array $folders, ?array $names, ?string $cfg, $autostart, ?callable $break = null) use ($setPrefs, $configDir, $fv3tAutostart): array {
    $GLOBALS['fv3tNames'] = $names ?? [];
    $GLOBALS['fv3tDown'] = $names === null;
    $setPrefs($cfg);
    @unlink("$configDir/docker.json");
    @unlink($fv3tAutostart);
    if ($folders !== null) file_put_contents("$configDir/docker.json", json_encode((object)$folders));
    if ($autostart !== null) file_put_contents($fv3tAutostart, is_array($autostart) ? implode("\n", $autostart) . "\n" : $autostart);
    if ($break) $break();
    try {
        $answer = syncContainerOrder('docker');
        if (!file_exists($fv3tAutostart)) return [$answer, null];
        return [$answer, is_array($autostart) ? file($fv3tAutostart, FILE_IGNORE_NEW_LINES) : file_get_contents($fv3tAutostart)];
    } finally {
        @chmod($fv3tAutostart, 0644);
        @unlink("$configDir/autostart.json");
        $GLOBALS['fv3tLabelsDown'] = false;
        $GLOBALS['fv3tDown'] = false;
    }
};
// updateAutostartConfig() as the Autostart tab calls it, with the folder config as given
$autostartSave = function (string $mode, string $foldersJson, array $waits = [], bool $readOnly = false) use ($setPrefs, $configDir, $fv3tAutostart): array {
    $GLOBALS['fv3tNames'] = ['a', 'b'];
    $setPrefs(null);
    file_put_contents("$configDir/docker.json", $foldersJson);
    file_put_contents($fv3tAutostart, "b\na\n");
    if ($readOnly) chmod($fv3tAutostart, 0444);
    try { return updateAutostartConfig($mode, [], $waits); } finally { @chmod($fv3tAutostart, 0644); @unlink("$configDir/autostart.json"); }
};
// syncContainerOrder() with the plugin's config folder gone, as when the flash is not mounted
$syncWithoutConfigDir = function (array $names) use ($sync, $configDir): array {
    try { return $sync([], $names, null, ['b', 'a'], fn() => rename($configDir, "$configDir.gone")); } finally { rename("$configDir.gone", $configDir); }
};
// A shipped endpoint as its own process (it exits, and its require is an absolute Unraid path), on the same temp files.
// $globals feed the DockerClient stub; `swapped` = the require was pointed at this plugin copy
$endpoint = function (string $name, string $method, array $fields, array $globals) use ($fv3tPlugin, $fv3tTmp, $configDir, $fv3DockerManDir): array {
    $copy = "$fv3tTmp/$name";
    file_put_contents($copy, str_replace('require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");',
        'require_once(' . var_export("$fv3tPlugin/server/lib.php", true) . '); $configDir = ' . var_export($configDir, true) . '; $fv3DockerManDir = ' . var_export($fv3DockerManDir, true) . ';',
        file_get_contents("$fv3tPlugin/server/$name"), $swapped));
    $boot = '$_SERVER["DOCUMENT_ROOT"] = ' . var_export("$fv3tTmp/docroot", true) . '; $_SERVER["REQUEST_METHOD"] = ' . var_export($method, true) . '; $_' . $method . ' = ' . var_export($fields, true) . ';'
        . ' foreach (' . var_export($globals, true) . ' as $k => $v) { $GLOBALS[$k] = $v; }'
        . ' register_shutdown_function(function () { fwrite(STDERR, (string)(http_response_code() ?: 200)); });'
        . ' include ' . var_export($copy, true) . ';';
    $proc = proc_open([PHP_BINARY, '-r', $boot], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $body = stream_get_contents($pipes[1]);
    $status = stream_get_contents($pipes[2]);
    proc_close($proc);
    return ['swapped' => $swapped, 'status' => $status, 'body' => json_decode($body, true) ?? $body];
};
$post = function (array $fields, array $names, ?string $cfg, ?string $foldersJson = '{}') use ($setPrefs, $configDir, $fv3tAutostart, $endpoint): array {
    $setPrefs($cfg);
    @unlink("$configDir/docker.json");
    if ($foldersJson !== null) file_put_contents("$configDir/docker.json", $foldersJson);
    file_put_contents($fv3tAutostart, "b\na\n");
    return $endpoint('sync_order.php', 'POST', $fields, ['fv3tNames' => $names]) + ['file' => file($fv3tAutostart, FILE_IGNORE_NEW_LINES)];
};
// A restore through import_all.php, and a FolderView Plus import through import_foreign.php, with userprefs.cfg as given
$restore = function (?string $cfg) use ($setPrefs, $configDir, $endpoint, $folder): array {
    $setPrefs($cfg);
    $bundle = json_encode(['fv3_export_version' => 1, 'docker' => ['xyz' => $folder('Restored', ['a'])]]);
    $r = $endpoint('import_all.php', 'POST', ['bundle' => $bundle], ['fv3tNames' => ['a', 'b']]);
    return [$r['status'], $r['body']['success'] ?? null, $r['body']['restored'] ?? null, $r['body']['warning'] ?? null, isset(json_decode((string)@file_get_contents("$configDir/docker.json"), true)['xyz'])];
};
$foreign = function (?string $cfg) use ($setPrefs, $configDir, $endpoint): array {
    $setPrefs($cfg);
    file_put_contents("$configDir/docker.json", '{}');
    $bundle = file_get_contents(dirname(__DIR__) . '/fixtures/folderview-plus/backup-docker.json');
    $r = $endpoint('import_foreign.php', 'POST', ['bundle' => $bundle, 'type' => 'docker', 'action' => 'apply'], ['fv3tNames' => ['a', 'b']]);
    return [$r['status'], $r['body']['success'] ?? null, $r['body']['warning'] ?? null, count(json_decode((string)@file_get_contents("$configDir/docker.json"), true) ?: []) > 0];
};
$containersOf = fn(array $order): array => array_values(array_filter($order, fn($n) => !str_starts_with($n, 'folder-')));
// What the shipped read_membership.php answers (status, then container => folder name A-Z) with the given userprefs.cfg;
// an overlapping regex and two labels make which folder wins a real contest
$membership = function (?string $cfg) use ($setPrefs, $configDir, $endpoint, $fixture, $folder): array {
    $setPrefs($cfg);
    file_put_contents("$configDir/docker.json", json_encode($fixture['folders'] + ['dup' => $folder('Dup', [], '^(r|y|alpha)')]));
    $r = $endpoint('read_membership.php', 'GET', ['type' => 'docker'], ['fv3tNames' => $fixture['containers'], 'fv3tLabels' => ['mid' => 'Zulu', 's1' => 'Old']]);
    $map = $r['body']['membership'] ?? $r['body'];
    if (is_array($map)) ksort($map);
    return [$r['swapped'], $r['status'], $map];
};
$wait = fn(array $names): array => array_map(fn($n) => $n === 'z1' ? 'z1 30' : $n, $names);

$cases = [
    ['fixture: new folders stack as the page meets them, new containers below them, then the saved order',
        $order($fixture['folders'], $fixture['containers'], $fixture['prefs']), $fixture['autostart']],
    ['new containers sort naturally, case ignored',
        $order([], ['zed', 'app10', 'App2', 'app9', 'Bob', 'alice', 'old'], ['old']), ['alice', 'App2', 'app9', 'app10', 'Bob', 'zed', 'old']],
    ['an empty new folder adds only its placeholder',
        $order(['e' => $folder('Empty')], ['a'], ['a']), ['folder-e', 'a']],
    ['nothing new: the saved order, members before their folder',
        $order(['o' => $folder('Old', ['a'])], ['a', 'b'], ['folder-o', 'a', 'b']), ['a', 'folder-o', 'b']],
    ['a regex member moves up with its new folder, even when userprefs.cfg lists it',
        $order(['n' => $folder('New', [], '^web')], ['db', 'web1'], ['db', 'web1']), ['web1', 'folder-n', 'db']],
    ['names compare as text: 010 is not 10',
        $order(['f' => $folder('F', ['10'])], ['10', '010'], ['folder-f', '10']), ['010', '10', 'folder-f']],
    ['two all-digit names in one folder both stay',
        $order(['f' => $folder('F', ['10', '010'])], ['10', '010'], ['folder-f']), ['10', '010', 'folder-f']],
    ['an all-digit name in one folder does not take its look-alike from another',
        $order(['a' => $folder('A', ['10']), 'b' => $folder('B', ['010'])], ['10', '010'], ['folder-a', 'folder-b']), ['10', 'folder-a', '010', 'folder-b']],
    ['an all-digit container name claimed by label stays with its folder',
        $order(['l' => $folder('Lab')], ['10', 'other'], ['other', 'folder-l'], ['10' => 'Lab']), ['other', '10', 'folder-l']],
    ['a label claim on an all-digit name beats another folder\'s regex',
        $order(['r' => $folder('Rx', [], '^1'), 'l' => $folder('Lab')], ['10'], ['folder-r', 'folder-l'], ['10' => 'Lab']), ['folder-r', '10', 'folder-l']],
    ['a label claim holds for a name that only looks like another folder\'s member',
        $order(['a' => $folder('A', ['10']), 'l' => $folder('Lab')], ['10', '010'], ['folder-a', 'folder-l'], ['010' => 'Lab']), ['10', 'folder-a', '010', 'folder-l']],
    ['a member Docker does not have is dropped, even when a look-alike exists',
        $order(['f' => $folder('F', ['010'])], ['10'], ['folder-f', '10']), ['folder-f', '10']],
    ['a regex takes a name that only looks like another folder\'s member',
        $order(['a' => $folder('A', ['10']), 'b' => $folder('B', [], '^0')], ['10', '010'], ['folder-a', 'folder-b']), ['10', 'folder-a', '010', 'folder-b']],
    ['regex members follow the saved order, not the order Docker lists them in',
        $order(['r' => $folder('Rx', [], '^web')], ['web1', 'web2', 'db'], ['db', 'web2', 'web1', 'folder-r']), ['db', 'web2', 'web1', 'folder-r']],
    ['label members follow the saved order too',
        $order(['l' => $folder('Lab')], ['a', 'b'], ['folder-l', 'b', 'a'], ['a' => 'Lab', 'b' => 'Lab']), ['b', 'a', 'folder-l']],
    ['an unsaved regex member comes after the saved ones',
        $order(['r' => $folder('Rx', [], '^web')], ['web1', 'web2'], ['web2', 'folder-r']), ['web2', 'web1', 'folder-r']],
    ['explicit members keep the editor\'s order, ahead of regex members',
        $order(['f' => $folder('F', ['b', 'a'], '^c')], ['a', 'b', 'c2', 'c1'], ['folder-f', 'c1', 'c2']), ['b', 'a', 'c1', 'c2', 'folder-f']],
    ['no userprefs.cfg: regex members sort naturally, whatever order Docker lists them in',
        $order(['r' => $folder('Rx', [], '^web')], ['web10', 'web2'], []), ['web2', 'web10', 'folder-r']],
    ['a name in userprefs.cfg that Docker no longer has is skipped',
        $order([], ['a'], ['ghost', 'a']), ['a']],
    ['a look-alike of a live name in userprefs.cfg is still skipped',
        $order([], ['10'], ['010', '10']), ['10']],
    ['two look-alike names both keep their saved place',
        $order([], ['10', '010'], ['10', '010']), ['10', '010']],
    ['no userprefs.cfg: folder names and loose containers mixed A-Z',
        $order(['b' => $folder('Beta', ['x'])], ['x', 'alpha', 'zed'], []), ['alpha', 'x', 'folder-b', 'zed']],
    ['no userprefs.cfg: folder names compared as the page shows them, trimmed of spaces, tabs, no-break spaces and the BOM',
        $order(['z' => $folder(' Zulu'), 'm' => $folder("\u{A0}Mike"), 'b' => $folder("\tbeta\u{FEFF}"), 'a' => $folder('Alpha')], ['plex'], []),
        ['folder-a', 'folder-b', 'folder-m', 'plex', 'folder-z']],
    ['no userprefs.cfg: a look-alike of a folder member keeps its own A-Z place',
        $order(['f' => $folder('F', ['10'])], ['10', '1e1', '0first'], []), ['0first', '1e1', '10', 'folder-f']],
    ['read_membership.php: an explicit entry beats a label (s1), a label places a loose container (mid), the first folder whose regex matches wins (r1, y1)',
        $membership(null), [1, '200', ['alpha' => 'Dup', 'mid' => 'Zulu', 'n1' => 'Numbers', 'o1' => 'Old', 'r1' => 'Rex', 'r2' => 'Rex', 's1' => 'Seven', 'y1' => 'Yankee', 'y2' => 'Yankee', 'z1' => 'Zulu', 'z2' => 'Zulu']]],
    ['and its answer does not depend on userprefs.cfg: the saved order, a reversed one, a file cut off mid-save',
        [$membership($userprefs($fixture['prefs'])), $membership($userprefs(array_reverse($fixture['containers']))), $membership($cutOff)],
        array_fill(0, 3, $membership(null))],
    ['autostart lines follow the order and keep their wait value',
        fv3_reorder_autostart(['a 5', 'b', 'c 10'], ['c', 'folder-f', 'a', 'a']), ['c 10', 'a 5', 'b']],
    ['a line the order does not name stays after the others, in file order',
        fv3_reorder_autostart(['x', 'a', 'y'], ['a']), ['a', 'x', 'y']],
    ['look-alike names in the file stay apart',
        fv3_reorder_autostart(['10 2', '010'], ['010', '10']), ['010', '10 2']],
    ['an order that names nothing in the file changes nothing',
        fv3_reorder_autostart(['a', 'b'], ['z']), ['a', 'b']],
    ['no userprefs.cfg reads as nothing saved', $prefsOf(null), []],
    ['userprefs.cfg values come back in file order', $prefsOf($userprefs(['b', 'folder-x', '010', 'a'])), ['b', 'folder-x', '010', 'a']],
    ['userprefs.cfg values come back by the number before each =, as Unraid\'s page sorts them, whatever the line order',
        $prefsOf("2=\"c\"\n0=\"a\"\n10=\"d\"\n1=\"b\"\n"), ['a', 'b', 'c', 'd']],
    ['a userprefs.cfg holding a list line (n[]=) is not read as an order', $prefsOf("0=\"a\"\n1[]=\"b\"\n"), null],
    ['a userprefs.cfg cut off mid-line is not "nothing saved"', $prefsOf($cutOff), null],
    ['an empty userprefs.cfg reads as nothing saved', $prefsOf(''), []],
    ['read_unraid_order.php lists the fixture as the page test is fed it',
        $listed($fixture['containers'], $userprefs($fixture['prefs'])), $fixture['listed']],
    ['read_unraid_order.php: no userprefs.cfg lists naturally, case ignored',
        $listed(['web10', 'Web2', 'alpha'], null), ['alpha', 'Web2', 'web10']],
    ['read_unraid_order.php: a cut-off userprefs.cfg lists as an absent one does',
        $listed(['b', 'a'], $cutOff), ['a', 'b']],
    ['read_unraid_order.php: look-alike names keep their own saved places',
        $listed(['10', '010'], $userprefs(['010', '10'])), ['010', '10']],
    ['read_unraid_order.php: a saved look-alike of a live name is not listed',
        $listed(['10'], $userprefs(['010'])), ['10']],
    ['read_unraid_order.php: an unsaved look-alike of a saved name is still listed',
        $listed(['10', '010'], $userprefs(['010'])), ['010', '10']],
    ['syncContainerOrder writes the fixture\'s order to the file, each line once, wait values kept',
        $sync($fixture['folders'], $fixture['containers'], $userprefs($fixture['prefs']), $wait($fixture['containers'])), [null, $wait($containersOf($fixture['autostart']))]],
    ['a container that does not autostart stays out, a removed one\'s line goes',
        $sync($fixture['folders'], $fixture['containers'], $userprefs($fixture['prefs']), ['ghost', 'alpha', 'z2']), [null, ['z2', 'alpha']]],
    ['no userprefs.cfg writes A-Z',
        $sync([], ['b', 'a', 'c'], null, ['c', 'b 5', 'a']), [null, ['a', 'b 5', 'c']]],
    ['a file already in order is not written again',
        $sync([], ['a', 'b'], null, "a\nb"), [null, "a\nb"]],
    ['a cut-off userprefs.cfg leaves the file as it is and is reported',
        $sync([], ['b', 'a', 'c'], $cutOff, ['c', 'ghost', 'b 5', 'a']), ["Unraid's saved Docker order (userprefs.cfg) could not be read", ['c', 'ghost', 'b 5', 'a']]],
    ['an empty userprefs.cfg writes A-Z, as no userprefs.cfg does',
        $sync([], ['b', 'a', 'c'], '', ['c', 'b 5', 'a']), [null, ['a', 'b 5', 'c']]],
    ['no containers, or Docker not running (Unraid\'s client answers an empty list): nothing is written, nothing is reported',
        $sync([], [], null, ['b', 'a']), [null, ['b', 'a']]],
    ['a container list with an unnamed entry: nothing is written, and it is reported',
        $sync([], ['a', ''], null, ['b', 'a']), ["Docker's container list could not be read", ['b', 'a']]],
    ['a failed label read: nothing is written, and it is reported',
        $sync([], ['a', 'b'], null, ['b', 'a'], function () { $GLOBALS['fv3tLabelsDown'] = true; }), ['the container labels could not be read', ['b', 'a']]],
    ['custom mode does not read the folder config, so a damaged one does not stop it',
        $sync([], ['a', 'b'], null, ['b', 'a'], function () use ($configDir) {
            file_put_contents("$configDir/docker.json", '{');
            file_put_contents("$configDir/autostart.json", '{"mode":"custom","sequence":["a","b"]}');
        }), [null, ['a', 'b']]],
    ['a missing plugin config folder (deleted by hand under an open tab) is "no folders", not a failure: the sync runs and reports nothing',
        [$syncWithoutConfigDir(['b', 'a']), $syncWithoutConfigDir([]), is_dir($configDir)], [[null, ['a', 'b']], [null, ['b', 'a']], true]],
    ['a damaged folder config is reported',
        $sync([], ['a', 'b'], null, ['b', 'a'], fn() => file_put_contents("$configDir/docker.json", '{')), ['the folder config could not be read', ['b', 'a']]],
    ['autostart mode off reads nothing and reports nothing',
        $sync([], ['a', 'b'], $cutOff, ['b', 'a'], fn() => file_put_contents("$configDir/autostart.json", '{"mode":"off"}')), [null, ['b', 'a']]],
    ['custom mode writes its saved sequence, the rest after it in file order',
        $sync([], ['a', 'b', 'c'], null, ['b 5', 'a', 'ghost', 'c'], fn() => file_put_contents("$configDir/autostart.json", '{"mode":"custom","sequence":["c","a"]}')), [null, ['c', 'a', 'b 5']]],
    ['custom mode: a file already in its sequence is not written again',
        $sync([], ['a', 'b'], null, "b\na", fn() => file_put_contents("$configDir/autostart.json", '{"mode":"custom","sequence":["b","a"]}')), [null, "b\na"]],
    // New setups: no containers, no VMs, nothing set to autostart, nothing saved yet
    ['a fresh install with no containers: nothing is reported and no file is created',
        [$sync(null, [], null, null), file_exists("$configDir/docker.json"), file_exists("$configDir/order-docker.json"), file_exists("$fv3DockerManDir/userprefs.cfg")], [[null, null], false, false, false]],
    ['containers but nothing set to autostart: the autostart file is not created',
        $sync(null, ['b', 'a'], null, null), [null, null]],
    ['an empty autostart file stays empty',
        $sync([], ['b', 'a'], null, ''), [null, '']],
    ['no containers and a damaged folder config: still nothing to report',
        $sync([], [], null, ['b', 'a'], fn() => file_put_contents("$configDir/docker.json", '{')), [null, ['b', 'a']]],
    ['the Autostart tab\'s save: saved either way, with a warning when the order could not be applied',
        [$autostartSave('folder', '{'), $autostartSave('folder', '{}'), $autostartSave('off', '{')],
        [['success' => true, 'mode' => 'folder', 'sequence' => [], 'warning' => 'the folder config could not be read'],
         ['success' => true, 'mode' => 'folder', 'sequence' => []], ['success' => true, 'mode' => 'off', 'sequence' => []]]],
    ['folders saved but Docker has no containers: the file is left as it is',
        $sync(['f' => $folder('F', ['gone'], '^x')], [], $userprefs(['folder-f', 'gone']), ['gone 5']), [null, ['gone 5']]],
    ['an answer from Docker that is not a list: the file is left as it is, and it is reported',
        $sync([], null, null, ['b', 'a']), ["Docker's container list could not be read", ['b', 'a']]],
    ['custom mode with nothing set to autostart: no file is created',
        $sync([], ['a'], null, null, fn() => file_put_contents("$configDir/autostart.json", '{"mode":"custom","sequence":["a"]}')), [null, null]],
    ['custom mode with an empty autostart file and no saved sequence: the file stays empty',
        $sync([], ['a'], null, '', fn() => file_put_contents("$configDir/autostart.json", '{"mode":"custom"}')), [null, '']],
    ['the page\'s order list is empty with no containers, and with an answer that is not a list',
        [$listed([], null), $listed([], $userprefs(['folder-f', 'gone'])), $listed(null, null)], [[], [], []]],
    ['no folders and no containers work out to an empty order',
        [$order([], [], []), $order([], [], ['ghost']), fv3_reorder_autostart([], ['a']), fv3_reorder_autostart([], [])], [[], [], [], []]],
    ['VMs: no order to sync, and no order list when the VM service is not there',
        [syncContainerOrder('vm'), readUnraidOrder('vm')], [null, []]],
    ['sync_order.php answers 200 and success on a fresh install',
        (function () use ($post, $configDir, $fv3tAutostart) { $r = $post(['type' => 'docker'], [], null, null); return [$r['status'], $r['body'], file_exists("$configDir/docker.json")]; })(), ['200', ['success' => true], false]],
    ['sync_order.php answers 200 and success when the sync went through',
        $post(['type' => 'docker'], ['b', 'a'], null), ['swapped' => 1, 'status' => '200', 'body' => ['success' => true], 'file' => ['a', 'b']]],
    ['Import Everything restores either way, and says so when the start order could not then be updated',
        [$restore(null), $restore($cutOff)],
        [['200', true, ['docker.json'], null, true], ['200', true, ['docker.json'], "Unraid's saved Docker order (userprefs.cfg) could not be read", true]]],
    ['a FolderView Plus import does the same',
        [$foreign(null), $foreign($cutOff)], [['200', true, null, true], ['200', true, "Unraid's saved Docker order (userprefs.cfg) could not be read", true]]],
    ['sync_order.php answers 503 with the reason when a read the sync needs failed',
        [$post(['type' => 'docker'], ['a', 'b'], null, '{'), $post(['type' => 'docker'], ['a', 'b'], $cutOff), $post(['type' => 'docker'], ['a', ''], null)],
        [['swapped' => 1, 'status' => '503', 'body' => ['error' => 'the folder config could not be read'], 'file' => ['b', 'a']],
         ['swapped' => 1, 'status' => '503', 'body' => ['error' => "Unraid's saved Docker order (userprefs.cfg) could not be read"], 'file' => ['b', 'a']],
         ['swapped' => 1, 'status' => '503', 'body' => ['error' => "Docker's container list could not be read"], 'file' => ['b', 'a']]]],
];
if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
    $cases[] = ['an autostart file that cannot be written is reported',
        $sync([], ['a', 'b'], null, ['b', 'a'], fn() => chmod($fv3tAutostart, 0444)), ['the autostart file could not be written', ['b', 'a']]];
    $cases[] = ['the Autostart tab\'s save: a wait edit that cannot be written is a warning, in Off mode too, ahead of the sync\'s own reason',
        [$autostartSave('off', '{}', ['a' => 30], true), $autostartSave('folder', '{}', ['a' => 30], true), $autostartSave('off', '{}', ['a' => 30]), file($fv3tAutostart, FILE_IGNORE_NEW_LINES)],
        [['success' => true, 'mode' => 'off', 'sequence' => [], 'warning' => 'the wait edits could not be written to the autostart file'],
         ['success' => true, 'mode' => 'folder', 'sequence' => [], 'warning' => 'the wait edits could not be written to the autostart file; the autostart file could not be written'],
         ['success' => true, 'mode' => 'off', 'sequence' => []], ['b', 'a 30']]];
    $cases[] = ['custom mode reports it too',
        $sync([], ['a', 'b'], null, ['b', 'a'], function () use ($configDir, $fv3tAutostart) { file_put_contents("$configDir/autostart.json", '{"mode":"custom","sequence":["a","b"]}'); chmod($fv3tAutostart, 0444); }), ['the autostart file could not be written', ['b', 'a']]];
}
// No saved order: names sort as the Docker page sorts them in the browser (fv3_name_cmp, held to the browser by name_order_test.js)
$cases[] = ['no saved order: the page order sorts names as the browser does, punctuation first, then numbers, then letters',
    $order(['p' => $folder('_Pinned'), 'a' => $folder('Apps'), 'b' => $folder('[Box]'), 'n' => $folder('2 Two')], ['zed', '-cli'], []), ['folder-p', '-cli', 'folder-b', 'folder-n', 'folder-a', 'zed']];

// Imports keep the order in the file: with no saved Docker order the import creates one, the new folders first in the file's order,
// the rest as the page draws it (A-Z); a saved order gets the new folders on top, the rest as it was. Each through the shipped endpoint
$savedNow = fn(): ?string => is_file("$fv3DockerManDir/userprefs.cfg") ? file_get_contents("$fv3DockerManDir/userprefs.cfg") : null;
$placeholderNames = function (array $prefs) use ($configDir): array {
    $map = json_decode((string)file_get_contents("$configDir/docker.json"), true);
    return array_map(fn($e) => str_starts_with($e, 'folder-') ? ($map[substr($e, 7)]['name'] ?? $e) : $e, $prefs);
};
$plusBundle = file_get_contents(dirname(__DIR__) . '/fixtures/folderview-plus/backup-docker.json');
$plusOrder = array_column(fv3_convert_foreign_bundle(json_decode($plusBundle, true), 'docker')['folders']['docker'], 'name');
$importPlus = function (?string $cfg) use ($setPrefs, $configDir, $endpoint, $plusBundle, $savedNow): array {
    $setPrefs($cfg);
    file_put_contents("$configDir/docker.json", '{}');
    @unlink("$configDir/order-docker.json");
    $r = $endpoint('import_foreign.php', 'POST', ['bundle' => $plusBundle, 'type' => 'docker', 'action' => 'apply'], ['fv3tNames' => ['zed', 'alpha']]);
    return [$r['status'], $r['body']['success'] ?? null, $r['body']['order_warning'] ?? null, $r['body']['placed'] ?? 'not sent', $savedNow()];
};
[$st, $ok, $warn, $placed, $created] = $importPlus(null);
$createdPrefs = fv3_docker_prefs();
$cases[] = ['FolderView Plus import, no saved order: one is created, its folders first in its order, then the containers A-Z',
    [$st, $ok, $warn, $placed, $placeholderNames($createdPrefs)], ['200', true, null, 'not sent', array_merge($plusOrder, ['alpha', 'zed'])]];
$cases[] = ['FolderView Plus import, no saved order: the page draws its folders from the created order in its order',
    array_values(array_filter($placeholderNames($order(json_decode(file_get_contents("$configDir/docker.json"), true), ['zed', 'alpha'], $createdPrefs)), fn($n) => !in_array($n, ['zed', 'alpha'], true))),
    $plusOrder];
$cases[] = ['FolderView Plus import, no saved order: FV3 keeps its own copy of the created order',
    json_decode((string)@file_get_contents("$configDir/order-docker.json"), true)['entries'] ?? null, $createdPrefs];
$keep = $userprefs(['alpha', 'zed']);
$plusKept = array_slice($importPlus($keep), 1, 3);
$cases[] = ['FolderView Plus import, a saved order: its folders go on top in its order, the saved entries after them as they were, and FV3 keeps a copy',
    [$plusKept, $placeholderNames(fv3_docker_prefs()), json_decode((string)@file_get_contents("$configDir/order-docker.json"), true)['entries'] ?? null],
    [[true, null, 'not sent'], array_merge($plusOrder, ['alpha', 'zed']), fv3_docker_prefs()]];

$restoreOrder = function (?string $cfg, bool $dockerOff = false) use ($setPrefs, $configDir, $endpoint, $folder, $savedNow): array {
    $setPrefs($cfg);
    @unlink("$configDir/order-docker.json");
    $bundle = json_encode(['fv3_export_version' => 1, 'docker' => ['x1' => $folder('One', ['a']), 'x2' => $folder('Two')],
        'order_docker' => ['fv3_order_version' => 1, 'entries' => ['b', 'folder-x2', 'a', 'folder-x1']]]);
    $r = $endpoint('import_all.php', 'POST', ['bundle' => $bundle], ['fv3tNames' => ['a', 'b', 'c'], 'fv3tOff' => $dockerOff]);
    return [$r['status'], $r['body']['success'] ?? null, $r['body']['order_warning'] ?? null, $savedNow()];
};
$cases[] = ['restore with its order copy, no saved order: one is created from the copy, then the rest as the page draws it',
    $restoreOrder(null), ['200', true, null, $userprefs(['b', 'folder-x2', 'a', 'folder-x1', 'c'])]];
$cases[] = ['restore with its order copy, a saved order: it is left exactly as it was', $restoreOrder($keep), ['200', true, null, $keep]];
$cases[] = ['restore with its order copy, a saved order and Docker stopped: left as it was, and no order warning (there was nothing to create)',
    $restoreOrder($keep, true), ['200', true, null, $keep]];

// FV3's own folder import: the new folders (ids, in the file's order) after they are saved
$importOrder = function (?string $cfg, $ids, ?array $names, string $foldersJson = '') use ($setPrefs, $configDir, $endpoint, $folder, $savedNow): array {
    $setPrefs($cfg);
    @unlink("$configDir/order-docker.json");
    @unlink("$configDir/docker.json");
    $json = $foldersJson !== '' ? $foldersJson : json_encode(['old' => $folder('Old', ['a']), 'n1' => $folder('New one', ['b']), 'n2' => $folder('New two')]);
    if ($json !== 'none') file_put_contents("$configDir/docker.json", $json);
    // $names null: Docker stopped
    $r = $endpoint('import_order.php', 'POST', ['ids' => is_string($ids) ? $ids : json_encode($ids)], ['fv3tNames' => $names ?? [], 'fv3tOff' => $names === null]);
    return [$r['status'], $r['body']['success'] ?? $r['body']['error'] ?? null, $r['body']['order_warning'] ?? null, $r['body']['warning'] ?? null, $savedNow()];
};
$cases[] = ['folder import, no saved order: the new folders first in the file\'s order, each after its members, then the rest A-Z',
    $importOrder(null, ['n2', 'n1'], ['a', 'b', 'c']), ['200', true, null, null, $userprefs(['folder-n2', 'b', 'folder-n1', 'c', 'a', 'folder-old'])]];
$cases[] = ['folder import, a saved order: the new folders go on top in the file\'s order, the saved entries after them as they were',
    $importOrder($keep, ['n2', 'n1'], ['a', 'b', 'c']), ['200', true, null, null, $userprefs(['folder-n2', 'folder-n1', 'alpha', 'zed'])]];
$cases[] = ['folder import, a saved order that already places one of them: that one keeps its place, an id with no folder is not written',
    $importOrder($userprefs(['alpha', 'folder-n1', 'zed']), ['n2', 'n1', 'ghost'], ['a', 'b', 'c']), ['200', true, null, null, $userprefs(['folder-n2', 'alpha', 'folder-n1', 'zed'])]];
$cases[] = ['folder import, a saved order holding a list line: said, and left as it was',
    $importOrder("0=\"a\"\n1[]=\"b\"\n", ['n1'], ['a', 'b']), ['200', true, "Unraid's saved Docker order (userprefs.cfg) could not be read", "Unraid's saved Docker order (userprefs.cfg) could not be read", "0=\"a\"\n1[]=\"b\"\n"]];
$cases[] = ['folder import, a saved order and a folder config that will not parse: said, and the order left as it was',
    $importOrder($keep, ['n1'], ['a', 'b'], '{'), ['200', true, 'the folder config could not be read', 'the folder config could not be read', $keep]];
$cases[] = ['folder import, a saved order that will not parse: said, and left as it was',
    $importOrder($cutOff, ['n1'], ['a', 'b']), ['200', true, "Unraid's saved Docker order (userprefs.cfg) could not be read", "Unraid's saved Docker order (userprefs.cfg) could not be read", $cutOff]];
$cases[] = ['folder import, a saved order and Docker stopped: placed all the same (Docker is not needed for it), quiet, and the answer is still JSON',
    $importOrder($keep, ['n1'], null), ['200', true, null, null, $userprefs(['folder-n1', 'alpha', 'zed'])]];
$cases[] = ['folder import, no saved order and Docker stopped: said, and nothing written',
    $importOrder(null, ['n1'], null), ['200', true, 'Docker is not running or lists no containers', null, null]];
$cases[] = ['folder import, no saved order and a container with no name in Docker\'s list: said, and nothing written',
    $importOrder(null, ['n1'], ['a', '']), ['200', true, "Docker's container list could not be read", "Docker's container list could not be read", null]];
$cases[] = ['folder import, ids that are not a list of folder ids: refused, nothing written',
    [$importOrder(null, '{"a":"n1"}', ['a'])[0], $importOrder(null, ['../x'], ['a'])[0], $importOrder(null, 'nope', ['a'])[0], $savedNow()], ['400', '400', '400', null]];
// Nothing installed: no containers, no folders, no saved order
$cases[] = ['folder import, Docker running with no containers: said, nothing written', $importOrder(null, ['n1'], []), ['200', true, 'Docker is not running or lists no containers', null, null]];
$cases[] = ['folder import, no folder config and no new folders: quiet, nothing written', $importOrder(null, [], ['a'], 'none'), ['200', true, null, null, null]];
@unlink("$configDir/order-docker.json");
file_put_contents("$configDir/docker.json", '{}');
foreach (['import_order.php', 'import_foreign.php', 'import_all.php'] as $copy) @unlink("$fv3tTmp/$copy");

$failed = 0;
foreach ($cases as [$label, $got, $want]) {
    if ($got !== $want) { $failed++; echo "FAIL $label: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; }
}
$setPrefs(null);
array_map('unlink', ["$fv3tTmp/docroot/webGui/include/Helpers.php", "$fv3tTmp/docroot/plugins/dynamix.docker.manager/include/DockerClient.php",
    "$configDir/docker.json", "$fv3DockerManDir/dockerMan.cfg", $fv3tAutostart, "$fv3tTmp/sync_order.php", "$fv3tTmp/read_membership.php"]);
echo count($cases) . " cases, $failed failed\n";
exit($failed ? 1 : 0);
