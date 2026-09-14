<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $cfg = readAutostartConfig();
    $autoStartFile = fv3_autostart_file();
    $entries = [];
    if (file_exists($autoStartFile)) {
        foreach (@file($autoStartFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $parts = explode(' ', $line, 2);
            $entries[] = ['name' => $parts[0], 'wait' => isset($parts[1]) ? (int)trim($parts[1]) : 0];
        }
    }
    echo json_encode(['mode' => $cfg['mode'], 'sequence' => $cfg['sequence'], 'autostart' => $entries]);
?>
