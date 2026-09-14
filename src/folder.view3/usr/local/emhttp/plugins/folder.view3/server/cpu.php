<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    echo (int) shell_exec("cat /proc/cpuinfo | grep processor | wc -l");
?>