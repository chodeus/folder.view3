<?php
// Fake Docker from fixtures/docker.json (Engine API answers of throwaway containers): `serve` answers /var/run/docker.sock,
// `cli <args>` is the docker CLI. A request it does not know is logged as UNKNOWN and refused.
$d = json_decode((string)@file_get_contents(__DIR__ . '/../fixtures/docker.json'), true);
if (!is_array($d)) { fwrite(STDERR, "fixtures/docker.json is unreadable\n"); exit(2); }

function fv3d_log(string $line): void { file_put_contents('/var/log/fv3-fakes.log', "docker $line\n", FILE_APPEND | LOCK_EX); }

function fv3d_container(array $d, string $ref): ?array {
    foreach ($d['inspect'] as $ct) {
        if (ltrim($ct['Name'], '/') === ltrim($ref, '/') || (strlen($ref) >= 12 && str_starts_with($ct['Id'], $ref))) return $ct;
    }
    return null;
}

function fv3d_running(array $d): array { return array_values(array_filter($d['containers'], fn($c) => $c['State'] === 'running')); }

function fv3d_answer(array $d, string $method, string $target): array {
    $path = (string)parse_url($target, PHP_URL_PATH);
    parse_str((string)parse_url($target, PHP_URL_QUERY), $query);
    // Only `all` on the two lists is answered; a filter, any other parameter or all[] (Docker's key `all[]`, not `all`) is a
    // request this fake does not know
    $lists = in_array($path, ['/containers/json', '/images/json'], true);
    if ($method !== 'GET' || array_diff(array_keys($query), $lists ? ['all'] : []) || array_filter($query, 'is_array')) return [null, null];
    // Docker's httputils.BoolValue: empty, 0, no, false and none are false, any other value true
    $all = !in_array(strtolower(trim($query['all'] ?? '')), ['', '0', 'no', 'false', 'none'], true);
    if ($path === '/containers/json') return [200, $all ? $d['containers'] : fv3d_running($d)];
    if (preg_match('#^/containers/([^/]+)/json$#', $path, $m)) {
        $ct = fv3d_container($d, $m[1]);
        return $ct ? [200, $ct] : [404, ['message' => "No such container: {$m[1]}"]];
    }
    if ($path === '/images/json') return [200, $d['images']];
    if (preg_match('#^/images/(.+)/json$#', $path, $m)) {
        foreach ($d['image_inspect'] as $id => $img) {
            if ($m[1] === $id || in_array($m[1], $img['RepoTags'] ?? [], true)) return [200, $img];
        }
        return [404, ['message' => "No such image: {$m[1]}"]];
    }
    return [null, null];
}

// The docker CLI lines Unraid and FV3 run, answered in the CLI's own output format
function fv3d_cli(array $d, array $args): ?array {
    $format = null;
    foreach ($args as $i => $a) if (str_starts_with($a, '--format=')) { $format = substr($a, 9); unset($args[$i]); }
    $line = implode(' ', $args);
    if ($line === 'network ls' && $format === '{{.Name}}={{.Driver}}') return array_map(fn($n) => "{$n['Name']}={$n['Driver']}", $d['networks']);
    if ($line === 'ps -q --no-trunc') return array_column(fv3d_running($d), 'Id');
    if (preg_match('/^ps --filter label=(\S+) --format \{\{\.Names\}\}$/', $line, $m)) {
        return array_map(fn($c) => ltrim($c['Names'][0], '/'), array_values(array_filter(fv3d_running($d), fn($c) => isset($c['Labels'][$m[1]]))));
    }
    if ($line === 'stats --no-stream' && $format === '{{.ID}};{{.CPUPerc}};{{.MemUsage}}') {
        return array_map(fn($c) => substr($c['Id'], 0, 12) . ';0.50%;12.5MiB / 7.7GiB', fv3d_running($d));
    }
    if (preg_match('/^inspect (\S+)$/', $line, $m) && ($ct = fv3d_container($d, $m[1]))) {
        if ($format === '{{.Name}}') return [$ct['Name']];
        if (preg_match('/^\{\{range \.NetworkSettings\.Networks\}\}\{\{\.(IPAddress|GlobalIPv6Address)\}\} \{\{end\}\}$/', (string)$format, $f)) {
            return [implode('', array_map(fn($n) => ($n[$f[1]] ?? '') . ' ', $ct['NetworkSettings']['Networks']))];
        }
    }
    return null;
}

if (($argv[1] ?? '') === 'cli') {
    $args = array_slice($argv, 2);
    $out = fv3d_cli($d, $args);
    fv3d_log(($out === null ? 'UNKNOWN ' : '') . 'cli ' . implode(' ', $args));
    if ($out === null) exit(1);
    echo $out ? implode("\n", $out) . "\n" : '';
    exit(0);
}

if (($argv[1] ?? '') === 'serve') {
    // It replaces the host's Docker socket: only inside fake_unraid.sh's container
    if (!is_file('/.dockerenv') || !is_file('/var/run/fv3-fake-unraid')) { fwrite(STDERR, "docker.php serve runs only under fake_unraid.sh\n"); exit(2); }
    $sock = '/var/run/docker.sock';
    @unlink($sock);
    $server = stream_socket_server("unix://$sock", $errno, $errstr);
    if (!$server) { fwrite(STDERR, "docker.sock: $errstr\n"); exit(2); }
    chmod($sock, 0666);
    file_put_contents('/var/run/dockerd.pid', getmypid());
    while (true) {
        $conn = @stream_socket_accept($server, -1);
        if (!$conn) continue;
        $request = (string)fgets($conn);
        while (($line = fgets($conn)) !== false && rtrim($line) !== '');
        [$method, $target] = array_pad(explode(' ', trim($request)), 2, '');
        [$status, $body] = fv3d_answer($d, $method, $target);
        fv3d_log(($status === null ? 'UNKNOWN ' : '') . "socket $method $target");
        if ($status === null) [$status, $body] = [404, ['message' => 'page not found']];
        // One line of JSON with a length: DockerClient decodes the body line by line
        $json = json_encode($body, JSON_UNESCAPED_SLASHES) . "\n";
        fwrite($conn, "HTTP/1.1 $status " . ($status === 200 ? 'OK' : 'Not Found') . "\r\nContent-Type: application/json\r\nContent-Length: " . strlen($json) . "\r\nConnection: close\r\n\r\n$json");
        fclose($conn);
    }
}
fwrite(STDERR, "usage: docker.php serve | cli <docker arguments>\n");
exit(2);
