<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    $id = $_POST['id'] ?? '';
    // updateFolder() owns the id rule
    if (!is_string($id)) {
        http_response_code(400);
        exit;
    }
    updateFolder($type, $_POST['content'], $id);
?>
