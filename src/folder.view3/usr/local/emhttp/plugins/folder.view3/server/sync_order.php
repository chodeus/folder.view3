<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    $failed = syncContainerOrder($type);
    // folder.js and folderview3.js warn that the save went through but the start order did not
    if ($failed !== null) {
        http_response_code(503);
        header('Content-Type: application/json');
        echo json_encode(['error' => $failed]);
        exit;
    }
    fv3_ok();
?>
