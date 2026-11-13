<?php
// php .github/scripts/folder_lock_test.php [plugin-dir] — every writer of docker.json / vm.json reads and writes under the file's lock, and
// Apply defaults and the id update send changes, not copies (a folder editor still saves its whole folder). Each request is its own process
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-folder-lock-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time
$fv3tDockerClient = <<<'PHP'
<?php
class DockerClient {
    function getDockerContainers() { return [['Name' => 'app-a'], ['Name' => 'app-new']]; }
    function getDockerJSON($url) { return [['Names' => ['/app-a'], 'Labels' => []], ['Names' => ['/app-new'], 'Labels' => []]]; }
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
$folder = fn(string $name, array $containers, array $settings = []): array
    => ['name' => $name, 'icon' => '', 'regex' => '', 'containers' => $containers, 'settings' => $settings, 'actions' => []];
$saved = ['abc' => $folder('Media', ['app-a', 'app-old'], ['preview' => 0])];
// The config folder before a case: file => contents, or null for no config folder at all
$prepare = function (?array $files) use ($configDir, $dockerManDir, $fv3tTmp, $wipe): void {
    $wipe($configDir);
    $wipe($dockerManDir);
    mkdir($dockerManDir);
    file_put_contents("$dockerManDir/dockerMan.cfg", "autostart-file=\"$fv3tTmp/unraid-autostart\"\n");
    file_put_contents("$fv3tTmp/unraid-autostart", "app-a\n");
    if ($files === null) return;
    mkdir($configDir);
    foreach ($files as $rel => $contents) file_put_contents("$configDir/$rel", $contents);
};
$savedSetup = fn(?array $docker = null): array => ['docker.json' => json_encode($docker ?? $saved), 'vm.json' => '{}', 'settings.json' => '{}'];
$dockerMap = fn() => json_decode((string)@file_get_contents("$configDir/docker.json"), true);

// One request to a shipped endpoint, started as its own process (it exits, and its require is an absolute Unraid path)
$copies = [];
$start = function (string $name, array $fields, string $method = 'POST') use ($fv3tPlugin, $fv3tTmp, $configDir, $dockerManDir, &$copies): array {
    if (!isset($copies[$name])) {
        $copies[$name] = "$fv3tTmp/$name";
        file_put_contents($copies[$name], str_replace('require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");',
            'require_once(' . var_export("$fv3tPlugin/server/lib.php", true) . '); $configDir = ' . var_export($configDir, true) . '; $fv3DockerManDir = ' . var_export($dockerManDir, true) . ';',
            file_get_contents("$fv3tPlugin/server/$name"), $swapped));
        if ($swapped !== 1) throw new RuntimeException("$name: the lib.php require was not found");
    }
    $boot = '$_SERVER["DOCUMENT_ROOT"] = ' . var_export("$fv3tTmp/docroot", true) . '; $_SERVER["REQUEST_METHOD"] = ' . var_export($method, true) . ';'
        . ' $_' . $method . ' = ' . var_export($fields, true) . ';'
        . ' register_shutdown_function(function () { fwrite(STDERR, (string)(http_response_code() ?: 200)); });'
        . ' include ' . var_export($copies[$name], true) . ';';
    $proc = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-r', $boot], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    return ['proc' => $proc, 'pipes' => $pipes];
};
// Waits for it: [status, the JSON answer or the raw body]
$finish = function (array $run): array {
    $body = stream_get_contents($run['pipes'][1]);
    $status = stream_get_contents($run['pipes'][2]);
    proc_close($run['proc']);
    return [$status, json_decode($body, true) ?? $body];
};
$post = fn(string $name, array $fields): array => $finish($start($name, $fields));
// A request started while this test holds $lockFile: [it was still running after $patience seconds, its answer once the lock is released].
// $meanwhile runs just before the release, as the save that held the lock. A request that must not wait gets a long $patience
$whileLocked = function (string $lockFile, callable $request, ?callable $meanwhile = null, float $patience = 0.5) use ($configDir, $finish): array {
    // 'e' keeps the handle out of the request's process
    $lock = fopen("$configDir/$lockFile", 'ce');
    flock($lock, LOCK_EX);
    $run = $request();
    $until = microtime(true) + $patience;
    while (microtime(true) < $until && proc_get_status($run['proc'])['running']) usleep(10000);
    $waiting = proc_get_status($run['proc'])['running'];
    if ($meanwhile) $meanwhile();
    flock($lock, LOCK_UN);
    fclose($lock);
    return [$waiting, $finish($run)];
};

$failed = 0;
$check = function (string $label, bool $ok, $detail = null) use (&$failed): void {
    if ($ok) { echo "ok   $label\n"; return; }
    $failed++;
    echo "FAIL $label" . ($detail === null ? '' : ' — ' . json_encode($detail)) . "\n";
};
$ok = ['200', ['success' => true]];
// what a Docker page posts when it finds app-old renamed to app-new in folder abc
$rename = ['type' => 'docker', 'data' => json_encode(['abc' => ['renames' => ['app-old' => 'app-new']]])];
$defaults = ['type' => 'docker', 'settings' => json_encode(['preview' => 2, 'use_global_defaults' => true])];
$plusBundle = file_get_contents(dirname(__DIR__) . '/fixtures/folderview-plus/backup-docker.json');

// 1. Each writer waits for the lock, and reads the file only once it has it: a folder saved while it waited is still there afterwards
$another = function () use ($configDir, $dockerMap, $folder): void {
    file_put_contents("$configDir/docker.json", json_encode($dockerMap() + ['zzz' => $folder('Saved meanwhile', ['app-z'])]));
};
$writers = [
    'create.php' => [['type' => 'docker', 'content' => json_encode($folder('New', ['app-n']))], fn(array $m) => in_array('New', array_column($m, 'name'), true)],
    'update.php' => [['type' => 'docker', 'id' => 'abc', 'content' => json_encode($folder('Renamed', ['app-a']))], fn(array $m) => $m['abc']['name'] === 'Renamed'],
    'delete.php' => [['type' => 'docker', 'id' => 'abc'], fn(array $m) => !isset($m['abc'])],
    'update_ids.php' => [$rename, fn(array $m) => $m['abc']['containers'] === ['app-a', 'app-new']],
    'apply_defaults.php' => [$defaults, fn(array $m) => $m['abc']['settings']['preview'] === 2 && $m['zzz']['settings']['preview'] === 2],
    'import_foreign.php' => [['bundle' => $plusBundle, 'type' => 'docker', 'action' => 'apply'], fn(array $m) => count($m) > 2 && isset($m['abc'])],
];
$waited = [];
foreach ($writers as $name => [$fields, $applied]) {
    $prepare($savedSetup());
    [$waiting, $answer] = $whileLocked('docker.json.lock', fn() => $start($name, $fields), $another);
    $map = $dockerMap();
    $good = $waiting && $answer[0] === '200' && is_array($map) && isset($map['zzz']) && $applied($map);
    if (!$good) $waited[$name] = ['waited' => $waiting, 'answer' => $answer, 'folders' => is_array($map) ? array_keys($map) : $map];
}
$check('create, update, delete, the id update, Apply defaults and the FolderView Plus import each wait for the lock, then change the file as the save before them left it',
    $waited === [], $waited);

// A restore replaces the file: one that swapped before the save that held the lock would leave that save's file, not its own
$prepare($savedSetup());
$bundle = json_encode(['fv3_export_version' => 1, 'docker' => ['xyz' => $folder('Restored', ['app-a'])]]);
[$waiting, $answer] = $whileLocked('docker.json.lock', fn() => $start('import_all.php', ['bundle' => $bundle]), $another);
$check('Import Everything waits for the lock before it swaps the folder file in',
    $waiting && $answer[0] === '200' && array_keys($dockerMap()) === ['xyz'], [$waiting, $answer, array_keys($dockerMap() ?: [])]);

// A page load that finds no folder file makes it under the lock, and only if it is still missing by then
$prepare([]);
[$waiting, $answer] = $whileLocked('docker.json.lock', fn() => $start('read.php', ['type' => 'docker'], 'GET'),
    fn() => file_put_contents("$configDir/docker.json", json_encode($saved)));
$check('a read that finds no folder file waits for the lock, then shows the folder a save wrote meanwhile and leaves it in the file',
    $waiting && $answer[0] === '200' && ($answer[1]['abc']['name'] ?? null) === 'Media' && $dockerMap() === $saved, [$waiting, $answer]);

// Without the lock no folder file is made: a read of a missing file answers as it does when the folder cannot be written
$prepare([]);
mkdir("$configDir/docker.json.lock");
$answer = $start('read.php', ['type' => 'docker'], 'GET');
$answer = $finish($answer);
$check('a read that finds no folder file and cannot take the lock makes no file',
    $answer[0] === '500' && !file_exists("$configDir/docker.json"), [$answer, file_exists("$configDir/docker.json")]);

// What must not wait: a read of a file that is there, a preview, settings, the other type's folders, a Docker-only import on the VM lock
$free = [];
foreach ([['docker.json.lock', 'read.php', ['type' => 'docker'], 'GET'],
          ['docker.json.lock', 'import_foreign.php', ['bundle' => $plusBundle, 'type' => 'docker', 'action' => 'preview'], 'POST'],
          ['docker.json.lock', 'update_settings.php', ['key' => 'dashboard_docker_layout', 'value' => 'classic'], 'POST'],
          ['docker.json.lock', 'create.php', ['type' => 'vm', 'content' => json_encode($folder('VMs', []))], 'POST'],
          ['vm.json.lock', 'import_foreign.php', ['bundle' => $plusBundle, 'type' => 'docker', 'action' => 'apply'], 'POST']] as [$lockFile, $name, $fields, $method]) {
    $prepare($savedSetup());
    [$waiting, $answer] = $whileLocked($lockFile, fn() => $start($name, $fields, $method), null, 10.0);
    if ($waiting || $answer[0] !== '200' || isset($answer[1]['error'])) $free["$lockFile held: $name " . ($fields['type'] ?? '') . ' ' . ($fields['action'] ?? '')] = [$waiting, $answer];
}
$check('a read, an import preview, a settings save and a VM folder save do not wait on the Docker folder lock, nor a Docker-only import on the VM lock', $free === [], $free);

// 2. The rename the Docker tab sends and Apply defaults, in either order: both land
$orders = [];
foreach (['Apply defaults, then the rename' => [['apply_defaults.php', $defaults], ['update_ids.php', $rename]],
          'the rename, then Apply defaults' => [['update_ids.php', $rename], ['apply_defaults.php', $defaults]]] as $order => $steps) {
    $prepare($savedSetup());
    $answers = array_map(fn(array $step) => $post($step[0], $step[1]), $steps);
    $abc = $dockerMap()['abc'];
    $orders[$order] = [$answers === [$ok, $ok], $abc['containers'], $abc['settings']];
}
$both = [true, ['app-a', 'app-new'], ['preview' => 2, 'use_global_defaults' => true]];
$check('a container rename and Apply defaults both land, whichever is saved first',
    $orders === ['Apply defaults, then the rename' => $both, 'the rename, then Apply defaults' => $both], $orders);

// A page whose copy of a folder is behind: another tab adds app-b to Media, then the page reports the rename it found
$prepare($savedSetup());
$post('update.php', ['type' => 'docker', 'id' => 'abc', 'content' => json_encode($folder('Media', ['app-a', 'app-old', 'app-b'], ['preview' => 0]))]);
$answer = $post('update_ids.php', $rename);
$check('a rename reported by a page whose copy of the folder is behind keeps what another tab saved to that folder since',
    $answer === $ok && $dockerMap()['abc']['containers'] === ['app-a', 'app-new', 'app-b'], [$answer, $dockerMap()]);

$tracked = ['abc' => $folder('Media', ['app-a', 'app-old']) + ['containerImages' => ['app-a' => 'img/a', 'app-old' => 'img/x'], 'hidden_preview' => ['app-old']],
    'def' => $folder('Tools', ['app-t'])];
$prepare($savedSetup($tracked));
$answer = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode([
    'abc' => ['renames' => ['app-old' => 'app-new', 'never-here' => 'x', 'app-a' => ''], 'identity' => ['app-a' => 'img/other', 'not-a-member' => 'img/n']],
    'def' => ['identity' => ['app-t' => 'img/t']], 'gone' => ['renames' => ['a' => 'b']], 'bad id' => ['renames' => ['a' => 'b']]])]);
