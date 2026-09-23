<?php
// php .github/scripts/foreign_import_test.php [corpus-dir] — FolderView Plus backup import, against backups its own code wrote
$fv3tRepo = dirname(__DIR__, 2);
$fv3tCorpus = $argv[1] ?? dirname(__DIR__) . '/fixtures/folderview-plus';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-foreign-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time
foreach (['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => '<?php class DockerUpdate {} class DockerClient { public function getDockerContainers() { return $GLOBALS["fv3tDockerContainers"]; } public function getDockerJSON($path) { return $GLOBALS["fv3tDockerJSON"]; } }'] as $rel => $src) {
    @mkdir(dirname("$fv3tTmp/docroot/$rel"), 0777, true);
    file_put_contents("$fv3tTmp/docroot/$rel", $src);
}
$_SERVER['DOCUMENT_ROOT'] = "$fv3tTmp/docroot";
// libvirt stub: lib.php loads libvirt_helpers.php if present, and vmUp()/vmDown() drive its answers
@mkdir("$fv3tTmp/docroot/plugins/dynamix.vm.manager/include", 0777, true);
file_put_contents("$fv3tTmp/docroot/plugins/dynamix.vm.manager/include/libvirt_helpers.php", '<?php class Libvirt { public function connect() { return $GLOBALS["fv3tVmUp"]; } public function get_domains() { return $GLOBALS["fv3tVmUp"] ? $GLOBALS["fv3tVmNames"] : false; } }');
function vmUp(array $names = []): void { $GLOBALS['fv3tVmUp'] = true; $GLOBALS['fv3tVmNames'] = $names; unset($GLOBALS['lv']); }
function vmDown(): void { $GLOBALS['fv3tVmUp'] = false; unset($GLOBALS['lv']); }
vmUp(['vm-one', 'vm-two', 'vm-lab']);
// Drives the DockerClient stub above: dockerUp() for a healthy read, dockerDown() for an outage
function dockerUp(array $names = [], array $labels = []): void {
    $GLOBALS['fv3tDockerContainers'] = array_map(static fn($n) => ['Name' => $n], $names);
    $GLOBALS['fv3tDockerJSON'] = array_map(static fn($n) => ['Names' => ['/' . $n], 'Labels' => isset($labels[$n]) ? ['folder.view3' => $labels[$n]] : []], $names);
}
function dockerDown(): void { $GLOBALS['fv3tDockerContainers'] = null; $GLOBALS['fv3tDockerJSON'] = null; }
dockerUp(['app-alpha', 'app-beta', 'app-gamma', 'app-delta', 'dup', 'x']);
require "$fv3tRepo/src/folder.view3/usr/local/emhttp/plugins/folder.view3/server/lib.php";
$configDir = "$fv3tTmp/config";
mkdir($configDir);
// lib.php's own handlers answer JSON and exit 0 — a crash here must fail the run instead
set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity) || ($severity & (E_DEPRECATED | E_USER_DEPRECATED))) return false;
    throw new ErrorException($message, 0, $severity, $file, $line);
});
set_exception_handler(function (Throwable $e): void {
    echo 'FAIL uncaught ' . get_class($e) . ': ' . $e->getMessage() . ' at ' . basename($e->getFile()) . ':' . $e->getLine() . "\n";
    exit(1);
});

$fv3tFailed = 0;
function check(string $label, bool $ok, $detail = null): void {
    global $fv3tFailed;
    if ($ok) { echo "ok   $label\n"; return; }
    $fv3tFailed++;
    echo "FAIL $label" . ($detail === null ? '' : ' — ' . json_encode($detail, JSON_UNESCAPED_SLASHES)) . "\n";
}
function corpus(string $name): array {
    global $fv3tCorpus;
    return json_decode(file_get_contents("$fv3tCorpus/$name"), true, 512, JSON_THROW_ON_ERROR);
}
function byName(array $folders): array {
    $out = [];
    foreach ($folders as $f) $out[$f['name']] = $f;
    return $out;
}
function settingsOf(array $folder): array { return (array)$folder['settings']; }
function resetConfig(array $files = []): void {
    global $configDir;
    array_map('unlink', glob("$configDir/*.json"));
    foreach ($files as $name => $content) file_put_contents("$configDir/$name", $content);
}

