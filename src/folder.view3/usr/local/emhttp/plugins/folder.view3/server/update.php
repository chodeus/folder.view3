<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $type = fv3_validate_type($_POST['type'] ?? '');
    // A missing id is refused (create.php is the endpoint that makes new folders); updateFolder() owns the rule for its value
    updateFolder($type, fv3_post_string('content'), fv3_post_required('id'));
?>
