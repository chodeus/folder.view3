<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $baseDir = realpath('/boot/config/plugins/folder.view3/styles');
    $styles = dirToArrayOfFiles(pathToMultiDimArray('/boot/config/plugins/folder.view3/styles'), "/\..*{$type}.*\.css$/", "/.*\.disabled$/");
    foreach ($styles as $style) {
        $resolved = realpath($style['path']);
        if ($resolved === false || $baseDir === false || strpos($resolved, $baseDir . '/') !== 0) { continue; }
        echo "<link rel=\"stylesheet\" href=\"";
        autov($resolved);
        echo  "\">";
    }
?>
