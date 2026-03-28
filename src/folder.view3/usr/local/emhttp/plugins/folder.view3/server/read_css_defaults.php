<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    header('Content-Type: application/json');
    echo json_encode(readCssDefaults());
?>
