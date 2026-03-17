<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $key = $_POST['key'] ?? '';
    $value = $_POST['value'] ?? '';
    updateSettings($key, $value);
?>