<?php
    if($_SESSION['locale'] == "") {
        $loc = 'en'; 
    } else {
        $loc = substr($_SESSION['locale'], 0, 2);
    }
?>
<script src="/plugins/folder.view3/scripts/include/CLDRPluralRuleParser.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.messagestore.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.fallbacks.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.language.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.parser.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.emitter.js"></script>
<script src="/plugins/folder.view3/scripts/include/jquery.i18n.emitter.bidi.js"></script>
<script>
    // Shared by every FV3 page: $.i18n returns the key itself until the pack loads, so fall back to English with $n filled in
    window.fv3I18nOr = (key, fallback, ...args) => {
        const s = $.i18n(key, ...args);
        return s && s !== key ? s : fallback.replace(/\$(\d+)/g, (m, n) => (args[n - 1] !== undefined ? args[n - 1] : m));
    };
    // The server's JSON error when it sent one, else the HTTP status (HTTP/2 carries no status text)
    window.fv3FailReason = (err) => err?.responseJSON?.error || (err?.status ? 'HTTP ' + err.status : err?.statusText || err?.message || 'Unknown error');
    if(typeof folderi18n === 'undefined' ) {
        folderi18n = () => {};
    }
    $.i18n({
        'locale': <?= json_encode($loc) ?>
    }).load(<?php
        // autov() versions each URL so an update's new keys aren't masked by a cached pack
        $packs = [];
        if ($loc != 'en') { $packs[$loc] = autov("/plugins/folder.view3/langs/$loc.json", true); }
        $packs['en'] = autov('/plugins/folder.view3/langs/en.json', true);
        echo json_encode($packs);
    ?>).then(folderi18n, ()=>{});
</script>