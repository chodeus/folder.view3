<?php
// php .github/scripts/page_order_test.php [plugin-dir] — the order syncContainerOrder() writes the autostart file in, and the list
// read_unraid_order.php hands the page. The fixture's order is what docker.js draws; docker_new_folder_order_test.js holds the page to the same file.
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-page-order-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time; this DockerClient answers with the names a case sets
$fv3tDockerClient = <<<'PHP'
<?php
class DockerClient {
    public static $names = [];
    function getDockerContainers() { return array_map(fn($n) => ['Name' => $n], self::$names); }
    function getDockerJSON($url) { return array_map(fn($n) => ['Names' => ["/$n"], 'Labels' => []], self::$names); }
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
$listed = function (array $names, ?string $cfg) use ($setPrefs): array { DockerClient::$names = $names; $setPrefs($cfg); return readUnraidOrder('docker'); };
// The autostart file's lines after a real syncContainerOrder()
$sync = function (array $folders, array $names, ?string $cfg, array $autostart) use ($setPrefs, $configDir, $fv3tAutostart): array {
    DockerClient::$names = $names;
    $setPrefs($cfg);
    file_put_contents("$configDir/docker.json", json_encode($folders));
    file_put_contents($fv3tAutostart, implode("\n", $autostart) . "\n");
    syncContainerOrder('docker');
    return file($fv3tAutostart, FILE_IGNORE_NEW_LINES);
};
$containersOf = fn(array $order): array => array_values(array_filter($order, fn($n) => !str_starts_with($n, 'folder-')));
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
    ['no userprefs.cfg: a look-alike of a folder member keeps its own A-Z place',
        $order(['f' => $folder('F', ['10'])], ['10', '1e1', '0first'], []), ['0first', '1e1', '10', 'folder-f']],
    ['autostart lines follow the order and keep their wait value',
        fv3_reorder_autostart(['a 5', 'b', 'c 10'], ['c', 'folder-f', 'a', 'a']), ['c 10', 'a 5', 'b']],
    ['a line the order does not name stays after the others, in file order',
        fv3_reorder_autostart(['x', 'a', 'y'], ['a']), ['a', 'x', 'y']],
    ['look-alike names in the file stay apart',
        fv3_reorder_autostart(['10 2', '010'], ['010', '10']), ['010', '10 2']],
    ['an order that names nothing in the file changes nothing',
        fv3_reorder_autostart(['a', 'b'], ['z']), ['a', 'b']],
    ['no userprefs.cfg reads as nothing saved', $prefsOf(null), []],
    ['an empty userprefs.cfg reads as nothing saved', $prefsOf(''), []],
    ['userprefs.cfg values come back in file order', $prefsOf($userprefs(['b', 'folder-x', '010', 'a'])), ['b', 'folder-x', '010', 'a']],
    ['a userprefs.cfg cut off mid-line is not "nothing saved"', $prefsOf($cutOff), null],
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
        $sync($fixture['folders'], $fixture['containers'], $userprefs($fixture['prefs']), $wait($fixture['containers'])), $wait($containersOf($fixture['autostart']))],
    ['syncContainerOrder: a container that does not autostart stays out, a removed one\'s line goes',
        $sync($fixture['folders'], $fixture['containers'], $userprefs($fixture['prefs']), ['ghost', 'alpha', 'z2']), ['z2', 'alpha']],
    ['syncContainerOrder: no userprefs.cfg writes A-Z',
        $sync([], ['b', 'a', 'c'], null, ['c', 'b 5', 'a']), ['a', 'b 5', 'c']],
    ['syncContainerOrder: a cut-off userprefs.cfg leaves the file as it is',
        $sync([], ['b', 'a', 'c'], $cutOff, ['c', 'ghost', 'b 5', 'a']), ['c', 'ghost', 'b 5', 'a']],
];
$failed = 0;
foreach ($cases as [$label, $got, $want]) {
    if ($got !== $want) { $failed++; echo "FAIL $label: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; }
}
$setPrefs(null);
array_map('unlink', ["$fv3tTmp/docroot/webGui/include/Helpers.php", "$fv3tTmp/docroot/plugins/dynamix.docker.manager/include/DockerClient.php",
    "$configDir/docker.json", "$fv3DockerManDir/dockerMan.cfg", $fv3tAutostart]);
echo count($cases) . " cases, $failed failed\n";
exit($failed ? 1 : 0);
