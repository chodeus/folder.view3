<?php
// php .github/scripts/variables_tab_test.php [plugin-dir] — the advanced preview's server side: template extras, read_image_env.php, console shell
$fv3tPlugin = $argv[1] ?? dirname(__DIR__, 2) . '/src/folder.view3/usr/local/emhttp/plugins/folder.view3';
$fv3tTmp = realpath(sys_get_temp_dir()) . '/fv3-variables-test-' . bin2hex(random_bytes(4));

// lib.php requires these two Unraid host files at load time; getDockerJSON mirrors Unraid's: a dead socket echoes and leaves $code alone
$fv3tDockerStub = <<<'PHP'
<?php class DockerUpdate {}
class DockerClient {
    public function getDockerJSON($url, $method = 'GET', &$code = null, $callback = null, $unchunk = false, $headers = null) {
        $GLOBALS['fv3tUrls'][] = $url;
        if (!empty($GLOBALS['fv3tSocketDown'])) { echo "Couldn't create socket: [2] No such file or directory"; return []; }
        $code = $GLOBALS['fv3tCode'];
        return $GLOBALS['fv3tJSON'];
    }
}
PHP;
foreach (['webGui/include/Helpers.php' => '<?php', 'plugins/dynamix.docker.manager/include/DockerClient.php' => $fv3tDockerStub] as $rel => $src) {
    @mkdir(dirname("$fv3tTmp/docroot/$rel"), 0777, true);
    file_put_contents("$fv3tTmp/docroot/$rel", $src);
}
$_SERVER['DOCUMENT_ROOT'] = "$fv3tTmp/docroot";
require "$fv3tPlugin/server/lib.php";
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
function docker(array $json, $code = true, bool $socketDown = false): void {
    $GLOBALS['fv3tJSON'] = $json;
    $GLOBALS['fv3tCode'] = $code;
    $GLOBALS['fv3tSocketDown'] = $socketDown;
    $GLOBALS['fv3tUrls'] = [];
}
// Written the way Unraid's xmlFromPost() writes a template (dynamix.docker.manager Helpers.php)
function unraidTemplate(array $fields, array $configs): DOMDocument {
    $enc = fn($s) => htmlspecialchars($s, ENT_XML1, 'UTF-8');
    $xml = new SimpleXMLElement('<?xml version="1.0"?><Container version="2"></Container>');
    foreach ($fields as $tag => $value) $xml->$tag = $enc($value);
    foreach ($configs as $c) {
        $config = $xml->addChild('Config', $enc($c['value'] ?? ''));
        foreach (['Name', 'Target', 'Type', 'Mask'] as $attr) $config[$attr] = $enc($c[$attr] ?? '');
    }
    $doc = new DOMDocument();
    $doc->loadXML($xml->asXML());
    return $doc;
}

$params = '--label "a=b" -e X=1&2 <tag> \'q\'';
$doc = unraidTemplate(
    ['Name' => 'app', 'ExtraParams' => $params, 'PostArgs' => 'sh -c \'echo "&"\'', 'Support' => 'https://example.com/?a=1&b=2'],
    [
        ['Type' => 'Port', 'Target' => '8080', 'Name' => 'WebUI', 'value' => '8080'],
        ['Type' => 'Variable', 'Target' => 'APP_TOKEN', 'Name' => 'Token "x" & <y>', 'Mask' => 'true', 'value' => 'not-a-real-token'],
        ['Type' => 'Path', 'Target' => '/config', 'Name' => 'Config', 'value' => '/mnt/user/appdata/app'],
        ['Type' => 'Variable', 'Target' => 'MODE', 'Name' => 'Mode', 'Mask' => 'false', 'value' => 'demo'],
        ['Type' => 'Variable', 'Target' => '', 'Name' => 'No target', 'value' => 'x'],
        ['Type' => 'Variable', 'Target' => 'UPPER', 'Name' => 'Upper', 'Mask' => 'TRUE', 'value' => 'y'],
    ]
);
$extras = fv3_template_extras($doc);
check('Extra Parameters come back exactly as typed', $extras['extraParams'] === $params, $extras['extraParams']);
check('Post Arguments come back exactly as typed', $extras['postArgs'] === 'sh -c \'echo "&"\'', $extras['postArgs']);
check('only Variable entries with a target, in template order', array_column($extras['variables'], 'target') === ['APP_TOKEN', 'MODE', 'UPPER'], $extras['variables']);
check('a variable name comes back exactly as typed', $extras['variables'][0]['name'] === 'Token "x" & <y>', $extras['variables'][0]['name']);
check('Mask="true" is masked, "false" is not, any case', array_column($extras['variables'], 'mask') === [true, false, true], $extras['variables']);
check('an existing template field decodes too', fv3_template_tag($doc, 'Support') === 'https://example.com/?a=1&b=2', fv3_template_tag($doc, 'Support'));
check('a missing tag gives its default', fv3_template_tag($doc, 'TailscaleServe', 'no') === 'no' && fv3_template_tag($doc, 'ReadMe') === '');
$bare = fv3_template_extras(unraidTemplate(['Name' => 'bare'], []));
check('a template without extras gives empty values', $bare === ['extraParams' => '', 'postArgs' => '', 'variables' => []], $bare);

