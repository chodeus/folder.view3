<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');

    // Deliberately uncached: readInfo() costs ~17ms, and any cache has to mirror every input it
    // reads (container state, names, autostart, update status, templates) or it serves stale data.
    // Invalid UTF-8 in one container name or label substitutes that string, so the rest of the page still loads
    $json = json_encode(readInfo($type), JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        fv3_debug_log("read_info: json_encode failed for type $type");
        $json = '{}';
    }
    echo $json;
?>
