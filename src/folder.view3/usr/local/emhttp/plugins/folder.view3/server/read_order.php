<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $type = fv3_validate_type($_GET['type'] ?? '');
    echo readUserPrefs($type);
?>