$after = $dockerMap();
$check('a rename moves the member, its image and its hidden-preview entry; an identity entry is added only for a member that has none',
    $answer === $ok && array_keys($after) === ['abc', 'def'] && $after['abc']['containers'] === ['app-a', 'app-new']
    && $after['abc']['containerImages'] === ['app-a' => 'img/a', 'app-new' => 'img/x'] && $after['abc']['hidden_preview'] === ['app-new']
    && $after['def']['containerImages'] === ['app-t' => 'img/t'], [$answer, $after]);

// The page loaded while app-new was in no folder. Since then another tab put it in one: the rename must not take it from there
$taken = [];
foreach (['the folder it was put in comes later in the file' => ['abc' => $folder('Media', ['app-a', 'app-old']), 'zzz' => $folder('Tools', ['app-b'])],
          'the folder it was put in comes first' => ['aaa' => $folder('Tools', ['app-b']), 'abc' => $folder('Media', ['app-a', 'app-old'])],
          'it was put in the same folder' => ['abc' => $folder('Media', ['app-a', 'app-old'])]] as $case => $layout) {
    $prepare($savedSetup($layout));
    $home = array_key_last(array_diff_key($layout, ['abc' => 1])) ?? 'abc';
    $post('update.php', ['type' => 'docker', 'id' => $home, 'content' => json_encode($folder('Saved', array_merge($layout[$home]['containers'], ['app-new'])))]);
    $placed = $dockerMap();
    $answer = $post('update_ids.php', $rename);
    if ($answer !== $ok || $dockerMap() !== $placed) $taken[$case] = [$answer, array_column($dockerMap(), 'containers')];
}
$check('a rename to a name that another tab has put in a folder since the page loaded is not applied, wherever that folder is in the file', $taken === [], $taken);

