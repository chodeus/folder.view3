<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $type = fv3_validate_type($_POST['type'] ?? '');
    deleteFolder($type, $_POST['id']);
?>