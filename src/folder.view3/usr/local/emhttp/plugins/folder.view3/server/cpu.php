<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    // Logical CPUs (docker's NCPU). Anchored: a VM's "model name : Common KVM processor" must not count
    echo (int) shell_exec("grep -c '^processor' /proc/cpuinfo");
?>