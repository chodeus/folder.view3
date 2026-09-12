<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    $id = fv3_post_string('id');
    // Any existing key stays deletable, including ids fv3_is_folder_id() refuses to write
    if ($id === '') {
        http_response_code(400);
        exit;
    }
    deleteFolder($type, $id);
?>
