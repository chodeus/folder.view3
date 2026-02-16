<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    $styles = dirToArrayOfFiles(pathToMultiDimArray('/boot/config/plugins/folder.view3/styles'), "/\..*{$type}.*\.css$/", "/.*\.disabled$/");
    foreach ($styles as $style) {
        echo "<link rel=\"stylesheet\" href=\"";
        autov($style['path']);
        echo  "\">";
    }
?>