$names = array_map('basename', glob("$fv3tCorpus/*.json"));
check('corpus has all five shapes', count(array_intersect($names, ['export-full-docker.json', 'export-single-docker.json', 'backup-docker.json', 'environment.json', 'rollback.json'])) === 5, $names);
$allowedKeys = ['name', 'icon', 'regex', 'containers', 'hidden_preview', 'actions', 'settings', 'containerImages', 'containerIds'];
$rules = fv3_foreign_setting_rules();
foreach ($names as $name) {
    $r = fv3_convert_foreign_bundle(corpus($name), null);
    check("$name converts", !isset($r['error']), $r['error'] ?? null);
    foreach ($r['folders'] ?? [] as $type => $folders) {
        foreach ($folders as $f) {
            check("$name $type '{$f['name']}' has only folder.view3 keys", !array_diff(array_keys($f), $allowedKeys), array_keys($f));
            check("$name $type '{$f['name']}' has only folder.view3 settings", !array_diff_key(settingsOf($f), $rules), array_keys(settingsOf($f)));
        }
    }
}

// Docker: nested folders collapse into their top-level ancestor
$r = fv3_convert_foreign_bundle(corpus('backup-docker.json'), 'docker');
$d = byName($r['folders']['docker']);
$rep = $r['report']['types']['docker'];
check('three top-level docker folders', array_keys($d) === ['Media', 'Tools', '<img src=x onerror=alert(1)>'], array_keys($d));
check('children and grandchildren merge into the root', $d['Media']['containers'] === ['app-alpha', 'app-beta', 'app-gamma', 'app-delta'], $d['Media']['containers']);
check('merged child count', $rep['merged_children'] === 2, $rep['merged_children']);
check('hidden previews union across the group', $d['Media']['hidden_preview'] === ['app-beta', 'app-gamma'], $d['Media']['hidden_preview']);
check('member identities become containerImages', (array)$d['Media']['containerImages'] === ['app-alpha' => 'example/alpha:latest', 'app-beta' => 'example/beta:1.2'], $d['Media']['containerImages']);
check('a member in two imported folders stays with the first', $d['Tools']['containers'] === ['tool-one'] && $rep['members_kept_elsewhere'] === 1, [$d['Tools']['containers'], $rep['members_kept_elsewhere']]);
check('root actions survive', array_column($d['Media']['actions'], 'name') === ['Restart all', 'Notify'], $d['Media']['actions']);
check('child actions are counted, not merged', $rep['child_actions'] === 1, $rep['child_actions']);
check('overflow string maps to the folder.view3 int', settingsOf($d['Media'])['preview_overflow'] === 2 && settingsOf($d['Tools'])['preview_overflow'] === 1);
check('valid settings carry over', settingsOf($d['Media'])['preview_border_color'] === '#ff8800' && settingsOf($d['Media'])['folder_webui_url'] === 'http://app-alpha.local:8080/');
check('http icon kept', $d['Tools']['icon'] === 'https://example.invalid/icon.png');
check('regex kept', $d['Tools']['regex'] === '^tool-');

// Hostile folder: every unsafe value is dropped
$h = $d['<img src=x onerror=alert(1)>'];
check('javascript: icon dropped', $h['icon'] === '' && $rep['dropped_icons'] === 1);
check('javascript: webui url dropped', !isset(settingsOf($h)['folder_webui_url']), settingsOf($h));
check('non-int preview and out-of-range graph time dropped', !isset(settingsOf($h)['preview']) && !isset(settingsOf($h)['context_graph_time']), settingsOf($h));
check('__proto__ setting dropped', !array_key_exists('__proto__', settingsOf($h)));
check('traversal script and foreign-member action dropped', $h['actions'] === [] && $rep['dropped_actions'] === 2, $h['actions']);

// VM
$v = byName(fv3_convert_foreign_bundle(corpus('export-full-vm.json'), 'vm')['folders']['vm']);
check('vm child merges into parent', array_keys($v) === ['Virtual Machines'] && $v['Virtual Machines']['containers'] === ['vm-one', 'vm-two', 'vm-lab'], $v);
check('vm uuids become containerIds', (array)$v['Virtual Machines']['containerIds'] === ['vm-one' => '11111111-2222-3333-4444-555555555555', 'vm-lab' => '66666666-7777-8888-9999-000000000000']);

