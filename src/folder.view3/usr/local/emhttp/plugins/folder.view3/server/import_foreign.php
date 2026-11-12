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
    // The folders are imported either way: a start-order sync that stopped comes back as `warning`
    if (!empty($result['success']) && isset($result['report']['types']['docker'])) {
        $syncFailed = syncContainerOrder('docker');
        if ($syncFailed !== null) $result['warning'] = $syncFailed;
    }
    echo json_encode($result);
?>
