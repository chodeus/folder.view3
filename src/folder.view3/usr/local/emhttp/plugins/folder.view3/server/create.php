<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    fv3_ok(['id' => updateFolder($type, fv3_post_string('content'))]);
?>