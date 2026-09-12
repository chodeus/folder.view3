<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    $id = $_POST['id'] ?? '';
    $content = $_POST['content'] ?? null;
    // updateFolder() owns the id rule; non-strings would throw on its typed params instead of a 400
    if (!is_string($id) || !is_string($content)) {
        http_response_code(400);
        exit;
    }
    updateFolder($type, $content, $id);
?>
