<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    // A missing or non-string id is refused; any existing key stays deletable, '' and ids fv3_is_folder_id() refuses included
    if (!array_key_exists('id', $_POST)) {
        http_response_code(400);
        exit;
    }
    deleteFolder($type, fv3_post_string('id'));
?>
