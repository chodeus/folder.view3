<?php
    $loc = substr($_SESSION['locale'] ?? '', 0, 2);
    // Only a shipped pack is requested: an unsupported locale would 404 and skip the translate pass that runs once the pack loads
    if ($loc === '' || !is_file((($_SERVER['DOCUMENT_ROOT'] ?? '') ?: '/usr/local/emhttp') . "/plugins/folder.view3/langs/$loc.json")) { $loc = 'en'; }
    // Display Settings' number format (decimal mark first), as Unraid's Docker page reads it
    $fv3Number = is_array($display ?? null) && !empty($display['number']) ? (string)$display['number'] : '.,';
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
    // A value as a JavaScript string literal inside an inline on*= handler: the browser decodes HTML entities
    // before parsing the attribute as JS, so the JSON form is escaped whole and supplies its own quotes
    window.fv3JsArg = (v) => escapeHtml(JSON.stringify(String(v ?? '')));
    window.fv3DecimalPoint = <?= json_encode(substr($fv3Number, 0, 1)) ?>;
    // Shared by every FV3 page: $.i18n returns the key itself until the pack loads, so fall back to English with $n filled in
    window.fv3I18nOr = (key, fallback, ...args) => {
        const s = $.i18n(key, ...args);
        return s && s !== key ? s : fallback.replace(/\$(\d+)/g, (m, n) => (args[n - 1] !== undefined ? args[n - 1] : m));
    };
    // The server's JSON error when it sent one, else the HTTP status (HTTP/2 carries no status text)
    window.fv3FailReason = (err) => err?.responseJSON?.error || (err?.status ? 'HTTP ' + err.status : err?.statusText || err?.message || fv3I18nOr('unknown-error', 'Unknown error'));
    // True when a POST to the plugin's server never reached it: no X-FV3-Answer header (fv3_post_init), and either a success that is
    // not JSON (Unraid's empty 200 for a stale csrf_token before 7.4, or its login page) or 7.4's own 403 for that token
    window.fv3NotPluginAnswer = (status, marker, body) => {
        if (marker) return false;
        let json;
        try { json = JSON.parse(body); } catch (e) { return status >= 200 && status < 300; }
        return status === 403 && /csrf_token$/.test(json?.error || '');
    };
    window.fv3DroppedAnswer = () => ({ error: fv3I18nOr('request-dropped', 'Unraid did not accept the request. Reload the page and try again.') });
    // $.post to the plugin's server then fails with that reason, marked fv3Dropped; fetch callers get it as the 403 Unraid 7.4 answers.
    // Out of reach here: jQuery's global ajaxSuccess event and a statusCode[200] option still fire for such a POST
    $.ajaxPrefilter((options, originalOptions, jqXHR) => {
        if (options.type?.toUpperCase() !== 'POST' || !options.url?.includes('/plugins/folder.view3/server/')) return;
        const answered = $.Deferred();
        const dropped = (xhr) => fv3NotPluginAnswer(xhr.status, xhr.getResponseHeader('X-FV3-Answer'), xhr.responseText);
        jqXHR.done(function(data, status, xhr) {
            if (!dropped(xhr)) { answered.resolveWith(this, arguments); return; }
            xhr.fv3Dropped = true;
            xhr.responseJSON = fv3DroppedAnswer();
            // jQuery counts it a success, so debug.js's ajaxError hook never sees it
            if (window.fv3RecordFailure) fv3RecordFailure('POST', options.url, xhr.status, 'not answered by the plugin', '');
            answered.rejectWith(this, [xhr, 'error', 'not answered by the plugin']);
        }).fail(function(xhr) {
            // jQuery's own parse failure (dataType json) of such an answer, and Unraid 7.4's 403, are the same drop
            if (dropped(xhr)) { xhr.fv3Dropped = true; xhr.responseJSON = fv3DroppedAnswer(); }
            answered.rejectWith(this, arguments);
        });
        // from here every handler, the caller's included, hangs off `answered`
        answered.promise(jqXHR);
    });
    window.fv3FetchAnswer = async (resp) => {
        if (resp.headers.get('X-FV3-Answer') || !fv3NotPluginAnswer(resp.status, null, await resp.clone().text())) return resp;
        if (window.fv3RecordFailure) fv3RecordFailure('POST', resp.url, resp.status, 'not answered by the plugin', '');
        return new Response(JSON.stringify(fv3DroppedAnswer()), { status: 403 });
    };
    // switchButton labels in the pack's words, upper-cased like the English OFF/ON
    window.fv3SwitchLabels = () => ({ off_label: fv3I18nOr('off', 'Off').toUpperCase(), on_label: fv3I18nOr('on', 'On').toUpperCase() });
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
    // Wait for the pack AND DOM ready: pages define their own folderi18n in a later <script>, so a
    // cached pack resolves first and calls the stub. Failure stays a no-op — .i18n() with no messages shows raw keys.
    ?>).then(() => $(() => folderi18n()), () => {});
</script>