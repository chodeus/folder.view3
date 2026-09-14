<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    if(file_exists("$configDir/version")) {
        echo file_get_contents("$configDir/version");
    } else {
        echo '0.0.0';
    }
?>