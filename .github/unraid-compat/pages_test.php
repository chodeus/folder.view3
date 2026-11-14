<?php
// FV3 through the Unraid webGUI fake_unraid.sh serves: Unraid's lists, FV3's reads and CSRF-checked writes, its pages in 4 themes
// and the files they link. A warning from FV3's files fails; 7.0 and 7.1 log a .page's inline PHP without the page's name.
if (!is_file('/.dockerenv') || !is_file('/var/run/fv3-fake-unraid')) { fwrite(STDERR, "Run pages_test.sh: this needs the container fake_unraid.sh set up\n"); exit(2); }
$version = $argv[1] ?? '?';
$failures = [];
$checks = 0;
function check(bool $ok, string $what): void { global $failures, $checks; $checks++; if (!$ok) $failures[] = $what; }

// One request to the fake Unraid: [status, body, lower-cased response headers]; a POST carries Unraid's token unless told not to
function req(string $method, string $path, array $fields = [], ?string $token = 'compat-test-token'): array {
    $headers = [];
    $ch = curl_init("http://127.0.0.1$path");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60, CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$headers) {
            if (str_contains($line, ':')) { [$k, $v] = explode(':', $line, 2); $headers[strtolower(trim($k))] = trim($v); }
            return strlen($line);
        }]);
    if ($method === 'POST') curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($fields + ($token === null ? [] : ['csrf_token' => $token])));
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return [$status, (string)$body, $headers];
}

// What one .page file put on the page: Unraid opens each file's part, in the head and again in the body, with a comment naming
// it; a part ends at the next one, at </head> or at the footer
function fv3t_page_part(string $html, string $file): string {
    preg_match_all('/<!--\s*#+\s*(\S+\.page)\s*#+\s*-->/', $html, $marks, PREG_OFFSET_CAPTURE);
    preg_match_all('#</head>|id="footer"#', $html, $ends, PREG_OFFSET_CAPTURE);
    $bounds = array_merge(array_column($marks[0], 1), array_column($ends[0], 1), [strlen($html)]);
    sort($bounds);
    $part = '';
    foreach ($marks[0] as $i => [$mark, $at]) {
        if ($marks[1][$i][0] !== $file) continue;
        $from = $at + strlen($mark);
        $to = current(array_filter($bounds, fn($b) => $b >= $from));
        $part .= substr($html, $from, $to - $from);
    }
    return $part;
}

function get_json(string $path, ?int &$status = null) {
    [$status, $body] = req('GET', "/plugins/folder.view3/server/$path");
    return json_decode($body, true);
}

$flash = '/boot/config/plugins/folder.view3';
$media = 'MediaAbCdEfGhIjKlMnO';
$tools = 'ToolsPqRsTuVwXyZaBcD';
$lab = 'LabFoldAbCdEfGhIjKlM';
$containers = ['app-a', 'app-b', 'app-d', 'tool-c'];
$vms = ['Debian 12', 'Home Assistant', 'Windows 11'];
$fixture = json_decode(file_get_contents(__DIR__ . '/fixtures/docker.json'), true);
$shortId = fn(string $name) => substr($fixture['inspect'][$name]['Id'], 0, 12);
$sorted = function (array $a): array { sort($a); return $a; };

// Unraid's own lists, which FV3's pages fold into folders
[$status, $body] = req('GET', '/plugins/dynamix.docker.manager/include/DockerContainers.php');
check($status === 200 && substr_count($body, "<tr class='sortable'>") === 4, "Docker list: status $status, " . substr_count($body, "<tr class='sortable'>") . ' container rows, not 4');
foreach ($containers as $ct) check(str_contains($body, $ct), "Docker list has no row for $ct");
[$status, $body] = req('GET', '/plugins/dynamix.vm.manager/include/VMMachines.php');
check($status === 200 && preg_match_all("/<tr parent-id='\d+' class='sortable'>/", $body) === 3, "VM list: status $status, not 3 VM rows");
foreach ($vms as $vm) check(str_contains($body, $vm), "VM list has no row for $vm");
[$status, $body] = req('POST', '/webGui/include/DashboardApps.php', ['docker' => 1, 'vms' => 1, 'vmusage' => 'N']);
foreach (array_merge($containers, $vms) as $name) check($status === 200 && str_contains($body, $name), "Dashboard tiles: status $status, no tile for $name");

