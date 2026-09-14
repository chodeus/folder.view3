<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_get_init();
    header('Content-Type: application/json');
    $type = fv3_validate_type($_GET['type'] ?? '');
    // Labels and the autostart tab are Docker concepts — no vm consumer exists
    if ($type !== 'docker') {
        http_response_code(400);
        echo json_encode(['error' => 'membership map is available for type=docker only']);
        exit;
    }
    global $configDir;
    // docker.json absent with the config dir present = no folders created yet, a real empty map.
    // The dir itself missing means the flash config is gone (unmounted) — never answer for that.
    if (!is_dir($configDir)) {
        http_response_code(503);
        echo json_encode(['error' => 'plugin config directory unavailable']);
        exit;
    }
    $folders = fv3_read_json_strict("$configDir/docker.json");
    if ($folders === null) {
        http_response_code(500);
        echo json_encode(['error' => 'docker.json is unreadable']);
        exit;
    }
    $dockerClient = new DockerClient();
    $ctNames = fv3_read_container_names($dockerClient);
    // An empty/partial container list must not 200 an empty map — the client would trust it
    // and skip its explicit-only fallback. Fail closed like the label read below.
    if (!$ctNames['complete']) {
        http_response_code(503);
        echo json_encode(['error' => 'container list read unavailable or incomplete']);
        exit;
    }
    $allContainerNames = $ctNames['names'];
    $ctLabels = fv3_read_container_labels($dockerClient, $allContainerNames);
    // Fail closed — the client keeps its explicit-only fallback rather than render half a map
    if ($ctLabels === null) {
        http_response_code(503);
        echo json_encode(['error' => 'container label read unavailable']);
        exit;
    }
    $m = fv3_compute_folder_membership($folders, $allContainerNames, $ctLabels);
    $out = [];
    foreach ($m['containers'] as $placeholder => $members) {
        foreach ($members as $ct) { $out[$ct] = $m['names'][$placeholder]; }
    }
    echo json_encode(['membership' => (object)$out]);
?>
