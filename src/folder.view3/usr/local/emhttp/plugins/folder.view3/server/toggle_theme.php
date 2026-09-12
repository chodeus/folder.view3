<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $entry = fv3_post_string('entry');
    // Anything but "true"/"false" is a malformed request, not a silent disable
    $enable = fv3_post_string('enable');
    if ($enable !== 'true' && $enable !== 'false') {
        http_response_code(400);
        exit;
    }
    toggleTheme($entry, $enable === 'true', true);
?>
