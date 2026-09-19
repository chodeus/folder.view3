// FolderView3 debug system — loaded by every page (Docker/VM/Dashboard tabs, the folder
// editor, and settings) so an error anywhere has the same capture available. Extracted from
// shared.js, which previously only loaded on the Docker/VM/Dashboard tabs.

// Debug system
window.FV3_DEBUG = (() => { try { return localStorage.getItem('fv3-debug') === 'true'; } catch (e) { return false; } })();

// Timestamped ring buffer. A single post-hoc snapshot can't reveal a load-order race
// (e.g. the column width-fix measuring before remote icons load); the ordered timeline can.
// Records only while debug mode is armed, and starts at script init so the early render
// sequence is retained even when a capture is triggered late. Existing fv3Debug seam calls
// (createFolders entry/exit, WidthFix, etc.) flow through here automatically.
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
            msg: rest.map(function(a) {
                if (a instanceof Error) return a.message;
                if (a && typeof a === 'object') { try { return JSON.stringify(a); } catch (_) { return String(a); } }
                return String(a);
            }).join(' ').slice(0, 500)
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

// Eviction-proof render milestones — keyed by name so verbose per-container trace spam can
// never push out the high-level page-load timeline (folderReq resolved, createFolders
// start/end, width-fix runs, fonts ready, first stat). Each entry keeps {first,last,count}
// in performance.now() ms, so repeated marks (e.g. width-fix on resize) stay compact.
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

// Capture uncaught page errors into the trace buffer — a JS error during load (from FV3,
// Unraid, or another plugin) can abort table setup and leave the layout half-built. Only
// the already-armed FV3_DEBUG gates whether fv3Trace records; the listeners are cheap.
try {
    window.addEventListener('error', function(e) {
        var msg = (e && e.message) || 'error';
        // Benign: Chrome fires this when a ResizeObserver callback triggers a resize within the
        // same delivery cycle. Our fluid pill / preview-expand / clip observers do exactly that
        // while the layout settles under async icon loads — it is self-limiting (not an
        // exception) and converges in a few hundred ms. Recording each one as an error floods
        // the trace and masks real failures, so count it for visibility instead of logging it.
        if (/ResizeObserver loop/i.test(msg)) { window._fv3ROLoopCount = (window._fv3ROLoopCount || 0) + 1; return; }
        window.fv3Trace('error', 'window.onerror', msg, (e && e.filename ? e.filename.split('/').pop() : '') + ':' + (e && e.lineno));
    });
    window.addEventListener('unhandledrejection', function(e) {
        var r = e && e.reason;
        window.fv3Trace('error', 'unhandledrejection', (r && r.message) || String(r));
    });
} catch (_) {}

// Tap console.warn/error so NON-fatal messages logged by Unraid or another plugin (not just
// uncaught exceptions) land in the trace buffer — these can reveal why the layout half-builds
// on one box but not another. Only installed when debug is already armed, so production console
// is left completely untouched; the original console function is always still called.
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

// Capture pill — only exists in the DOM while debug mode is armed (zero footprint for
// normal users). Centered so it can't be missed; draggable so it can be moved off the data;
// click downloads a snapshot of the CURRENT rendered state via fv3CaptureDebug.
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

// Masks secret-shaped query values client-side, mirroring server/lib.php's fv3_redact() —
// applied to anything this file captures automatically (failed-request URLs/bodies).
window.fv3RedactString = function(s) {
    try { return String(s).replace(/((?:token|api[_-]?key|key|secret|password|passwd|pass|auth)=)[^&\s"']+/gi, '$1[redacted]'); }
    catch (_) { return String(s); }
};

// Always-active failed-request buffer — unlike everything above, NOT gated behind FV3_DEBUG.
// Without this, a "Download Debug Info" action on an error alert has nothing real to show the
// first time a user ever hits an error, because the trace buffer above only records once
// debug mode has already been armed and the page reloaded.
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
        return origFetch.apply(this, arguments).then(function(res) {
            if (isPlugin && !res.ok) {
                res.clone().text().then(function(body) {
                    fv3RecordFailure((init && init.method) || 'GET', url, res.status, res.statusText, body);
                }).catch(function() {});
            }
            return res;
        });
    };
})();