$prepare($savedSetup(['abc' => $folder('Media', ['app-old']), 'def' => $folder('Tools', ['app-other'])]));
$answer = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode(['abc' => ['renames' => ['app-old' => 'app-new']], 'def' => ['renames' => ['app-other' => 'app-new']]])]);
$check('two folders in one report cannot both take the same new name: the first does',
    $answer === $ok && array_column($dockerMap(), 'containers') === [['app-new'], ['app-other']], [$answer, $dockerMap()]);

$prepare($savedSetup(['abc' => $folder('Media', ['app-a', 'twice']), 'def' => $folder('Tools', ['twice', 'app-old'])]));
$answer = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode(['def' => ['renames' => ['app-old' => 'app-new']]])]);
$check('as before, a report that changes something leaves a container that was listed in two folders in the first one only',
    $answer === $ok && array_column($dockerMap(), 'containers') === [['app-a', 'twice'], ['app-new']], [$answer, $dockerMap()]);

$prepare(['vm.json' => json_encode(['v1' => $folder('Desktops', ['win-old']) + ['containerIds' => ['win-old' => 'uuid-1']]]), 'docker.json' => '{}']);
$answer = $post('update_ids.php', ['type' => 'vm', 'data' => json_encode(['v1' => ['renames' => ['win-old' => 'win11'], 'identity' => ['win11' => 'uuid-2']]])]);
$v1 = json_decode(file_get_contents("$configDir/vm.json"), true)['v1'];
$check('a VM rename moves its UUID entry the same way', $answer === $ok && [$v1['containers'], $v1['containerIds']] === [['win11'], ['win11' => 'uuid-1']], [$answer, $v1]);