// FV3's reads, each answered from what Unraid's own code got from Docker and libvirt
$info = get_json('read_info.php?type=docker', $status);
check($status === 200 && is_array($info) && $sorted(array_keys($info)) === $containers, "read_info docker: status $status, containers " . json_encode(is_array($info) ? array_keys($info) : $info));
if (is_array($info) && $sorted(array_keys($info)) === $containers) {
    check($info['app-a']['info']['State']['Autostart'] === true && $info['app-d']['info']['State']['Autostart'] === true && $info['app-b']['info']['State']['Autostart'] === false,
        'read_info docker: autostart not app-a and app-d only');
    check(str_ends_with($info['app-a']['info']['State']['WebUi'], ':18080/'), "read_info docker: app-a WebUI {$info['app-a']['info']['State']['WebUi']} does not reach host port 18080");
    check(($info['app-a']['info']['template']['path'] ?? '') === '/boot/config/plugins/dockerMan/templates-user/my-app-a.xml', 'read_info docker: app-a lost its template');
    check($info['tool-c']['info']['State']['Running'] === false && $info['app-b']['info']['State']['Running'] === true, 'read_info docker: running states wrong');
    check($info['app-d']['shortId'] === $shortId('app-d'), 'read_info docker: app-d short id wrong');
}
$info = get_json('read_info.php?type=vm', $status);
check($status === 200 && is_array($info) && $sorted(array_keys($info)) === $vms, "read_info vm: status $status, VMs " . json_encode(is_array($info) ? array_keys($info) : $info));
if (is_array($info) && $sorted(array_keys($info)) === $vms) {
    $seen = array_map(fn($v) => [$v['state'], $v['autostart'], $v['icon'], $v['vnc_port']], $info);
    check($seen === [
        'Debian 12' => ['running', 1, '/plugins/dynamix.vm.manager/templates/images/debian.png', '5700'],
        'Windows 11' => ['shutoff', false, '/plugins/dynamix.vm.manager/templates/images/windows11.png', ''],
        'Home Assistant' => ['paused', 1, '/plugins/dynamix.vm.manager/templates/images/linux.png', '5701'],
    ], 'read_info vm: state, autostart, icon or VNC port wrong: ' . json_encode($seen));
    check($info['Debian 12']['description'] === 'Debian 12 lab server', 'read_info vm: description lost');
}
check(get_json('read_unraid_order.php?type=docker', $status) === ['app-a', 'app-b', 'tool-c', 'app-d'] && $status === 200, 'read_unraid_order docker: not the saved order');
check(get_json('read_unraid_order.php?type=vm', $status) === ['Debian 12', 'Home Assistant', 'Windows 11'] && $status === 200, 'read_unraid_order vm: not the saved order');
$membership = get_json('read_membership.php?type=docker', $status);
check($status === 200 && ($membership['membership'] ?? null) === ['app-a' => 'Media', 'app-b' => 'Media', 'tool-c' => 'Tools'],
    "read_membership: status $status, " . json_encode($membership));