// Whole-environment shapes
foreach (['environment.json', 'rollback.json'] as $name) {
    $r = fv3_convert_foreign_bundle(corpus($name), null);
    check("$name yields both types", isset($r['folders']['docker'], $r['folders']['vm']));
    check("$name reports prefs and themes skipped", !array_diff(['prefs', 'themes'], $r['report']['skipped_sections']), $r['report']['skipped_sections']);
    $only = fv3_convert_foreign_bundle(corpus($name), 'docker');
    check("$name via the Docker button takes docker only", array_keys($only['folders']) === ['docker'] && in_array('vm', $only['report']['skipped_sections'], true));
}
check('single export yields one folder', count(fv3_convert_foreign_bundle(corpus('export-single-docker.json'), 'docker')['folders']['docker']) === 1);

// Fails closed on anything it does not know
$full = corpus('export-full-docker.json');
$cases = [
    'newer schema' => [array_merge($full, ['schemaVersion' => 2]), null, 'newer-version'],
    'string schema' => [array_merge($full, ['schemaVersion' => '1']), null, 'no-version'],
    'newer rollback schema' => [array_merge(corpus('rollback.json'), ['rollbackSchemaVersion' => 2]), null, 'newer-version'],
    'unknown kind' => [array_merge(corpus('environment.json'), ['kind' => 'something_else']), null, 'unsupported'],
    'rules export' => [array_merge($full, ['mode' => 'rules']), null, 'unsupported'],
    'missing type' => [array_diff_key($full, ['type' => 1]), null, 'no-type'],
    'docker file on the VM button' => [$full, 'vm', 'no-vm-folders'],
    'native folder.view3 export' => [['abc' => ['name' => 'x', 'containers' => []]], null, 'not-foreign'],
    'folder.view3 bundle' => [['fv3_export_version' => 1, 'docker' => []], null, 'not-foreign'],
];
foreach ($cases as $label => [$raw, $type, $want]) {
    $got = fv3_convert_foreign_bundle($raw, $type)['error'] ?? null;
    check("rejects: $label", $got === $want, $got);
}

// Broken nesting
$loop = ['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => [
    'a' => ['name' => 'A', 'containers' => ['x'], 'parentId' => 'b'],
    'b' => ['name' => 'B', 'containers' => ['y'], 'parentId' => 'a'],
    'c' => ['name' => 'C', 'containers' => ['z'], 'parentId' => 'd'],
    'd' => ['name' => 'D', 'containers' => ['w'], 'parentId' => 'gone'],
]];
$r = fv3_convert_foreign_bundle($loop, 'docker');
$l = byName($r['folders']['docker']);
check('a parent loop leaves each folder standalone', isset($l['A'], $l['B']));
check('a chain to a missing parent collapses into its last valid folder', !isset($l['C']) && $l['D']['containers'] === ['w', 'z'], array_keys($l));
check('broken parents counted', $r['report']['types']['docker']['broken_parents'] === 3, $r['report']['types']['docker']['broken_parents']);

$numeric = ['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => [
    '100' => ['name' => 'Top', 'containers' => ['p'], 'parentId' => ''],
    '200' => ['name' => 'Kid', 'containers' => ['q'], 'parentId' => '100'],
]];
$n = byName(fv3_convert_foreign_bundle($numeric, 'docker')['folders']['docker']);
check('all-digit folder ids nest like any other', array_keys($n) === ['Top'] && $n['Top']['containers'] === ['p', 'q'], $n);

// Actions
$act = static fn(array $a) => fv3_foreign_action(array_merge(['name' => 'n', 'type' => 1, 'script_icon' => 'bolt', 'script' => 'ok', 'script_args' => ''], $a), ['m']);
check('plain script accepted', $act([]) !== null);
foreach (['..' => ['script' => '..'], 'slash' => ['script' => 'a/b'], 'ampersand args' => ['script_args' => 'a&b'], 'percent args' => ['script_args' => '%0A'], 'newline args' => ['script_args' => "a\nb"], 'quote icon' => ['script_icon' => 'x" onclick="y'], 'string type' => ['type' => '1']] as $label => $bad) {
    check("action rejected: $label", $act($bad) === null);
}

check('action text above U+00FF rejected (folder.js btoa)', $act(['name' => '重启']) === null && $act(['name' => 'Restart — all']) === null && $act(['script_args' => 'é']) !== null);
$vmAct = fv3_foreign_action(['name' => 'n', 'type' => 0, 'script_icon' => '', 'conatiners' => ['Windows 11 家庭版'], 'action' => 2], ['Windows 11 家庭版']);
check('action targeting a non-Latin-1 VM name rejected', $vmAct === null);

