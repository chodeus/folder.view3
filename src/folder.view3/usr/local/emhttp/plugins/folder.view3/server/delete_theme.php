<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $entry = $_POST['entry'] ?? '';
    deleteTheme($entry);
?>
