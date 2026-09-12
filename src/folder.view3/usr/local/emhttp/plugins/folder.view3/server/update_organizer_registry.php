<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $folders = json_decode(fv3_post_string('folders', '[]'), true);
    if (!is_array($folders)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid payload']);
        exit;
    }
    echo json_encode(['success' => updateOrganizerRegistry($folders)]);
?>