$prepare($savedSetup($tracked));
$inode = fileinode("$configDir/docker.json");
$quiet = [];
foreach ([['abc' => ['renames' => ['never-here' => 'x'], 'identity' => ['app-a' => 'img/other']]], ['abc' => 'text'], ['abc' => ['renames' => 'x', 'identity' => 7]],
          ['abc' => ['renames' => ['app-old' => 5], 'identity' => ['app-a' => ['x']]]], ['gone' => ['renames' => ['app-old' => 'app-new']]]] as $data) {
    $answer = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode($data)]);
    if ($answer !== $ok) $quiet[json_encode($data)] = $answer;
}
clearstatcache();
$check('an id update with nothing to apply, or in a shape it does not take, answers success and does not write the file',
    $quiet === [] && fileinode("$configDir/docker.json") === $inode && $dockerMap() === $tracked, $quiet);

// A list is not a report, even when a folder has the id its first position would be read as
$prepare($savedSetup(['0' => $folder('Numbered', ['app-old'])]));
$kept = file_get_contents("$configDir/docker.json");
$listed = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode([['renames' => ['app-old' => 'app-new']]])]);
$afterList = file_get_contents("$configDir/docker.json");
$emptyList = $post('update_ids.php', ['type' => 'docker', 'data' => '[]']);
$afterEmpty = file_get_contents("$configDir/docker.json");
$byId = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode(['0' => ['renames' => ['app-old' => 'app-new']]], JSON_FORCE_OBJECT)]);
$check('an id update sent as a list is a 400 and changes nothing, an empty one is a no-op, and folder "0" is still reached by its id',
    $listed[0] === '400' && $afterList === $kept && $emptyList === $ok && $afterEmpty === $kept && $byId === $ok && $dockerMap()[0]['containers'] === ['app-new'],
    [$listed, $afterList === $kept, $emptyList, $afterEmpty === $kept, $byId]);

