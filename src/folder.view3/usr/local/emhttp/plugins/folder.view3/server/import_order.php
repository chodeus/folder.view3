<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    // After a Docker folder import: `ids` = the new folders in the file's order, placed on top of the saved order. The folders are saved
    // either way: an order that could not be placed comes back as `order_warning`, a start-order sync that stopped as `warning`
    $ids = json_decode(fv3_post_string('ids'), true);
    if (!is_array($ids) || !array_is_list($ids) || array_filter($ids, fn($id) => !is_string($id) || !fv3_is_folder_id($id))) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid ids']);
        exit;
    }
    $result = ['success' => true];
    $orderFailed = fv3_place_imported_docker_folders(array_map(fn($id) => "folder-$id", $ids));
    if ($orderFailed !== null) $result['order_warning'] = $orderFailed;
    $syncFailed = syncContainerOrder('docker');
    if ($syncFailed !== null) $result['warning'] = $syncFailed;
    echo json_encode($result);
?>
