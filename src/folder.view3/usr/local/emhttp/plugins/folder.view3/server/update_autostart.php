<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $mode = fv3_post_string('mode');
    $sequence = json_decode(fv3_post_required('sequence'), true);
    $waits = json_decode(fv3_post_string('waits', '{}'), true);
    if (!is_array($sequence) || !is_array($waits)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid payload']);
        exit;
    }
    // Waits are cast downstream, and (int)[1] is 1 while (int)[] is 0 — a non-int must never become a wait
    foreach ($waits as $wait) {
        if (!is_int($wait) || $wait < 0 || $wait > 3600) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid payload']);
            exit;
        }
    }
    $result = updateAutostartConfig($mode, $sequence, $waits);
    if (isset($result['error'])) http_response_code(400);
    echo json_encode($result);
?>