$prepare($savedSetup());
$post('delete.php', ['type' => 'docker', 'id' => 'abc']);
$answer = $post('apply_defaults.php', $defaults);
$check('Apply defaults does not bring back a folder that was deleted since the page loaded', $answer === $ok && $dockerMap() === [], [$answer, $dockerMap()]);

// 3. Twenty saves at once on a large file: every one of them is in the result
$big = [];
for ($i = 0; $i < 1500; $i++) $big["f$i"] = $folder("Folder $i", array_map(fn(int $n) => "ct-$i-$n", range(1, 25)), ['preview' => 0]);
$prepare($savedSetup($big));
$runs = [];
for ($i = 0; $i < 8; $i++) $runs[] = $start('create.php', ['type' => 'docker', 'content' => json_encode($folder("New $i", ["new-$i"]))]);
for ($i = 0; $i < 4; $i++) {
    $runs[] = $start('update_ids.php', ['type' => 'docker', 'data' => json_encode(["f$i" => ['renames' => ["ct-$i-1" => "renamed-$i"]]])]);
    $runs[] = $start('delete.php', ['type' => 'docker', 'id' => 'f' . (100 + $i)]);
}
for ($i = 0; $i < 2; $i++) {
    $runs[] = $start('apply_defaults.php', $defaults);
    $runs[] = $start('update.php', ['type' => 'docker', 'id' => 'f' . (200 + $i), 'content' => json_encode($folder("Edited $i", ["edited-$i"]))]);
}
$answers = array_map($finish, $runs);
$map = $dockerMap() ?: [];
$names = array_column($map, 'name');
$lost = [
    'answers that are not a success' => count(array_filter($answers, fn(array $a) => $a !== $ok)),
    'new folders missing' => count(array_filter(range(0, 7), fn(int $i) => !in_array("New $i", $names, true))),
    'renames missing' => count(array_filter(range(0, 3), fn(int $i) => ($map["f$i"]['containers'][0] ?? null) !== "renamed-$i")),
    'deleted folders still there' => count(array_filter(range(100, 103), fn(int $i) => isset($map["f$i"]))),
    'edits missing' => count(array_filter(range(0, 1), fn(int $i) => ($map['f' . (200 + $i)]['name'] ?? null) !== "Edited $i")),
    'folders without the defaults' => count(array_filter($map, fn(array $f, string $id) => isset($big[$id]) && !in_array($id, ['f200', 'f201'], true)
        && ($f['settings']['preview'] ?? null) !== 2, ARRAY_FILTER_USE_BOTH)),
    'folders in all' => count($map) - (1500 - 4 + 8),
];
$check('twenty saves started together on a 1,500-folder file all land: 8 new folders, 4 renames, 4 deletes, 2 edits and Apply defaults twice',
    array_filter($lost) === [], array_filter($lost));

