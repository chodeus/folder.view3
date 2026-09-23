// FolderView3 debug system, loaded by every page (tabs, folder editor, settings) ahead of the page script.

window.FV3_DEBUG = (() => { try { return localStorage.getItem('fv3-debug') === 'true'; } catch (e) { return false; } })();

// Masks secret-shaped values in query, JSON, header and URL-userinfo form. Mirrors fv3_redact()
// in server/lib.php — keep the two pattern lists identical.
window.fv3RedactString = function(s) {
    try {
        return String(s)
            .replace(/((?:token|api[_-]?key|key|secret|password|passwd|pass|auth|authorization|credential)=)[^&\s"'\\]+/gi, '$1[redacted]')
            .replace(/("[^"\\]*(?:token|api[_-]?key|secret|password|passwd|authorization|credential|private[_-]?key|access[_-]?key)[^"\\]*"\s*:\s*")(?:[^"\\]|\\.)*(")/gi, '$1[redacted]$2')
            .replace(/((?:authorization|x-api-key|x-auth-token|cookie|set-cookie)\s*:\s*)[^\r\n"'\\]+/gi, '$1[redacted]')
            .replace(/(:\/\/)[^\/\s@"'\\]+@/g, '$1[redacted]@');
    } catch (_) { return String(s); }
};

// Timestamped trace ring buffer: records only while debug mode is armed, from script init on.
window.FV3_TRACE_MAX = 600;
window.fv3TraceBuffer = [];
window.fv3Trace = function(level, context) {
    if (!window.FV3_DEBUG) return;
    try {
        var rest = Array.prototype.slice.call(arguments, 2);
        window.fv3TraceBuffer.push({
            t: Math.round((typeof performance !== 'undefined' && performance.now ? performance.now() : 0) * 10) / 10,
            level: level,
            ctx: context,
            msg: fv3RedactString(rest.map(function(a) {
                if (a instanceof Error) return a.message;
                if (a && typeof a === 'object') { try { return JSON.stringify(a); } catch (_) { return String(a); } }
                return String(a);
            }).join(' ')).slice(0, 500)
        });
        if (window.fv3TraceBuffer.length > window.FV3_TRACE_MAX) window.fv3TraceBuffer.shift();
    } catch (_) {}
};

window.fv3MakeLogger = function(level, sink) {
    return function(context) {
        var rest = Array.prototype.slice.call(arguments, 1);
        window.fv3Trace.apply(null, [level, context].concat(rest));
        sink.apply(console, ['[FV3] ' + context + ':'].concat(rest));
    };
};

window.fv3Debug = FV3_DEBUG ? fv3MakeLogger('log', console.log) : function() {};
window.fv3DebugWarn = FV3_DEBUG ? fv3MakeLogger('warn', console.warn) : function() {};

window.fv3Error = function(context, error) {
    window.fv3Trace('error', context, error);
    console.error('[FV3 ERROR] ' + context + ':', error);
};

// Render milestones keyed by name so trace spam can't evict them: {first,last,count} in performance.now() ms.
window.fv3Milestones = {};
window.fv3Mark = function(name) {
    if (!window.FV3_DEBUG) return;
    var t = Math.round((typeof performance !== 'undefined' && performance.now ? performance.now() : 0) * 10) / 10;
    var m = window.fv3Milestones[name];
    if (!m) window.fv3Milestones[name] = { first: t, last: t, count: 1 };
    else { m.last = t; m.count++; }
};
// Per-preview-icon load timestamps — when each icon actually finished, so icon-finish vs
// width-fix-run ordering (the decisive load-order race signal) is directly recoverable.
window.fv3IconLoads = [];
window.fv3RecordIconLoads = function(root) {
    if (!window.FV3_DEBUG || !root) return;
    root.querySelectorAll('img').forEach(function(img) {
        if (img._fv3LoadTracked) return;
        img._fv3LoadTracked = true;
        var src = img.currentSrc || img.src || '';
        var rec = function(ev) {
            if (window.fv3IconLoads.length > 200) return;
            window.fv3IconLoads.push({
                src: src.slice(0, 120),
                at: Math.round((typeof performance !== 'undefined' && performance.now ? performance.now() : 0) * 10) / 10,
                event: ev,
                cached: img.complete && img.naturalWidth > 0 && ev === 'attach'
            });
        };
        if (img.complete) rec('attach');
        else {
            img.addEventListener('load', function() { rec('load'); }, { once: true });
            img.addEventListener('error', function() { rec('error'); }, { once: true });
        }
    });
};

// Record when web fonts finish loading, so the trace can show whether they settled before
// or after the column width-fix ran (a late font swap reflows column widths after they lock).
try {
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
        document.fonts.ready.then(function() {
            window.fv3FontsReadyAt = Math.round((typeof performance !== 'undefined' && performance.now ? performance.now() : 0) * 10) / 10;
            window.fv3Mark('fonts-ready');
            window.fv3Trace('log', 'fonts', 'ready', window.fv3FontsReadyAt);
        });
    }
} catch (_) {}

// Uncaught page errors and rejections go into the trace buffer (recorded only while FV3_DEBUG is armed).
try {
    window.addEventListener('error', function(e) {
        var msg = (e && e.message) || 'error';
        // Chrome's benign "ResizeObserver loop" notice is counted, not traced, so it can't flood the buffer
        if (/ResizeObserver loop/i.test(msg)) { window._fv3ROLoopCount = (window._fv3ROLoopCount || 0) + 1; return; }
        window.fv3Trace('error', 'window.onerror', msg, (e && e.filename ? e.filename.split('/').pop() : '') + ':' + (e && e.lineno));
    });
    window.addEventListener('unhandledrejection', function(e) {
        var r = e && e.reason;
        window.fv3Trace('error', 'unhandledrejection', (r && r.message) || String(r));
    });
} catch (_) {}

// Tap console.warn/error into the trace buffer, only when debug is already armed; the original still runs.
if (window.FV3_DEBUG) {
    try {
        ['warn', 'error'].forEach(function(level) {
            var orig = console[level];
            if (typeof orig !== 'function' || orig._fv3Wrapped) return;
            var wrapped = function() {
                try { window.fv3Trace.apply(null, [level, 'console.' + level].concat(Array.prototype.slice.call(arguments))); } catch (_) {}
                return orig.apply(console, arguments);
            };
            wrapped._fv3Wrapped = true;
            console[level] = wrapped;
        });
    } catch (_) {}
}

(function() {
    var buffer = [];
    var trigger = 'fv3debug';
    document.addEventListener('keydown', function(e) {
        if (e.isComposing || e.key.length !== 1) return;
        buffer.push(e.key.toLowerCase());
        if (buffer.length > trigger.length) buffer.shift();
        if (buffer.join('') === trigger) {
            var newState = !FV3_DEBUG;
            localStorage.setItem('fv3-debug', newState);
            window.FV3_DEBUG = newState;
            window.fv3Debug = newState ? fv3MakeLogger('log', console.log) : function() {};
            window.fv3DebugWarn = newState ? fv3MakeLogger('warn', console.warn) : function() {};
            if (window.fv3SetDebugPill) window.fv3SetDebugPill(newState);
            console.log('[FV3] Debug mode ' + (newState ? 'ON' : 'OFF') + '. Reload page for the full render timeline.');
        }
    });
})();

// Capture pill: exists only while debug mode is armed; drag to move, click to download a snapshot.
window.fv3SetDebugPill = function(on) {
    var id = 'fv3-debug-pill';
    var existing = document.getElementById(id);
    if (!on) { if (existing) existing.remove(); return; }
    if (existing || !document.body) return;
    var pill = document.createElement('div');
    var LABEL = '↓ FV3 Debug — capture';
    pill.id = id;
    pill.textContent = LABEL;
    pill.title = 'FolderView3 debug. Drag to move. Click to download a snapshot of the current rendered state.';
    pill.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        'z-index:2147483647', 'padding:10px 16px', 'border-radius:20px',
        'background:rgba(255,90,0,0.95)', 'color:#fff', 'font:600 13px/1.2 sans-serif',
        'box-shadow:0 2px 12px rgba(0,0,0,0.45)', 'cursor:grab', 'user-select:none',
        'white-space:nowrap', 'border:1px solid rgba(255,255,255,0.55)'
    ].join(';');
    var moved = false;
    pill.addEventListener('mousedown', function(e) {
        moved = false;
        var sx = e.clientX, sy = e.clientY;
        var r = pill.getBoundingClientRect(), ox = r.left, oy = r.top;
        pill.style.transform = 'none'; pill.style.left = ox + 'px'; pill.style.top = oy + 'px';
        pill.style.cursor = 'grabbing'; e.preventDefault();
        function mv(ev) {
            if (Math.abs(ev.clientX - sx) > 4 || Math.abs(ev.clientY - sy) > 4) moved = true;
            pill.style.left = (ox + ev.clientX - sx) + 'px';
            pill.style.top = (oy + ev.clientY - sy) + 'px';
        }
        function up() { pill.style.cursor = 'grab'; document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); }
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
    });
    pill.addEventListener('click', function() {
        if (moved) { moved = false; return; }
        window.fv3CaptureDebug(window.fv3DebugSource).then(function() {
            pill.textContent = '✓ Saved — capture again';
        }).catch(function(e) {
            pill.textContent = '✕ Capture failed';
            fv3Error('pill', e);
        }).finally(function() {
            setTimeout(function() { pill.textContent = LABEL; }, 1800);
        });
    });
    document.body.appendChild(pill);
};

// If debug was already armed before this page loaded, show the pill once the body exists.
if (window.FV3_DEBUG) {
    if (document.body) window.fv3SetDebugPill(true);
    else document.addEventListener('DOMContentLoaded', function() { window.fv3SetDebugPill(true); });
}

// Always-active failed-request buffer, NOT gated on FV3_DEBUG: an error dialog's download must
// carry the failed request the first time a user ever hits an error.
window.FV3_FAILURE_MAX = 20;
window.fv3FailureBuffer = [];
window.fv3RecordFailure = function(method, url, status, statusText, body) {
    try {
        window.fv3FailureBuffer.push({
            t: Date.now(),
            method: method,
            url: fv3RedactString(url),
            status: status,
            statusText: statusText,
            body: fv3RedactString(String(body || '').slice(0, 500))
        });
        if (window.fv3FailureBuffer.length > window.FV3_FAILURE_MAX) window.fv3FailureBuffer.shift();
    } catch (_) {}
};
// jQuery's global hook covers every existing $.get/$.post call site with zero per-call-site
// edits. Scoped to this plugin's own endpoints so other plugins' AJAX traffic isn't recorded.
if (typeof $ !== 'undefined' && $(document).ajaxError) {
    $(document).ajaxError(function(event, jqXHR, settings) {
        if (!settings || !settings.url || !settings.url.includes('/plugins/folder.view3/')) return;
        fv3RecordFailure(settings.type || 'GET', settings.url, jqXHR.status, jqXHR.statusText, jqXHR.responseText);
    });
}
// Covers the handful of raw fetch() calls (folder.js, folderview3.js) that don't go through jQuery.
(function() {
    var origFetch = window.fetch;
    if (typeof origFetch !== 'function') return;
    window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var isPlugin = url.includes('/plugins/folder.view3/');
        var method = (init && init.method) || (input && input.method) || 'GET';
        return origFetch.apply(this, arguments).then(function(res) {
            if (isPlugin && !res.ok) {
                res.clone().text().then(function(body) {
                    fv3RecordFailure(method, url, res.status, res.statusText, body);
                }).catch(function() {});
            }
            return res;
        }, function(err) {
            // A network failure or abort never yields a Response, so it is recorded as status 0
            if (isPlugin) fv3RecordFailure(method, url, 0, (err && err.message) || String(err), '');
            throw err;
        });
    };
})();

// Page-agnostic env snapshot for the folder editor and settings page; shared.js replaces it on the tabs.
window.fv3CollectEnv = () => ({
    capturedAt: new Date().toISOString(),
    viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
    userAgent: navigator.userAgent,
    path: location.pathname,
    unraidTheme: window.fv3UnraidTheme,
    milestones: Object.assign({}, window.fv3Milestones),
    traceBuffer: [...(window.fv3TraceBuffer || [])],
    recentFailures: [...(window.fv3FailureBuffer || [])]
});

window.fv3CollectCssDebug = async () => {
    const safeJson = async (url) => {
        try {
            const raw = await $.get(url).promise();
            if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return raw; } }
            return raw;
        } catch (e) {
            return { _fetchError: e && e.statusText ? e.statusText : String(e) };
        }
    };
    // Fetch the generated + custom CSS served from /boot/config; built-in plugin CSS lives in the repo and is skipped
    const safeText = async (url) => {
        try { return String(await $.get(url).promise()).slice(0, 6000); }
        catch (e) { return '_fetchError: ' + (e && e.statusText ? e.statusText : String(e)); }
    };
    const cssLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
        .map(l => l.getAttribute('href'))
        .filter(h => h && h.includes('/boot/config/plugins/folder.view3/'))
        .slice(0, 10);
    const customScripts = [...document.querySelectorAll('script[src*="/boot/config/plugins/folder.view3/"]')]
        .map(s => s.getAttribute('src')).slice(0, 20);
    const [cssConfig, themes] = await Promise.all([
        safeJson('/plugins/folder.view3/server/read_css_config.php'),
        safeJson('/plugins/folder.view3/server/list_themes.php')
    ]);
    const loadedCss = {};
    for (const href of cssLinks) loadedCss[href] = await safeText(href);
    return { cssConfig, themes, loadedCss, customScripts };
};

// Saves `data` plus a fresh env() as folder.view3-<source>-<local time>-<theme>.json
window.fv3DownloadDebugJSON = (source, data) => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
    const themeTag = window.fv3UnraidTheme || (document.documentElement.className.match(/\bTheme--([a-z]+)\b/) || [])[1] || 'theme-unknown';
    const filename = `folder.view3-${source}-${ts}-${themeTag}.json`;
    // One redaction pass over the whole report: this is the only export path, so every captured surface is covered
    const body = fv3RedactString(JSON.stringify(Object.assign({}, data, { env: window.fv3CollectEnv() }), null, 2));
    const blob = new Blob([body], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = filename;
    el.style.display = 'none';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
    URL.revokeObjectURL(url);
};

// On-demand capture: the page's stashed payload, a FRESH env() at click time, and the server error-log tail.
window.fv3DebugPayloads = {};
window.fv3DebugSource = null;
window.fv3CaptureDebug = async (source) => {
    source = source || window.fv3DebugSource || 'UNKNOWN';
    // A page stores one payload under its own name, or one per section under "<source>-<section>" —
    // the dashboard renders Docker and VM separately, so its report carries both, each under its key
    const keys = Object.keys(window.fv3DebugPayloads).filter((k) => k === source || k.indexOf(source + '-') === 0);
    let payload = {};
    for (const k of keys) {
        const stored = window.fv3DebugPayloads[k];
        try { payload[k] = JSON.parse(stored); } catch (_) { payload[k] = { rawBody: stored }; }
    }
    if (!keys.length) {
        // The tabs keep their folder map in a script-scoped `let`, so it is read by name, not off window
        let live = {};
        try { live = (typeof globalFolders !== 'undefined' && globalFolders) || window.globalFolders || {}; } catch (_) {}
        payload = { _note: 'no stored payload for ' + source + '; arm debug (type fv3debug) and reload for full data', folders: live };
    }
    try {
        const res = await fetch('/plugins/folder.view3/server/read_error_log.php', { credentials: 'same-origin' });
        const j = await res.json();
        payload.serverErrorLog = j && typeof j.log === 'string' ? j.log : '_fetchError: ' + ((j && j.error) || ('HTTP ' + res.status));
    } catch (e) {
        payload.serverErrorLog = '_fetchError: ' + String(e);
    }
    fv3DownloadDebugJSON('debug-' + source, payload);
    return true;
};

// Debug button markup for a swal `text` (html: true). No inline onclick — SweetAlert 1.x's modal swallows
// it; bind with fv3BindDebugSwalButton() right after swal() returns (the button exists synchronously).
window.fv3DebugSwalButtonHtml = (id) => {
    const label = (window.fv3I18nOr && fv3I18nOr('download-debug-info', 'Download Debug Info')) || 'Download Debug Info';
    return `<div style="margin-top:14px"><button type="button" id="${id}" class="fv3-debug-swal-btn">${escapeHtml(label)}</button></div>`;
};
window.fv3BindDebugSwalButton = (id, source) => {
    let btn = document.getElementById(id);
    if (!btn || btn._fv3Bound) return;
    // SweetAlert binds its own close handler to this BUTTON, and stopPropagation cannot stop a
    // listener on the same node — replace the node to drop it, keeping tag, id, class and label
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    btn = fresh;
    btn._fv3Bound = true;
    const label = btn.textContent;
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = '...';
        fv3CaptureDebug(source).catch((e) => fv3Error('debug-swal-btn', e)).finally(() => {
            btn.disabled = false;
            btn.textContent = label;
        });
    });
};

// Error swal with a debug-download action. The dialog renders as HTML, so the dynamic text and title are escaped
let _fv3SwalErrorSeq = 0;
window.fv3SwalError = (text, source, title) => {
    const id = 'fv3-dbg-swal-' + (++_fv3SwalErrorSeq);
    swal({
        title: escapeHtml(title || fv3I18nOr('error', 'Error')),
        text: escapeHtml(String(text ?? '')).replace(/\n/g, '<br>') + fv3DebugSwalButtonHtml(id),
        type: 'error',
        html: true
    });
    fv3BindDebugSwalButton(id, source);
};
