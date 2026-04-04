<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $json = $_POST['bundle'] ?? '';
    if ($json === '') { http_response_code(400); echo json_encode(['error' => 'Missing bundle']); exit; }
    echo json_encode(importAll($json));
?>