// 4. Apply defaults changes settings only, as the folders are on disk
$mixed = [
    'plain' => $folder('Plain', ['app-a'], ['preview' => 0, 'preview_border_color' => '#111111', 'expand_tab' => true]),
    'locked' => $folder('Locked', ['app-b'], ['lock_colors' => true, 'preview_border_color' => '#222222', 'preview_vertical_bars_color' => '#333333']),
    'lockedText' => $folder('Locked by a hand edit', [], ['lock_colors' => '0', 'preview_row_separator_color' => '#444444']),
    'bare' => ['name' => 'No settings', 'containers' => ['app-c']],
    'text' => 'not a folder',
];
$patch = ['preview' => 2, 'preview_border_color' => '#aaaaaa', 'preview_vertical_bars_color' => '#bbbbbb', 'preview_row_separator_color' => '#cccccc', 'context_graph_time' => null];
$prepare($savedSetup($mixed));
$answer = $post('apply_defaults.php', ['type' => 'docker', 'settings' => json_encode($patch)]);
$after = $dockerMap();
$check('the defaults are merged into each folder\'s own settings; a folder that locks its colours keeps them; nothing else in the file changes',
    $answer === $ok
    && $after['plain'] === $folder('Plain', ['app-a'], ['preview' => 2, 'preview_border_color' => '#aaaaaa', 'expand_tab' => true,
        'preview_vertical_bars_color' => '#bbbbbb', 'preview_row_separator_color' => '#cccccc', 'context_graph_time' => null])
    && $after['locked']['settings'] === ['lock_colors' => true, 'preview_border_color' => '#222222', 'preview_vertical_bars_color' => '#333333', 'preview' => 2, 'context_graph_time' => null]
    && $after['lockedText']['settings'] === ['lock_colors' => '0', 'preview_row_separator_color' => '#444444', 'preview' => 2, 'context_graph_time' => null]
    && $after['bare'] === ['name' => 'No settings', 'containers' => ['app-c'], 'settings' => $patch]
    && $after['text'] === 'not a folder', [$answer, $after]);

$inode = fileinode("$configDir/docker.json");
$again = $post('apply_defaults.php', ['type' => 'docker', 'settings' => json_encode($patch)]);
$empty = $post('apply_defaults.php', ['type' => 'docker', 'settings' => '{}']);
clearstatcache();
$check('defaults that are already there, and an empty map, answer success without writing the file',
    [$again, $empty, fileinode("$configDir/docker.json")] === [$ok, $ok, $inode], [$again, $empty]);

$refused = [];
foreach (['[1,2]', '{"preview":{"deep":1}}', '{"preview":[1]}', 'not json', '7', '{"preview":2,"not_a_folder_setting":"x"}', '{"preview_status":"invalid"}',
          '{"preview":9}', '{"preview":"2"}', '{"preview_hover":"yes"}', '{"preview_overflow":"scroll"}', '{"preview_border_color":"<b>"}', '{"context_graph_time":-1}',
          '{"context_graph_time":"60"}', '{"preview_text_width":' . json_encode(str_repeat('9', 51)) . '}'] as $bad) {
    $answer = $post('apply_defaults.php', ['type' => 'docker', 'settings' => $bad]);
    if ($answer !== ['400', ['error' => 'The defaults must be folder settings with values the settings page can send']]) $refused[$bad] = $answer;
}
$missing = $post('apply_defaults.php', ['type' => 'docker']);
clearstatcache();
$check('a list, a nested value, text, a key that is not a folder setting, a value its setting does not take or a missing field is a 400 and writes nothing',
    $refused === [] && $missing === ['400', ['error' => 'Missing field: settings']] && fileinode("$configDir/docker.json") === $inode, [$refused, $missing]);

// What the settings page saves under its own, looser rules is taken as it is: any colour text, any width, any whole number of seconds
$loose = ['preview_border_color' => 'red', 'preview_vertical_bars_color' => '#fff', 'preview_row_separator_color' => 'rgba(0,0,0,0.5)', 'preview_text_width' => '10vw',
    'context_graph_time' => 3, 'preview_status' => 'symbol', 'preview_overflow' => 1, 'context' => 0, 'update_column' => false];
