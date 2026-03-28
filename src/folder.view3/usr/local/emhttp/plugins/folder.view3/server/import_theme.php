<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    header('Content-Type: application/json');
    $repo = $_POST['repo'] ?? '';
    $path = $_POST['path'] ?? '';
    echo json_encode(importTheme($repo, $path));
?>