// Unraid 7.4's OpenTerminal.php refuses any console shell but sh and bash
foreach (['bash' => 'bash', 'sh' => 'sh', '/bin/bash' => 'bash', '/usr/bin/bash' => 'bash', '/bin/sh' => 'sh', ' bash ' => 'bash',
          'zsh' => 'zsh', '/bin/zsh' => '/bin/zsh', 'bash -l' => 'bash -l', '' => 'sh', '"\';' => 'sh', "bash');alert(1)//" => 'bashalert1//'] as $raw => $want) {
    check("console shell " . json_encode($raw) . " → $want", fv3_console_shell($raw) === $want, fv3_console_shell($raw));
}
check('no shell at all is sh', fv3_console_shell(null) === 'sh');

$id = 'sha256:' . str_repeat('ab', 32);
docker(['Config' => ['Env' => ['PATH=/usr/bin', 'EMPTY=', 7, 'ZERO=0']]]);
$env = fv3_read_image_env($id);
check('image env read from the image endpoint', $GLOBALS['fv3tUrls'] === ["/images/$id/json"], $GLOBALS['fv3tUrls']);
check('image env keeps strings, including empty and 0 values', $env === ['PATH=/usr/bin', 'EMPTY=', 'ZERO=0'], $env);
docker(['Config' => ['Env' => null]]);
check('an image without Env is an empty list', fv3_read_image_env($id) === []);
docker(['message' => 'No such image'], 'No such container');
check('a Docker error status is unreadable, not empty', fv3_read_image_env($id) === null);
docker([], null, true);
ob_start();
$down = fv3_read_image_env($id);
$printed = ob_get_clean();
check('a dead Docker socket is unreadable, not empty', $down === null);
check('a dead Docker socket prints nothing', $printed === '', $printed);

// The endpoint runs as its own process: it exits, and its require is an absolute Unraid path
$endpoint = "$fv3tTmp/read_image_env.php";
file_put_contents($endpoint, str_replace('/usr/local/emhttp/plugins/folder.view3/server/lib.php', "$fv3tPlugin/server/lib.php", file_get_contents("$fv3tPlugin/server/read_image_env.php")));
function endpoint($image, array $json = [], $code = true, bool $socketDown = false): array {
    global $endpoint, $fv3tTmp;
    $boot = '$_SERVER["DOCUMENT_ROOT"] = ' . var_export("$fv3tTmp/docroot", true) . '; $_SERVER["REQUEST_METHOD"] = "GET";'
        . ' $_GET = ' . var_export(['image' => $image], true) . ';'
        . ' $GLOBALS["fv3tJSON"] = ' . var_export($json, true) . '; $GLOBALS["fv3tCode"] = ' . var_export($code, true) . ';'
        . ' $GLOBALS["fv3tSocketDown"] = ' . var_export($socketDown, true) . '; $GLOBALS["fv3tUrls"] = [];'
        . ' register_shutdown_function(function () { fwrite(STDERR, json_encode(["status" => http_response_code() ?: 200, "urls" => $GLOBALS["fv3tUrls"]])); });'
        . ' include ' . var_export($endpoint, true) . ';';
    $proc = proc_open([PHP_BINARY, '-r', $boot], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $body = stream_get_contents($pipes[1]);
    $meta = json_decode(stream_get_contents($pipes[2]), true);
    proc_close($proc);
    return ['status' => $meta['status'] ?? null, 'urls' => $meta['urls'] ?? null, 'body' => $body, 'json' => json_decode($body, true)];
}
foreach ([['not an id', 'abc'], ['an array', ['x']], ['a trailing newline', "$id\n"], ['upper-case hex', strtoupper($id)], ['a short id', 'sha256:' . str_repeat('a', 12)]] as [$what, $bad]) {
    $r = endpoint($bad);
    check("endpoint refuses $what with 400 and no Docker call", $r['status'] === 400 && $r['urls'] === [] && isset($r['json']['error']), $r);
}
$r = endpoint($id, ['Config' => ['Env' => ['A=1', 'B=']]]);
check('endpoint answers 200 with the env list', $r['status'] === 200 && $r['json'] === ['env' => ['A=1', 'B=']], $r);
$r = endpoint($id, ['message' => 'No such image'], 'No such container');
check('endpoint answers 500 when Docker refuses', $r['status'] === 500 && isset($r['json']['error']), $r);
$r = endpoint($id, [], null, true);
check('endpoint answers 500 as clean JSON when the socket is dead', $r['status'] === 500 && isset($r['json']['error']) && !str_contains($r['body'], 'socket'), $r);

exec('rm -rf ' . escapeshellarg($fv3tTmp));
echo $fv3tFailed ? "\n$fv3tFailed FAILED\n" : "\nall passed\n";
exit($fv3tFailed ? 1 : 0);
