<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    // No parameters: always the plugin's own fixed error.log, so there is no path to traverse.
    $tail = fv3_read_error_log_tail();
    if ($tail === null) { http_response_code(500); echo json_encode(['error' => 'error.log exists but could not be read']); exit; }
    // A stray invalid byte in a logged message must not blank the whole response
    echo json_encode(['log' => $tail], JSON_INVALID_UTF8_SUBSTITUTE);
?>
