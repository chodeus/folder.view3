<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $image = $_GET['image'] ?? '';
    // Only an id as /containers/json reports it reaches the Docker API path; \z, as $ would let a trailing newline through
    if (!is_string($image) || !preg_match('/^sha256:[0-9a-f]{64}\z/', $image)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid image id']);
        exit;
    }

    try {
        $env = fv3_read_image_env($image);
        if ($env === null) fv3_error_log('read_image_env', "image=$image: unreadable");
    } catch (\Throwable $e) {
        fv3_error_log('read_image_env', get_class($e) . ': ' . $e->getMessage());
        $env = null;
    }
    $json = $env === null ? false : json_encode(['env' => $env], JSON_INVALID_UTF8_SUBSTITUTE);
    // Never a 200 here: the tab would read an empty list as "this image sets nothing"
    if ($json === false) {
        if ($env !== null) fv3_error_log('read_image_env', "image=$image: json_encode failed");
        http_response_code(500);
        echo json_encode(['error' => 'Could not read the image']);
        exit;
    }
    echo $json;
?>
