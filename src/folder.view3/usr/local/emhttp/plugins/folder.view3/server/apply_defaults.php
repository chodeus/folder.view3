<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    applyFolderDefaults($type, fv3_post_required('settings'));
    fv3_ok();
?>
