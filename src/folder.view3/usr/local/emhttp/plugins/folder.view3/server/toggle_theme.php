<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $entry = fv3_post_string('entry');
    $enable = ($_POST['enable'] ?? '') === 'true';
    toggleTheme($entry, $enable, true);
?>
