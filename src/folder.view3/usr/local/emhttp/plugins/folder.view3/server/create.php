<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    $content = $_POST['content'] ?? null;
    // A non-string would throw on updateFolder()'s typed param instead of a 400
    if (!is_string($content)) {
        http_response_code(400);
        exit;
    }
    updateFolder($type, $content);
?>