$prepare($savedSetup(['abc' => $folder('Media', ['app-a'])]));
$answer = $post('apply_defaults.php', ['type' => 'docker', 'settings' => json_encode($loose)]);
$check('a colour, a width and a graph time as the settings page saves them are applied as sent', $answer === $ok && $dockerMap()['abc']['settings'] === $loose, [$answer, $dockerMap()]);

$prepare([]);
$fresh = [$post('apply_defaults.php', $defaults), $post('update_ids.php', $rename), $post('delete.php', ['type' => 'docker', 'id' => 'abc'])];
$freshFiles = array_values(array_diff(scandir($configDir), ['.', '..']));
$prepare(null);
$none = [$post('apply_defaults.php', $defaults), $post('update_ids.php', $rename), $post('delete.php', ['type' => 'docker', 'id' => 'abc'])];
$check('with no folder file (a fresh install) or no config folder, Apply defaults, the id update and a delete answer success and make no folder file',
    [$fresh, $freshFiles, $none, is_file("$configDir/docker.json")] === [[$ok, $ok, $ok], ['docker.json.lock'], [$ok, $ok, $ok], false], [$fresh, $freshFiles, $none]);
$prepare(null);
$empty = $post('update_ids.php', ['type' => 'docker', 'data' => '{}']);
$check('an id update with nothing in it makes nothing at all', $empty === $ok && !is_dir($configDir), [$empty, is_dir($configDir)]);

$prepare(['docker.json' => '{"abc":']);
$answer = $post('apply_defaults.php', $defaults);
$check('a folder file cut off mid-write is a 500 and stays as it is',
    $answer === ['500', ['error' => 'docker.json is unreadable — refusing to save so existing folders are not wiped']] && file_get_contents("$configDir/docker.json") === '{"abc":', $answer);

$unreadable = [];
foreach (['create.php', 'update.php', 'update_ids.php', 'delete.php'] as $name) {
    $prepare(['docker.json' => '{"abc":']);
    $answer = $post($name, $name === 'update_ids.php' ? $rename : $writers[$name][0]);
    $unreadable[$name] = [$answer[0], $answer[1]['error'] ?? $answer[1], file_get_contents("$configDir/docker.json") === '{"abc":'];
}
$noSave = ['500', 'docker.json is unreadable — refusing to save so existing folders are not wiped', true];
$check('the other writers refuse it in their own words, as before',
    $unreadable === ['create.php' => $noSave, 'update.php' => $noSave, 'update_ids.php' => $noSave,
        'delete.php' => ['500', 'docker.json is unreadable — refusing to delete so the folder config is not wiped', true]], $unreadable);

// A tab left open across the update still posts its whole lists: they are no longer taken, and nor is any other field
$prepare($savedSetup());
$inode = fileinode("$configDir/docker.json");
$fields = ['containers' => ['app-new'], 'containerIds' => ['app-new' => 'id-1'], 'containerImages' => ['app-new' => 'img-1'], 'hidden_preview' => ['app-new']];
$answer = $post('update_ids.php', ['type' => 'docker', 'data' => json_encode(['abc' => $fields + ['name' => 'Not a field it takes', 'settings' => ['preview' => 9]], 'gone' => $fields])]);
clearstatcache();
$check('whole container lists from a page\'s copy, as a tab from before this change posts them, answer success and change nothing',
    $answer === $ok && $dockerMap() === $saved && fileinode("$configDir/docker.json") === $inode, [$answer, $dockerMap()]);

// 5. createFile() never replaces a file that appeared after its caller's check
$createFile = function () use ($fv3tPlugin, $fv3tTmp, $configDir): string {
    $boot = '$_SERVER["DOCUMENT_ROOT"] = ' . var_export("$fv3tTmp/docroot", true) . '; require ' . var_export("$fv3tPlugin/server/lib.php", true) . ';'
        . ' $configDir = ' . var_export($configDir, true) . '; createFile("docker"); echo file_get_contents("$configDir/docker.json");';
    return (string)shell_exec(escapeshellarg(PHP_BINARY) . ' -d display_errors=0 -r ' . escapeshellarg($boot));
};
$prepare($savedSetup());
$kept = $createFile();
$prepare(null);
$made = $createFile();
$check('createFile() leaves a folder file that is already there alone, and makes {} (and the config folder) when there is none',
    [$kept, $made] === [json_encode($saved), '{}'], [$kept, $made]);

