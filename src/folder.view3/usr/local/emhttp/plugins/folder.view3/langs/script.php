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