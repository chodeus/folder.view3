<?php
// php .github/scripts/page_order_test.php [plugin-dir] — fv3_page_order(): the order syncContainerOrder() writes the autostart file in.
// The fixture's order is what docker.js draws; docker_new_folder_order_test.js holds the page to the same file.
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-page-order-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time
foreach (['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => '<?php class DockerClient {} class DockerUpdate {}'] as $rel => $src) {
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
];
$failed = 0;
foreach ($cases as [$label, $got, $want]) {
    if ($got !== $want) { $failed++; echo "FAIL $label: got " . json_encode($got) . ', want ' . json_encode($want) . "\n"; }
}
array_map('unlink', ["$fv3tTmp/docroot/webGui/include/Helpers.php", "$fv3tTmp/docroot/plugins/dynamix.docker.manager/include/DockerClient.php"]);
echo count($cases) . " cases, $failed failed\n";
exit($failed ? 1 : 0);
