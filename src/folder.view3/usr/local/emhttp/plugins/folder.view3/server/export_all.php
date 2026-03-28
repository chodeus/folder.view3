<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="fv3-backup-' . date('Y-m-d') . '.json"');
    echo json_encode(exportAll(), JSON_PRETTY_PRINT);
?>
