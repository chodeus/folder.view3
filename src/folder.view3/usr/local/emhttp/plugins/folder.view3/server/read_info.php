<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');

    $cacheTtl = 5;
    $cacheFile = "/tmp/fv3_read_info_{$type}.json";
    clearstatcache(true, $cacheFile);
    // size guard: a 0-byte or '[]' cache file is a poisoned entry, never a real container list
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl && filesize($cacheFile) > 2) {
        readfile($cacheFile);
        exit;
    }

    $data = readInfo($type);
    $json = json_encode($data);
    // Never cache an encode failure (invalid UTF-8 in a name/label) or an empty read (Docker blip):
    // 5s of an empty payload renders every folder with no containers.
    if ($json !== false && !empty($data)) {
        @file_put_contents($cacheFile, $json, LOCK_EX);
        @chmod($cacheFile, 0600);
    } else {
        fv3_debug_log("read_info: not caching (encode=" . ($json === false ? 'FAILED' : 'ok') . ", entries=" . count((array)$data) . ")");
    }
    echo $json === false ? '{}' : $json;
?>