$rx = ['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => ['r' => ['name' => 'R', 'containers' => [], 'regex' => 'a\\/b(']]];
$rr = fv3_convert_foreign_bundle($rx, 'docker');
check('an uncompilable regex is dropped and counted', $rr['folders']['docker'][0]['regex'] === '' && $rr['report']['types']['docker']['dropped_regex'] === 1, $rr['report']['types']['docker']);
$mk = static fn(array $folder) => ['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => ['r' => ['name' => 'R', 'containers' => []] + $folder]];
$long = fv3_convert_foreign_bundle($mk(['regex' => str_repeat('a', 1025)]), 'docker');
check('an over-long regex is left out and counted', $long['folders']['docker'][0]['regex'] === '' && $long['report']['types']['docker']['dropped_regex'] === 1, $long['report']['types']['docker']);
$nonStr = fv3_convert_foreign_bundle($mk(['regex' => 42]), 'docker');
check('a non-string regex is left out and counted', $nonStr['report']['types']['docker']['dropped_regex'] === 1, $nonStr['report']['types']['docker']);
$noRx = fv3_convert_foreign_bundle($mk([]), 'docker');
check('a folder with no regex counts none', $noRx['report']['types']['docker']['dropped_regex'] === 0, $noRx['report']['types']['docker']);
$manyActs = array_fill(0, FV3_FOREIGN_MAX_ACTIONS + 3, ['name' => 'n', 'type' => 1, 'script_icon' => '', 'script' => 'ok', 'script_args' => '']);
$capA = fv3_convert_foreign_bundle($mk(['actions' => $manyActs]), 'docker');
check('actions past the cap are counted as left out', $capA['report']['types']['docker']['dropped_actions'] === 3, $capA['report']['types']['docker']['dropped_actions']);
$manyMembers = array_map(static fn($i) => "ct-$i", range(1, FV3_FOREIGN_MAX_MEMBERS + 7));
$capM = fv3_convert_foreign_bundle(['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => ['r' => ['name' => 'R', 'containers' => $manyMembers]]], 'docker');
check('members past the cap are counted as left out', $capM['report']['types']['docker']['dropped_members'] === 7, $capM['report']['types']['docker']['dropped_members']);

$jsOnly = ['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => ['r' => ['name' => 'R', 'containers' => [], 'regex' => '(?i)tool']]];
$jr = fv3_convert_foreign_bundle($jsOnly, 'docker');
check('a regex only PHP can run is dropped and counted', $jr['folders']['docker'][0]['regex'] === '' && $jr['report']['types']['docker']['dropped_regex'] === 1, $jr['report']['types']['docker']);
// Every construct raised in review or found by differential fuzzing against JS new RegExp()
foreach (['(?P<n>a)', '(?P<n>a)(?P=n)', '(?|(a)|(b))', '(?<n>a)(?&n)', '(*UTF8)a', '\x{41}', '\e', '\o{101}', '\N', '\X', '\v',
          '[[:digit:]]', '(?<=a)*', '(?=a)+', 'a{2}{3}', '(a)\1', '\A', '(?i)a', 'a*+', '\p{L}'] as $bad) {
    check("regex refused: $bad", !fv3_foreign_regex_js_safe($bad));
}
foreach (['tool', '^app-(alpha|beta)$', '[0-9]+', 'app-\w+', '(?:ab)+', 'a{2,3}', '.*plex.*', '^(?!test).*', '(?<=app-)x',
          'home[- ]?assistant', '[^/]+$', '\bplex\b', '\x41', 'a+?', '^vm-[A-Za-z0-9_-]+'] as $good) {
    check("regex kept: $good", fv3_foreign_regex_js_safe($good));
}
$bothOk = $jsOnly; $bothOk['folders']['r']['regex'] = '^app-(alpha|beta)$';
$br = fv3_convert_foreign_bundle($bothOk, 'docker');
check('a regex both engines run is kept', $br['folders']['docker'][0]['regex'] === '^app-(alpha|beta)$' && $br['report']['types']['docker']['dropped_regex'] === 0, $br['report']['types']['docker']);
check('an unnamed folder counts as renamed', fv3_convert_foreign_bundle(['schemaVersion' => 1, 'type' => 'docker', 'mode' => 'full', 'folders' => ['u' => ['name' => '', 'containers' => []]]], 'docker')['report']['types']['docker']['renamed'] === 1);

// Clashes with what is already on disk
$existing = ['docker' => ['keep' => ['name' => 'media', 'containers' => ['app-alpha']]]];
$r = fv3_convert_foreign_bundle(corpus('backup-docker.json'), 'docker', $existing);
$c = byName($r['folders']['docker']);
check('a name clash gets a suffix, case-insensitive', isset($c['Media (imported)']) && $r['report']['types']['docker']['renamed'] === 1, array_keys($c));
check('a member already in a folder stays there', !in_array('app-alpha', $c['Media (imported)']['containers'], true));
check('an action whose target stayed behind is dropped', !in_array('Restart all', array_column($c['Media (imported)']['actions'], 'name'), true));

// Write path
$keep = ['keep' => ['name' => 'Existing', 'icon' => '', 'regex' => '', 'containers' => ['app-alpha'], 'settings' => ['preview' => 3]]];
resetConfig(['docker.json' => json_encode($keep)]);
$json = file_get_contents("$fv3tCorpus/backup-docker.json");
$r = importForeignBundle($json, 'docker', false);
check('preview reports without writing', isset($r['report']) && file_get_contents("$configDir/docker.json") === json_encode($keep) && !file_exists("$configDir/vm.json"));
$r = importForeignBundle($json, 'docker', true);
$after = json_decode(file_get_contents("$configDir/docker.json"), true);
check('apply succeeds', !empty($r['success']), $r);
check('existing folder is untouched', $after['keep'] === $keep['keep'], $after['keep'] ?? null);
check('imported folders added with valid ids', count($after) === 4 && count(array_filter(array_keys($after), 'fv3_is_folder_id')) === 4, array_keys($after));
check('no container ends up in two folders', count(array_merge(...array_column($after, 'containers'))) === count(array_unique(array_merge(...array_column($after, 'containers')))));
$shared = ['one' => ['name' => 'One', 'containers' => ['dup']], 'two' => ['name' => 'Two', 'containers' => ['dup']]];
resetConfig(['docker.json' => json_encode($shared)]);
importForeignBundle($json, 'docker', true);
$after2 = json_decode(file_get_contents("$configDir/docker.json"), true);
check('existing folders that already share a member are left as they were', $after2['one'] === $shared['one'] && $after2['two'] === $shared['two'], [$after2['one'], $after2['two']]);
resetConfig(['docker.json' => json_encode($keep)]);
importForeignBundle($json, 'docker', true);
resetConfig(['docker.json' => '{"keep":{"name":"Keep","containers":["x"],"settings":{},"containerImages":{}}}']);
importForeignBundle($json, 'docker', true);
$raw = json_decode(file_get_contents("$configDir/docker.json"));
check('existing empty objects stay {} on disk', $raw->keep->settings instanceof stdClass && $raw->keep->containerImages instanceof stdClass, $raw->keep);
resetConfig(['docker.json' => json_encode($keep)]);
importForeignBundle($json, 'docker', true);
check('Docker import leaves vm.json alone', !file_exists("$configDir/vm.json"));
check('no staging folder left behind', !glob("$configDir/.fv3-import-*"));

$r = importForeignBundle(file_get_contents("$fv3tCorpus/environment.json"), null, true);
check('environment import writes both files', !empty($r['success']) && count(json_decode(file_get_contents("$configDir/vm.json"), true)) === 1);

resetConfig(['docker.json' => '{corrupt']);
$r = importForeignBundle($json, 'docker', true);
check('corrupt config fails closed and is left as is', ($r['error'] ?? null) === 'config-unreadable' && file_get_contents("$configDir/docker.json") === '{corrupt');
resetConfig(['docker.json' => '[{"name":"x"}]']);
$r = importForeignBundle($json, 'docker', true);
check('a list-shaped config is refused and left as is', ($r['error'] ?? null) === 'config-unreadable' && file_get_contents("$configDir/docker.json") === '[{"name":"x"}]', $r);
resetConfig(['docker.json' => '']);
$r = importForeignBundle($json, 'docker', true);
check('an empty config file imports into a fresh map', !empty($r['success']) && count(json_decode(file_get_contents("$configDir/docker.json"), true)) === 3, $r);
resetConfig();
$emptyEnv = corpus('environment.json');
$emptyEnv['types']['docker']['folders'] = [];
check('a file with no folders for the chosen type is refused at preview', (importForeignBundle(json_encode($emptyEnv), 'docker', false)['error'] ?? null) === 'no-folders');
check('oversized bundle refused', (importForeignBundle(str_repeat(' ', FV3_FOREIGN_MAX_BYTES + 1), null, false)['error'] ?? null) === 'too-large');
check('JSON list refused', (importForeignBundle('[1,2]', null, false)['error'] ?? null) === 'unsupported');

// Effective membership: an existing folder can hold a container through a label, not just containers[]
resetConfig(['docker.json' => json_encode(['hold' => ['name' => 'Holder', 'containers' => []]])]);
dockerUp(['app-alpha', 'app-beta', 'app-gamma', 'app-delta'], ['app-alpha' => 'Holder']);
$r = importForeignBundle($json, 'docker', true);
$afterLbl = json_decode(file_get_contents("$configDir/docker.json"), true);
$importedMembers = array_merge(...array_column(array_filter($afterLbl, static fn($f) => $f['name'] !== 'Holder'), 'containers'));
check('a container held by a label is not claimed by an import', !empty($r['success']) && !in_array('app-alpha', $importedMembers, true), $importedMembers);

resetConfig(['docker.json' => json_encode(['hold' => ['name' => 'Holder', 'containers' => []]])]);
dockerDown();
$r = importForeignBundle($json, 'docker', true);
check('a Docker import is refused when Docker cannot be read', ($r['error'] ?? null) === 'membership-unavailable', $r);
check('the refused import left the config alone', array_keys(json_decode(file_get_contents("$configDir/docker.json"), true)) === ['hold']);
$r = importForeignBundle(file_get_contents("$fv3tCorpus/backup-vm.json"), 'vm', true);
check('a VM import still works while Docker is down', !empty($r['success']), $r);
dockerUp(['app-alpha', 'app-beta', 'app-gamma', 'app-delta']);

// VM membership: an existing folder can hold a VM through its regex, which vm.js lets an explicit entry override
$vmBundle = file_get_contents("$fv3tCorpus/backup-vm.json");
resetConfig(['vm.json' => json_encode(['hold' => ['name' => 'Holder', 'containers' => [], 'regex' => '^vm-lab$']])]);
vmUp(['vm-one', 'vm-two', 'vm-lab']);
$r = importForeignBundle($vmBundle, 'vm', true);
$afterVm = json_decode(file_get_contents("$configDir/vm.json"), true);
$importedVms = array_merge(...array_column(array_filter($afterVm, static fn($f) => $f['name'] !== 'Holder'), 'containers'));
check('a VM held by a regex is not claimed by an import', !empty($r['success']) && !in_array('vm-lab', $importedVms, true), $importedVms);
check('the regex-held VM is reported as kept elsewhere', ($r['report']['types']['vm']['members_kept_elsewhere'] ?? null) === 1, $r['report']['types']['vm'] ?? $r);

resetConfig(['vm.json' => json_encode(['hold' => ['name' => 'Holder', 'containers' => [], 'regex' => '^vm-lab$']])]);
vmDown();
$r = importForeignBundle($vmBundle, 'vm', true);
check('a VM import is refused when libvirt cannot be read', ($r['error'] ?? null) === 'vm-membership-unavailable', $r);
check('the refused VM import left the config alone', array_keys(json_decode(file_get_contents("$configDir/vm.json"), true)) === ['hold']);
resetConfig(['vm.json' => json_encode(['plain' => ['name' => 'Plain', 'containers' => ['vm-one']]])]);
$r = importForeignBundle($vmBundle, 'vm', true);
check('a VM import needs no libvirt read when no existing folder uses a regex', !empty($r['success']), $r);
resetConfig(['docker.json' => json_encode(['keep' => ['name' => 'Existing', 'containers' => ['app-alpha']]])]);
$r = importForeignBundle($json, 'docker', true);
check('a Docker import does not depend on libvirt', !empty($r['success']), $r);
vmUp(['vm-one', 'vm-two', 'vm-lab']);

// Every counter the report carries must have a preview line, or the user is never told about it
$previewJs = file_get_contents("$fv3tRepo/src/folder.view3/usr/local/emhttp/plugins/folder.view3/scripts/folderview3.js");
preg_match_all('/\\[r\\.([a-z_]+),/', $previewJs, $shown);
$reportKeys = array_keys(array_diff_key(fv3_convert_foreign_bundle(corpus('backup-docker.json'), 'docker')['report']['types']['docker'], ['folders' => 1]));
check('every report counter has a preview line', !array_diff($reportKeys, $shown[1]), array_values(array_diff($reportKeys, $shown[1])));

exec('rm -rf ' . escapeshellarg($fv3tTmp));
echo $fv3tFailed ? "\n$fv3tFailed FAILED\n" : "\nall passed\n";
exit($fv3tFailed ? 1 : 0);
