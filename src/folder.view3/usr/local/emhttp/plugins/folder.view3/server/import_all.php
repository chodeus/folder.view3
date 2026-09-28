<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    header('Content-Type: application/json');
    $json = fv3_post_string('bundle');
    if ($json === '') { http_response_code(400); echo json_encode(['error' => 'Missing bundle']); exit; }
    $result = importAll($json);
    // A refused restore answers 200 with an error field, so it is logged here rather than at a 500 site
    if (isset($result['error'])) fv3_error_log('import_all', $result['error']);
    echo json_encode($result);
?>
