<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    $data = $_POST['data'] ?? '{}';
    // A non-string would throw on updateFolderIds()'s typed param instead of a 400
    if (!is_string($data)) {
        http_response_code(400);
        exit;
    }
    updateFolderIds($type, $data);
?>
