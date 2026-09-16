<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');

    // Deliberately uncached: readInfo() costs ~17ms, and any cache has to mirror every input it
    // reads (container state, names, autostart, update status, templates) or it serves stale data.
    $json = json_encode(readInfo($type));
    if ($json === false) {
        // invalid UTF-8 in a container name or label — send an empty map rather than a blank body
        fv3_debug_log("read_info: json_encode failed for type $type");
        $json = '{}';
    }
    echo $json;
?>
