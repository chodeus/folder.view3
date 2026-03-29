<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    header('Content-Type: application/json');
    $raw = $_POST['settings'] ?? '';
    $settings = json_decode($raw, true);
    if (!is_array($settings)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid request']);
        exit;
    }
    updateSettingsBatch($settings);
    echo json_encode(['success' => true]);
?>
