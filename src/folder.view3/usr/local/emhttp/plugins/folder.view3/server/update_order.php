<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_POST['type'] ?? '');
    $names = $_POST['names'] ?? '';
    if (!is_string($names) || $names === '' || strlen($names) > 65536) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid names']);
        exit;
    }
    $entries = fv3_sanitize_order_entries(explode(';', $names));
    if ($entries === null || empty($entries)) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid names']);
        exit;
    }
    if (!saveOrderSnapshot($type, $entries)) {
        http_response_code(500);
        echo json_encode(['error' => 'snapshot write failed']);
        exit;
    }
    echo json_encode(['success' => true]);
?>
