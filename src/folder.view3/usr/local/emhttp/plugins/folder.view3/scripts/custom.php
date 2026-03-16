<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $baseDir = realpath('/boot/config/plugins/folder.view3/scripts');
    $scripts = dirToArrayOfFiles(pathToMultiDimArray('/boot/config/plugins/folder.view3/scripts'), "/\..*{$type}.*\.js$/", "/.*\.disabled$/");
    foreach ($scripts as $script) {
        $resolved = realpath($script['path']);
        if ($resolved === false || $baseDir === false || strpos($resolved, $baseDir . '/') !== 0) { continue; }
        echo "<script src=\"";
        autov($resolved);
        echo "\"></script>";
    }
?>
