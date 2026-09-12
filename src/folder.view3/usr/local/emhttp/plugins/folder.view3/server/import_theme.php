<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $repo = fv3_post_string('repo');
    $path = fv3_post_string('path');
    $branch = fv3_post_string('branch');
    echo json_encode(importTheme($repo, $path, $branch));
?>
