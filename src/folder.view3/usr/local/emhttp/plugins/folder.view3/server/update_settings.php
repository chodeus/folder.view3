<?php
    require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");
    fv3_post_init();
    $key = $_POST['key'] ?? '';
    $value = $_POST['value'] ?? '';
    $freeformKeys = ['default_vertical_bars_color', 'default_border_color', 'default_separator_color', 'default_preview_text_width'];
    if (in_array($key, $freeformKeys, true)) {
        updateSettingsFreeform($key, $value);
    } else {
        updateSettings($key, $value);
    }
?>