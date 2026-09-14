<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $bundle = exportAll();
    if (isset($bundle['error'])) { http_response_code(500); }
    echo json_encode($bundle, JSON_PRETTY_PRINT);
?>
