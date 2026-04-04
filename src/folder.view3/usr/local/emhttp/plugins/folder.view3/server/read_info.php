<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');

    $cacheTtl = 5;
    $cacheFile = "/tmp/fv3_read_info_{$type}.json";
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
        readfile($cacheFile);
        exit;
    }

    $json = json_encode(readInfo($type));
    @file_put_contents($cacheFile, $json, LOCK_EX);
    @chmod($cacheFile, 0600);
    echo $json;
?>