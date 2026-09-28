<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    // updateSettings() owns the rules for every key, free-form ones included
    updateSettings(fv3_post_string('key'), fv3_post_string('value'));
?>