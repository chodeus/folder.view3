<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $type = fv3_validate_type($_POST['type'] ?? '');
    $id = $_POST['id'] ?? '';
    if (!empty($id) && !preg_match('/^[A-Za-z0-9+\/=]+$/', $id)) {
        $id = '';
    }
    updateFolder($type, $_POST['content'], $id);
?>