[$status, $body] = req('GET', '/plugins/folder.view3/server/docker_load.php');
$load = explode("\n", trim($body));
sort($load);
$want = array_map(fn($n) => $shortId($n) . ';0.50%;12.5MiB / 7.7GiB', ['app-a', 'app-b', 'app-d']);
sort($want);
check($status === 200 && $load === $want, "docker_load: status $status, " . json_encode($load));
$image = array_key_first($fixture['image_inspect']);
$env = get_json('read_image_env.php?image=' . urlencode($image), $status);
check($status === 200 && $env === ['env' => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin']], "read_image_env: status $status, " . json_encode($env));
$folders = get_json('read.php?type=docker', $status);
check($status === 200 && array_keys((array)$folders) === [$media, $tools], 'read docker: ' . json_encode($folders));
$folders = get_json('read.php?type=vm', $status);
check($status === 200 && ($folders[$lab]['containers'] ?? null) === ['Debian 12'], 'read vm: ' . json_encode($folders));
$autostart = get_json('read_autostart.php', $status);
check($status === 200 && ($autostart['autostart'] ?? null) === [['name' => 'app-a', 'wait' => 0], ['name' => 'app-d', 'wait' => 10]], 'read_autostart: ' . json_encode($autostart));
foreach (['read_order.php?type=docker', 'read_order.php?type=vm', 'read_settings.php', 'list_themes.php', 'read_css_config.php', 'read_css_defaults.php',
    'read_error_log.php', 'read_organizer_registry.php', 'export_all.php'] as $path) {
    [$status, $body] = req('GET', "/plugins/folder.view3/server/$path");
    check($status === 200 && json_decode($body) !== null, "$path: status $status, not JSON: " . substr($body, 0, 200));
}
[$status, $body] = req('GET', '/plugins/folder.view3/server/version.php');
check($status === 200 && $body === '2099.01.01', "version: status $status, $body");
[$status, $body] = req('GET', '/plugins/folder.view3/server/cpu.php');
check($status === 200 && (int)$body > 0, "cpu: status $status, $body");

// FV3's pages in every theme: rendered whole, FV3's own section present, and every file it links served by this Unraid
$pages = [
    'Docker' => ['folder.view3.Docker.page', ['/plugins/folder.view3/scripts/docker.js', '/plugins/folder.view3/styles/docker.css']],
    'VMs' => ['folder.view3.VMs.page', ['/plugins/folder.view3/scripts/vm.js', '/plugins/folder.view3/styles/vm.css']],
    'Dashboard' => ['folder.view3.Dashboard.page', ['/plugins/folder.view3/scripts/dashboard.js', '/plugins/folder.view3/styles/dashboard.css']],
    'Settings/FolderView3' => ['FolderView3.page', ['/plugins/folder.view3/scripts/folderview3.js', '/plugins/folder.view3/styles/folderview3.css']],
    "Folder?type=docker&id=$media" => ['Folder.page', ['/plugins/folder.view3/scripts/folder.js', '/plugins/folder.view3/styles/folder.css']],
];
$served = [];
@mkdir('/boot/config/plugins/dynamix', 0777, true);
foreach (['black', 'white', 'azure', 'gray'] as $theme) {
    file_put_contents('/boot/config/plugins/dynamix/dynamix.cfg', "[display]\ntheme=\"$theme\"\n");
    foreach ($pages as $page => [$file, $needs]) {
        [$status, $html] = req('GET', "/$page");
        $where = "$page ($theme)";
        check($status === 200 && str_contains($html, '</html>'), "$where: status $status, page cut short");
        check(!preg_match('#Error evaluating content in plugins\\\\?/folder\.view3#', $html), "$where: Unraid caught an error in FV3's page");
        $part = fv3t_page_part($html, "plugins/folder.view3/$file");
        if ($part === '') {
            check(false, "$where: no part from $file");
            continue;
        }
        check(!str_contains($part, '{"error":"Internal error"}'), "$where: FV3's error answer inside the page");
        check(preg_match("#/webGui/styles/(?:themes/|default-)$theme\.css#", $html) === 1, "$where: Unraid's $theme stylesheet missing, so the theme was not applied");
        preg_match_all('#(?:src|href)="(/[^"?]+\.(?:js|css))(?:\?[^"]*)?"#', $part, $links);
        foreach ($needs as $need) check(in_array($need, $links[1], true), "$where: does not load $need");
        foreach (array_unique($links[1]) as $link) {
            $served[$link] ??= req('GET', $link)[0];
            check($served[$link] === 200, "$where: links $link, which this Unraid answers {$served[$link]}");
        }
    }
}
@unlink('/boot/config/plugins/dynamix/dynamix.cfg');

// Writes go through Unraid's CSRF check: without the token nothing is saved and FV3 never answers
$folder = fn(string $name, array $members) => json_encode(['name' => $name, 'icon' => '', 'regex' => '', 'containers' => $members, 'settings' => ['preview' => 1], 'actions' => []]);
$before = md5_file("$flash/docker.json");
foreach (['missing' => null, 'wrong' => 'not-the-token'] as $case => $token) {
    [$status, $body, $headers] = req('POST', '/plugins/folder.view3/server/create.php', ['type' => 'docker', 'content' => $folder('New', ['app-d'])], $token);
    check(md5_file("$flash/docker.json") === $before && !isset($headers['x-fv3-answer']), "create with the token $case: saved or answered by FV3 (status $status)");
}
$saved = fn(string $type) => json_decode(file_get_contents("$flash/$type.json"), true);
[$status, , $headers] = req('POST', '/plugins/folder.view3/server/create.php', ['type' => 'docker', 'content' => $folder('New', ['app-d'])]);
$new = array_values(array_diff(array_keys($saved('docker')), [$media, $tools]));
check($status === 200 && isset($headers['x-fv3-answer']) && count($new) === 1 && $saved('docker')[$new[0]]['containers'] === ['app-d'], "create: status $status, " . json_encode($saved('docker')));
[$status] = req('POST', '/plugins/folder.view3/server/update.php', ['type' => 'docker', 'id' => $media, 'content' => $folder('Media 2', ['app-a'])]);
check($status === 200 && $saved('docker')[$media]['name'] === 'Media 2', "update: status $status, " . json_encode($saved('docker')[$media] ?? null));
[$status] = req('POST', '/plugins/folder.view3/server/update.php', ['type' => 'vm', 'id' => $lab, 'content' => $folder('Lab 2', ['Debian 12'])]);
check($status === 200 && $saved('vm')[$lab]['name'] === 'Lab 2', "update vm: status $status, " . json_encode($saved('vm')[$lab] ?? null));
if ($new) {
    [$status] = req('POST', '/plugins/folder.view3/server/delete.php', ['type' => 'docker', 'id' => $new[0]]);
    check($status === 200 && array_keys($saved('docker')) === [$media, $tools], "delete: status $status, " . json_encode(array_keys($saved('docker'))));
}
[$status] = req('POST', '/plugins/folder.view3/server/update_settings.php', ['key' => 'dashboard_docker_layout', 'value' => 'classic']);
check($status === 200 && (json_decode((string)@file_get_contents("$flash/settings.json"), true)['dashboard_docker_layout'] ?? null) === 'classic', "update_settings: status $status");
[$status, $body] = req('POST', '/plugins/folder.view3/server/sync_order.php', ['type' => 'docker']);
check($status === 200 && json_decode($body) !== null, "sync_order: status $status, $body");

// What the runs left in the logs: FV3's files must log nothing, and neither fake was asked anything it does not know
// From 7.2 Unraid logs a .page's inline PHP as "in plugins/folder.view3/<file>.page", with no leading slash
$fv3Lines = preg_grep('#plugins/folder\.view3/#', file('/var/log/phplog', FILE_IGNORE_NEW_LINES));
check(!$fv3Lines, "PHP logged from FV3's files:\n  " . implode("\n  ", array_slice($fv3Lines, 0, 20)));
// php-error lines copy every warning of the request, Unraid's too, and name only the file's basename: the PHP log judges those
$errorLog = is_file("$flash/error.log") ? file("$flash/error.log", FILE_IGNORE_NEW_LINES) : [];
$reported = $errorLog === false ? ['error.log could not be read'] : preg_grep('/^\[[^]]+\] (?!php-error: )/', $errorLog);
check(!$reported, "FV3's error.log:\n  " . implode("\n  ", $reported));
$unknown = preg_grep('/UNKNOWN/', file('/var/log/fv3-fakes.log', FILE_IGNORE_NEW_LINES));
check(!$unknown, "the fakes were asked what they do not answer:\n  " . implode("\n  ", array_unique($unknown)));

if ($failures) {
    echo "FAILED [Unraid $version]: " . count($failures) . " of $checks checks\n- " . implode("\n- ", $failures) . "\n";
    exit(1);
}
echo "Unraid $version: Unraid's lists, FV3's reads and writes, and its pages in 4 themes passed ($checks checks)\n";