// 6. A lock that cannot be taken is a 500 that says so, and nothing is written. Not as root: root writes through the permissions
if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
    $locked = [];
    $requests = ['create.php' => $writers['create.php'][0], 'update.php' => $writers['update.php'][0], 'delete.php' => $writers['delete.php'][0],
        'update_ids.php' => $rename, 'apply_defaults.php' => $defaults, 'import_all.php' => ['bundle' => $bundle], 'import_foreign.php' => $writers['import_foreign.php'][0]];
    foreach ($requests as $name => $fields) {
        $prepare($savedSetup());
        $before = file_get_contents("$configDir/docker.json");
        chmod($configDir, 0555);
        $answer = $post($name, $fields);
        chmod($configDir, 0777);
        $locked[$name] = [$answer[0], $answer[1]['error'] ?? $answer[1], file_get_contents("$configDir/docker.json") === $before];
    }
    $noLock = ['500', 'Could not lock docker.json — nothing was saved', true];
    $check('with a config folder that cannot be written, every folder save answers that it could not lock the file, and the imports that nothing was imported',
        $locked === ['create.php' => $noLock, 'update.php' => $noLock, 'delete.php' => $noLock, 'update_ids.php' => $noLock, 'apply_defaults.php' => $noLock,
            'import_all.php' => ['200', 'Could not lock docker.json — nothing was imported', true], 'import_foreign.php' => ['200', 'write-failed', true]], $locked);

    // What writes nothing needs no lock: these answered success on such a folder before, and still do
    $noop = [];
    foreach (['delete.php' => ['type' => 'docker', 'id' => 'gone'], 'update_ids.php' => ['type' => 'docker', 'data' => json_encode(['abc' => ['renames' => ['never-here' => 'x']]])],
              'apply_defaults.php' => ['type' => 'docker', 'settings' => json_encode(['preview' => 0])],
              'import_foreign.php' => ['bundle' => '{"folders":{}}', 'type' => 'docker', 'action' => 'apply']] as $name => $fields) {
        $prepare($savedSetup());
        chmod($configDir, 0555);
        $answer = $post($name, $fields);
        chmod($configDir, 0777);
        $noop[$name] = [$answer[0], $answer[1]['error'] ?? $answer[1]];
    }
    $check('on the same folder, a delete of a folder that is gone, an id update or Apply defaults with nothing to change, and a bundle that is refused answer as before',
        $noop === ['delete.php' => $ok, 'update_ids.php' => $ok, 'apply_defaults.php' => $ok, 'import_foreign.php' => ['200', $noop['import_foreign.php'][1]]]
        && !in_array($noop['import_foreign.php'][1], ['write-failed', ['success' => true]], true), $noop);
}

$prepare(null);
$answer = $post('import_foreign.php', ['bundle' => '{"folders":{}}', 'type' => 'docker', 'action' => 'apply']);
$check('a FolderView Plus bundle that is refused makes no config folder and no lock file', isset($answer[1]['error']) && !is_dir($configDir), [$answer, is_dir($configDir)]);

// A restore that holds several files names the one it could not lock, and restores none of them
$prepare($savedSetup());
mkdir("$configDir/vm.json.lock");
$before = [file_get_contents("$configDir/docker.json"), file_get_contents("$configDir/vm.json")];
$answer = $post('import_all.php', ['bundle' => json_encode(['fv3_export_version' => 1, 'docker' => ['xyz' => $folder('Restored', [])], 'vm' => ['v1' => $folder('VMs', [])]])]);
$check('Import Everything names the file it could not lock and leaves every file as it was',
    ($answer[1]['error'] ?? null) === 'Could not lock vm.json — nothing was imported'
    && [file_get_contents("$configDir/docker.json"), file_get_contents("$configDir/vm.json")] === $before, $answer);

$wipe("$fv3tTmp/config");
$wipe("$fv3tTmp/dockerMan");
$wipe("$fv3tTmp/docroot");
array_map('unlink', glob("$fv3tTmp/*"));
rmdir($fv3tTmp);
echo $failed ? "\n$failed FAILED\n" : "\nall passed\n";
exit($failed ? 1 : 0);
