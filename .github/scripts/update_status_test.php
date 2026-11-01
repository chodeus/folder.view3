<?php
// php .github/scripts/update_status_test.php [plugin-dir] — fv3_container_update_status(): a moved tag beats the saved status.
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-update-status-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time
$fv3tDockerStub = <<<'PHP'
<?php class DockerClient {}
class DockerUpdate {
    public $status = null;
    public function getUpdateStatus($image) { return $this->status; }
}
PHP;
foreach (['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => $fv3tDockerStub] as $rel => $src) {
    @mkdir(dirname("$fv3tTmp/docroot/$rel"), 0777, true);
    file_put_contents("$fv3tTmp/docroot/$rel", $src);
}
$_SERVER['DOCUMENT_ROOT'] = "$fv3tTmp/docroot";
require "$fv3tPlugin/server/lib.php";

$tag = 'ghcr.io/example/app:nightly';
$moved = 'sha256:141c253bc4c3fd0a201d32dc1f493bcf3fff003b6df416dea4f41046e0f37d47';
$ct = fn(string $listImage, string $mode = 'bridge') => ['Image' => $listImage, 'HostConfig' => ['NetworkMode' => $mode], 'info' => ['Config' => ['Image' => $tag]]];
$cache = fn(string $updated) => ['app' => ['updated' => $updated]];

$cases = [
    ['saved true, tag current', $ct($tag), $cache('true'), null, true],
    ['saved true, tag moved', $ct($moved), $cache('true'), null, false],
    ['saved false, tag current', $ct($tag), $cache('false'), null, false],
    ['saved false, tag moved', $ct($moved), $cache('false'), null, false],
    ['saved NULL stays unknown, tag moved', $ct($moved), $cache('NULL'), null, null],
    ['no saved row, tag status true, tag current', $ct($tag), [], true, true],
    ['no saved row, tag status true, tag moved', $ct($moved), [], true, false],
    ['no saved row, tag status unknown, tag moved', $ct($moved), [], null, null],
    ['digest-pinned stays as saved', $ct('ghcr.io/example/app@sha256:7b3c'), $cache('true'), null, true],
    ['rebuild ready beats everything', $ct($tag, 'container:???'), $cache('true'), null, false],
];
$failed = 0;
foreach ($cases as [$label, $container, $saved, $tagStatus, $want]) {
    $update = new DockerUpdate();
    $update->status = $tagStatus;
    $got = fv3_container_update_status($container, 'app', $saved, $update);
    if ($got !== $want) { $failed++; echo "FAIL $label: got " . var_export($got, true) . ', want ' . var_export($want, true) . "\n"; }
}
array_map('unlink', ["$fv3tTmp/docroot/webGui/include/Helpers.php", "$fv3tTmp/docroot/plugins/dynamix.docker.manager/include/DockerClient.php"]);
echo count($cases) . " cases, $failed failed\n";
exit($failed ? 1 : 0);
