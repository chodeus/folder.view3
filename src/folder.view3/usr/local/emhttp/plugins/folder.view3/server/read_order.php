<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');
    echo readUserPrefs($type);
?>