<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    // One reading in the dockerload feed's format, for the Dashboard when the API stream is missing.
    // Never an empty 200 on failure: the client would draw every container as stopped. timeout: a hung dockerd must not hold a worker
    exec("timeout 10 docker stats --no-stream --format='{{.ID}};{{.CPUPerc}};{{.MemUsage}}' 2>/dev/null", $lines, $rc);
    if ($rc !== 0) {
        http_response_code(503);
        exit;
    }
    header('Content-Type: text/plain; charset=utf-8');
    echo implode("\n", $lines);
?>
