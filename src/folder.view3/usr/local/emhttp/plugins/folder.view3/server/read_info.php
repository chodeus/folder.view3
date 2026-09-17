<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');

    // Deliberately uncached: a cache must mirror every input readInfo() reads or it serves stale data
    // Invalid UTF-8 in one container name or label is substituted so the rest of the page still loads
    try {
        $json = json_encode(readInfo($type), JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (\Throwable $e) {
        // A 200 carrying a partial map would read as "nothing is set to autostart"
        fv3_debug_log("read_info: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'Could not read the container autostart state']);
        exit;
    }
    if ($json === false) {
        fv3_debug_log("read_info: json_encode failed for type $type");
        $json = '{}';
    }
    echo $json;
?>
