<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');

    $cacheTtl = 5;
    $cacheFile = "/tmp/fv3_read_info_{$type}.json";
    // '' when unavailable (VMs, or a failed Docker read) — then elapsed time alone gates the cache
    $fingerprint = $type === 'docker' ? fv3_docker_state_fingerprint() : '';
    // One record — fingerprint line then payload — so a concurrent writer can never pair one
    // request's fingerprint with another's payload. Every field comes from the open handle, never
    // the path: fv3_atomic_write() renames, so a path stat can describe a different file than $fh.
    $fh = @fopen($cacheFile, 'rb');
    if ($fh) {
        $stat = fstat($fh);
        $stored = rtrim((string)fgets($fh), "\n");
        if ((time() - $stat['mtime']) < $cacheTtl && $stored === $fingerprint && ($stat['size'] - ftell($fh)) > 2) {
            fpassthru($fh);
            fclose($fh);
            exit;
        }
        fclose($fh);
    }

    $data = readInfo($type);
    $json = json_encode($data);
    // Never cache an encode failure (invalid UTF-8 in a name/label) or an empty read (Docker blip):
    // 5s of an empty payload renders every folder with no containers.
    if ($json !== false && !empty($data)) {
        fv3_atomic_write($cacheFile, $fingerprint . "\n" . $json, 0600);
    } else {
        fv3_debug_log("read_info: not caching (encode=" . ($json === false ? 'FAILED' : 'ok') . ", entries=" . count((array)$data) . ")");
    }
    echo $json === false ? '{}' : $json;
?>