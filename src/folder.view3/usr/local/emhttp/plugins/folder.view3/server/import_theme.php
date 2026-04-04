<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $repo = $_POST['repo'] ?? '';
    $path = $_POST['path'] ?? '';
    $branch = $_POST['branch'] ?? '';
    echo json_encode(importTheme($repo, $path, $branch));
?>
