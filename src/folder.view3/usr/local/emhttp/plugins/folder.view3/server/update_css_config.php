<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $config = fv3_post_string('config');
    if ($config === '') { http_response_code(400); echo 'Missing config'; exit; }
    updateCssConfig($config);
?>
