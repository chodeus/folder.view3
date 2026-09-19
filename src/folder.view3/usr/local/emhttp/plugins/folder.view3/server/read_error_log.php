<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    // No parameters: always the plugin's own fixed error.log, so there is no path to traverse.
    echo json_encode(['log' => fv3_read_error_log_tail()]);
?>
