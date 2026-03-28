<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $entry = $_POST['entry'] ?? '';
    $enable = ($_POST['enable'] ?? '') === 'true';
    toggleTheme($entry, $enable, true);
?>