// Minimal, page-agnostic environment snapshot — available even where shared.js (and its
// richer, Docker/VM-table-shaped fv3CollectEnv) isn't loaded, i.e. the folder editor and
// settings page. shared.js overwrites this with a fuller version on the three tab pages.
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
    // Fetch the actual contents of the generated + custom CSS loaded from /boot/config —
    // a bad generated rule or a community custom-CSS override is otherwise invisible (we only
    // had the stylesheet URLs). Built-in plugin CSS is skipped (it lives in the repo).
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

window.fv3DownloadDebugJSON = (source, data) => {
    let filename, body;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const themeTag = window.fv3UnraidTheme || 'theme-unknown';
    if (typeof data === 'string' && /\.json$/i.test(source)) {
        const parsed = (() => { try { return JSON.parse(data); } catch (_) { return { rawBody: data }; } })();
        parsed.env = window.fv3CollectEnv();
        body = JSON.stringify(parsed, null, 2);
        filename = source.replace(/\.json$/i, `-${ts}-${themeTag}.json`);
    } else {
        const payload = Object.assign({ env: window.fv3CollectEnv() }, data);
        body = JSON.stringify(payload, null, 2);
        filename = `folder.view3-${source}-${ts}-${themeTag}.json`;
    }
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

// On-demand capture. Each page stashes its data payload (folders/orders/containersInfo/css)
// keyed by source as it renders; fv3CaptureDebug then downloads it with a FRESH env() — so
// the rendered-layout block reflects the state at click time (post-render, post-interaction),
// fixing the old bug where env was captured before folders/the width-fix existed. Also folds
// in the server-side error log tail, so a report closes the loop without needing SSH access.
window.fv3DebugPayloads = {};
window.fv3DebugSource = null;
window.fv3CaptureDebug = async (source) => {
    source = source || window.fv3DebugSource || 'UNKNOWN';
    const stored = window.fv3DebugPayloads[source];
    let payload;
    if (stored) {
        try { payload = JSON.parse(stored); } catch (_) { payload = { rawBody: stored }; }
    } else {
        payload = { _note: 'no stored payload for ' + source + '; arm debug (type fv3debug) and reload for full data', folders: window.globalFolders || {} };
    }
    try {
        const res = await fetch('/plugins/folder.view3/server/read_error_log.php', { credentials: 'same-origin' });
        const j = await res.json();
        payload.serverErrorLog = j && typeof j.log === 'string' ? j.log : '';
    } catch (e) {
        payload.serverErrorLog = '_fetchError: ' + String(e);
    }
    fv3DownloadDebugJSON('debug-' + source + '.json', JSON.stringify(payload));
    return true;
};

// Embeds a "Download Debug Info" action inside a swal error dialog's `text` (html: true).
// SweetAlert 1.x's shared modal silently drops an inline onclick inside `text` — the button
// exists but never fires — so this deliberately has NO onclick attribute. The caller must
// call fv3BindDebugSwalButton() right after swal() returns; the button already exists in the
// DOM synchronously at that point, no setTimeout needed.
window.fv3DebugSwalButtonHtml = (id) => {
    const label = (window.fv3I18nOr && fv3I18nOr('download-debug-info', 'Download Debug Info')) || 'Download Debug Info';
    return `<div style="margin-top:14px"><button type="button" id="${id}" class="fv3-debug-swal-btn">${label}</button></div>`;
};
window.fv3BindDebugSwalButton = (id, source) => {
    const btn = document.getElementById(id);
    if (!btn || btn._fv3Bound) return;
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

// Convenience wrapper for the common "error swal with a debug-download action" shape used at
// every error site — one call instead of repeating the swal(...) + bind boilerplate.
let _fv3SwalErrorSeq = 0;
window.fv3SwalError = (text, source, title) => {
    const id = 'fv3-dbg-swal-' + (++_fv3SwalErrorSeq);
    swal({
        title: title || fv3I18nOr('error', 'Error'),
        text: text + fv3DebugSwalButtonHtml(id),
        type: 'error',
        html: true
    });
    fv3BindDebugSwalButton(id, source);
};
