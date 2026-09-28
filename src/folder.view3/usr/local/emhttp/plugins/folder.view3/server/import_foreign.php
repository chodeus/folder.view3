<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $action = fv3_post_string('action');
    if (!in_array($action, ['preview', 'apply'], true)) { http_response_code(400); exit; }
    // Per-type buttons send docker|vm; Import Everything sends nothing and takes every type in the file
    $rawType = fv3_post_string('type');
    $type = $rawType === '' ? null : fv3_validate_type($rawType);
    $result = importForeignBundle(fv3_post_string('bundle'), $type, $action === 'apply');
    if (!empty($result['success']) && isset($result['report']['types']['docker'])) syncContainerOrder('docker');
    echo json_encode($result);
?>
