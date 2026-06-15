// FolderView3 shared utilities for Docker, VM, and Dashboard pages

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
        window.fv3Trace('error', 'window.onerror', (e && e.message) || 'error', (e && e.filename ? e.filename.split('/').pop() : '') + ':' + (e && e.lineno));
    });
    window.addEventListener('unhandledrejection', function(e) {
        var r = e && e.reason;
        window.fv3Trace('error', 'unhandledrejection', (r && r.message) || String(r));
    });
} catch (_) {}

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
// click downloads a snapshot of the CURRENT rendered state via fv3CaptureDebug. Loaded only
// on the Docker/VM/Dashboard tabs (the pages that include shared.js).
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
        try {
            window.fv3CaptureDebug(window.fv3DebugSource);
            pill.textContent = '✓ Saved — capture again';
        } catch (e) {
            pill.textContent = '✕ Capture failed';
            fv3Error('pill', e);
        }
        setTimeout(function() { pill.textContent = LABEL; }, 1800);
    });
    document.body.appendChild(pill);
};

// If debug was already armed before this page loaded, show the pill once the body exists.
if (window.FV3_DEBUG) {
    if (document.body) window.fv3SetDebugPill(true);
    else document.addEventListener('DOMContentLoaded', function() { window.fv3SetDebugPill(true); });
}

if (window.fv3UnraidLegacy) fv3Debug('Init', 'Unraid legacy mode (pre-7.2)');

window.fv3SafeParseWithRecovery = (raw, storageKey, fallback) => {
    if (raw !== null && typeof raw === 'object') {
        try { localStorage.setItem('fv3-' + storageKey, JSON.stringify(raw)); } catch(e) {}
        return raw;
    }
    try {
        const parsed = JSON.parse(raw);
        try { localStorage.setItem('fv3-' + storageKey, raw); } catch(e) {}
        return parsed;
    } catch (e) {
        fv3Error('JSON', 'Parse failed for ' + storageKey);
        try {
            const backup = localStorage.getItem('fv3-' + storageKey);
            if (backup) {
                fv3DebugWarn('JSON', 'Using last-good backup for ' + storageKey);
                return JSON.parse(backup);
            }
        } catch(e2) {}
        return fallback;
    }
};

// Global folder defaults
window.fv3FolderDefaults = null;
window.fv3LoadFolderDefaults = async () => {
    if (fv3FolderDefaults !== null) return fv3FolderDefaults;
    try {
        const resp = await fetch('/plugins/folder.view3/server/read_settings.php', { credentials: 'same-origin' });
        const settings = await resp.json();
        fv3FolderDefaults = {
            preview: parseInt(settings.default_preview !== undefined ? settings.default_preview : '1', 10),
            preview_hover: settings.default_preview_hover === 'yes',
            preview_status: settings.default_preview_status || 'none',
            preview_grayscale: settings.default_preview_grayscale === 'yes',
            preview_webui: settings.default_preview_webui === 'yes',
            preview_logs: settings.default_preview_logs === 'yes',
            preview_console: settings.default_preview_console === 'yes',
            preview_update: settings.default_preview_update === 'yes',
            preview_vertical_bars: settings.default_preview_vertical_bars === 'yes',
            preview_vertical_bars_color: settings.default_vertical_bars_color || '',
            preview_border: settings.default_preview_border === 'yes',
            preview_border_color: settings.default_border_color || '',
            preview_row_separator: settings.default_row_separator === 'yes',
            preview_row_separator_color: settings.default_separator_color || '',
            preview_text_width: settings.default_preview_text_width || '',
            preview_overflow: settings.default_overflow === 'scroll' ? 2 : settings.default_overflow === 'expand' ? 1 : 0,
            context: parseInt(settings.default_context !== undefined ? settings.default_context : '1', 10),
            update_column: settings.default_update_column === 'yes',
            dashboard_context: parseInt(settings.dashboard_context !== undefined ? settings.dashboard_context : '0', 10),
            dashboard_context_trigger: parseInt(settings.dashboard_context_trigger !== undefined ? settings.dashboard_context_trigger : '0', 10),
            dashboard_context_graph: parseInt(settings.dashboard_context_graph !== undefined ? settings.dashboard_context_graph : '1', 10),
            dashboard_context_graph_time: parseInt(settings.dashboard_context_graph_time !== undefined ? settings.dashboard_context_graph_time : '60', 10)
        };
    } catch (e) {
        fv3FolderDefaults = {};
    }
    return fv3FolderDefaults;
};

window.fv3ApplyDefaults = (folder) => {
    if (!fv3FolderDefaults || !folder.settings) return;
    var keys = Object.keys(fv3FolderDefaults);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (folder.settings[k] === undefined || folder.settings[k] === null || folder.settings[k] === '') {
            folder.settings[k] = fv3FolderDefaults[k];
        }
    }
};

// Resource cleanup
window.fv3Cleanups = [];
window.addEventListener('beforeunload', () => {
    fv3Cleanups.forEach(fn => { try { fn(); } catch(e) {} });
});

// Incognito mode
window.fv3Incognito = false;
(function() {
    function detectPage() {
        if (document.querySelector('#docker_containers, .ToggleViewMode')) return 'docker';
        if (document.querySelector('#kvm_table')) return 'vm';
        if (document.querySelector('.Dashboard')) return 'dashboard';
        return 'other';
    }
    window.fv3IncognitoPage = 'other';
    var nameMap = {};
    var nameCounter = { container: 0, vm: 0, folder: 0 };

    function getAnon(realName, type) {
        if (!realName || !realName.trim()) return realName;
        var key = type + ':' + realName;
        if (nameMap[key]) return nameMap[key];
        nameCounter[type] = (nameCounter[type] || 0) + 1;
        var label = type === 'folder' ? 'Folder' : type === 'vm' ? 'VM' : 'Container';
        nameMap[key] = label + ' ' + nameCounter[type];
        return nameMap[key];
    }

    function scrubText(text, knownNames, type) {
        var result = text;
        for (var i = 0; i < knownNames.length; i++) {
            if (!knownNames[i]) continue;
            var escaped = knownNames[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            var anon = getAnon(knownNames[i], type || 'container');
            result = result.replace(new RegExp(escaped, 'gi'), anon);
        }
        return result;
    }

    var macRe = /[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}/g;
    var ipv6Re = /[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,7}(?:\/\d{1,3})?/g;
    var diskFileRe = /([^\/\s]+)\.(qcow2|img|iso|raw|vmdk|vdi|vhd|vhdx)\b/gi;
    var domainsDirRe = /(\/domains\/)([^\/]+)(\/)/g;
    var stdIface = /^(eth|enp|ens|eno|wl|wlan|br|docker|veth|virbr|vnet|lo|bond|tap|tun)/i;
    var appdataRe = /(\/appdata\/)([^\/\s]+)/g;
    var publisherPrefixRe = /([a-z0-9][a-z0-9._-]*)\/(Container \d+|VM \d+|Folder \d+)/g;
    var safeTagRe = /^(latest|stable|lts|release|edge|beta|dev|nightly|rc\d*)$/i;
    var statusTextRe = /^(up-to-date|update ready|force update|checking|not available|install|orphan image|update|rebuild ready)$/i;

    function scrubTextNodes(el, knownNames, type) {
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
        var textNodes = [];
        var node;
        while (node = walker.nextNode()) textNodes.push(node);
        var modified = false;
        textNodes.forEach(function(tn) {
            var text = tn.nodeValue;
            var prev = tn.previousSibling;
            if (prev && prev.nodeType === 1 && (prev.classList.contains('fa-info-circle') || prev.classList.contains('fa-docker'))) return;
            var changed = scrubText(text, knownNames, type);
            changed = changed.replace(macRe, 'xx:xx:xx:xx:xx:xx');
            changed = changed.replace(ipv6Re, function(match) {
                if (/^fe80/i.test(match) || /^f[cd]/i.test(match)) return match;
                return 'xxxx:xxxx::xxxx';
            });
            changed = changed.replace(diskFileRe, '[hidden].$2');
            changed = changed.replace(domainsDirRe, '$1[hidden]$3');
            changed = changed.replace(appdataRe, '$1[hidden]');
            changed = changed.replace(publisherPrefixRe, '[hidden]/$2');
            changed = changed.replace(/([a-zA-Z][a-zA-Z0-9_.-]*)(\s*\(xx:xx:xx:xx:xx:xx\))/, function(m, name, rest) {
                if (stdIface.test(name)) return m;
                return '[hidden]' + rest;
            });
            if (changed !== text) {
                if (!tn._fv3Original) tn._fv3Original = text;
                tn.nodeValue = changed;
                modified = true;
            }
        });
        if (modified) el.setAttribute('data-fv3-scrubbed', 'true');
    }

    window.fv3IncognitoApply = function() {
        if (!fv3Incognito) return;
        document.body.classList.add('fv3-incognito');
        var knownNames = [];

        document.querySelectorAll('.folder-appname, .fv3-folder-appname').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            var name = el.textContent.trim();
            if (name) knownNames.push(name);
            el.setAttribute('data-fv3-real', name);
            el.textContent = getAnon(name, 'folder');
        });

        document.querySelectorAll('.appname').forEach(function(el) {
            if (el.closest('.folder-name')) return;
            var link = el.querySelector('a');
            var target = link || el;
            if (target.hasAttribute('data-fv3-real')) return;
            var name = target.textContent.trim();
            if (name) knownNames.push(name);
            target.setAttribute('data-fv3-real', name);
            target.textContent = getAnon(name, 'container');
        });

        document.querySelectorAll('td.vm-name:not(.folder-name) + td').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            var text = el.textContent.trim();
            if (text) {
                el.setAttribute('data-fv3-real', text);
                el.textContent = '';
            }
        });

        document.querySelectorAll('td.vm-name:not(.folder-name) span.inner a').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            var name = el.textContent.trim();
            if (name) knownNames.push(name);
            el.setAttribute('data-fv3-real', name);
            el.textContent = getAnon(name, 'vm');
        });

        document.querySelectorAll('.folder-preview [data-name], .folder-preview .folder-element span, .folder-preview span.inner a').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            var name = (el.getAttribute('data-name') || el.textContent || '').trim();
            if (name) {
                el.setAttribute('data-fv3-real', name);
                var previewType = document.querySelector('#kvm_table') ? 'vm' : 'container';
                el.textContent = getAnon(name, previewType);
            }
        });

        document.querySelectorAll('img.img, .folder-img-docker img, .folder-img-vm img, td.ct-name img, td.vm-name img').forEach(function(el) {
            el.setAttribute('data-fv3-real-src', el.src);
            el.style.filter = 'blur(8px) brightness(0.7)';
        });

        document.querySelectorAll('.Docker_Image, .docker-image, [class*="image-name"]').forEach(function(el) {
            el.setAttribute('data-fv3-real', el.textContent);
            el.textContent = 'image/hidden';
        });

        var byWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var byNode;
        while (byNode = byWalker.nextNode()) {
            var byIdx = byNode.nodeValue.indexOf('By:');
            if (byIdx === -1) continue;
            var nextSib = byNode.nextSibling;
            if (nextSib && nextSib.nodeType === 1 && nextSib.tagName === 'A') {
                nextSib.setAttribute('data-fv3-real', nextSib.textContent);
                nextSib.setAttribute('data-fv3-real-href', nextSib.getAttribute('href') || '');
                nextSib.textContent = 'registry/image';
                nextSib.setAttribute('href', '#');
            } else {
                var afterBy = byNode.nodeValue.substring(byIdx + 3).trim();
                if (afterBy) {
                    byNode._fv3Original = byNode.nodeValue;
                    byNode.nodeValue = byNode.nodeValue.substring(0, byIdx + 4) + 'registry/image';
                    if (byNode.parentElement) byNode.parentElement.setAttribute('data-fv3-scrubbed', '');
                }
            }
        }

        document.querySelectorAll('a[href*="://"]').forEach(function(el) {
            var href = el.getAttribute('href') || '';
            var text = el.textContent || '';
            if (el.closest('.fv3-incognito-skip')) return;
            if (el.hasAttribute('data-fv3-real')) return;
            for (var i = 0; i < knownNames.length; i++) {
                if (href.indexOf(knownNames[i].toLowerCase()) !== -1 || (text && text.indexOf(knownNames[i]) !== -1)) {
                    el.setAttribute('data-fv3-real', text);
                    el.setAttribute('data-fv3-real-href', href);
                    el.textContent = 'WebUI';
                    el.setAttribute('href', '#');
                    break;
                }
            }
        });

        document.querySelectorAll('.tailscale-ip, [class*="tailscale"]').forEach(function(el) {
            el.setAttribute('data-fv3-real', el.textContent);
            el.textContent = '100.x.x.x';
        });

        var extraNames = [];
        knownNames.forEach(function(name) {
            var parts = name.split(/[_\-. ]+/);
            if (parts.length > 1) {
                parts.forEach(function(p) {
                    if (p.length >= 4 && knownNames.indexOf(p) === -1 && extraNames.indexOf(p) === -1) extraNames.push(p);
                });
            }
        });
        knownNames = knownNames.concat(extraNames);

        document.querySelectorAll('.info-section td, .tooltip-content, .preview-outbox .status-info').forEach(function(el) {
            var html = el.innerHTML;
            var changed = scrubText(html, knownNames);
            if (changed !== html) {
                el.setAttribute('data-fv3-real-html', html);
                el.innerHTML = changed;
            }
        });

        document.querySelectorAll('#docker_containers td.updatecolumn').forEach(function(cell) {
            var walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
            var tn;
            while (tn = walker.nextNode()) {
                var tag = tn.nodeValue.trim();
                if (!tag || statusTextRe.test(tag) || safeTagRe.test(tag)) continue;
                var prevSib = tn.previousSibling;
                if (prevSib && prevSib.nodeType === 1 && prevSib.tagName === 'I') continue;
                if (/[a-zA-Z]/.test(tag) && /\d/.test(tag)) {
                    tn._fv3Original = tn.nodeValue;
                    tn.nodeValue = tn.nodeValue.replace(tag, '[hidden]');
                    cell.setAttribute('data-fv3-scrubbed', 'true');
                }
            }
        });

        var isVmPage = !!document.querySelector('#kvm_table');
        document.querySelectorAll('#docker_containers td:not(.updatecolumn):not(.folder-name), #kvm_table td:not(.folder-name)').forEach(function(el) {
            scrubTextNodes(el, knownNames, isVmPage ? 'vm' : 'container');
        });
    };

    window.fv3IncognitoScrubTooltip = function(tooltipEl, containerName) {
        if (!fv3Incognito || !tooltipEl) return;
        var anonName = getAnon(containerName, 'container');
        var names = [containerName];
        var parts = containerName.split(/[_\-. ]+/);
        if (parts.length > 1) {
            parts.forEach(function(p) {
                if (p.length >= 4 && names.indexOf(p) === -1) names.push(p);
            });
        }

        tooltipEl.querySelectorAll('.preview-actual-name .appname').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            el.setAttribute('data-fv3-real', el.textContent);
            el.textContent = anonName;
        });

        tooltipEl.querySelectorAll('img.img').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real-src')) return;
            el.setAttribute('data-fv3-real-src', el.src);
            el.style.filter = 'blur(8px) brightness(0.7)';
        });

        tooltipEl.querySelectorAll('.info-ct .repo a').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            el.setAttribute('data-fv3-real', el.textContent);
            el.setAttribute('data-fv3-real-href', el.getAttribute('href') || '');
            el.textContent = 'registry/image';
            el.setAttribute('href', '#');
        });

        tooltipEl.querySelectorAll('a[href*="://"]').forEach(function(el) {
            if (el.hasAttribute('data-fv3-real')) return;
            var href = el.getAttribute('href') || '';
            var text = el.textContent || '';
            for (var i = 0; i < names.length; i++) {
                if (href.toLowerCase().indexOf(names[i].toLowerCase()) !== -1 ||
                    text.indexOf(names[i]) !== -1) {
                    el.setAttribute('data-fv3-real', text);
                    el.setAttribute('data-fv3-real-href', href);
                    el.textContent = 'WebUI';
                    el.setAttribute('href', '#');
                    break;
                }
            }
        });

        tooltipEl.querySelectorAll('.info-ports').forEach(function(el) {
            scrubTextNodes(el, names, 'container');
        });

        tooltipEl.querySelectorAll('.info-volumes').forEach(function(el) {
            scrubTextNodes(el, names, 'container');
        });
    };

    window.fv3IncognitoRemove = function() {
        document.body.classList.remove('fv3-incognito');
        document.querySelectorAll('[data-fv3-real]').forEach(function(el) {
            el.textContent = el.getAttribute('data-fv3-real');
            el.removeAttribute('data-fv3-real');
        });
        document.querySelectorAll('[data-fv3-real-src]').forEach(function(el) {
            el.src = el.getAttribute('data-fv3-real-src');
            el.style.filter = '';
            el.removeAttribute('data-fv3-real-src');
        });
        document.querySelectorAll('[data-fv3-real-href]').forEach(function(el) {
            el.setAttribute('href', el.getAttribute('data-fv3-real-href'));
            el.removeAttribute('data-fv3-real-href');
        });
        document.querySelectorAll('[data-fv3-real-html]').forEach(function(el) {
            el.innerHTML = el.getAttribute('data-fv3-real-html');
            el.removeAttribute('data-fv3-real-html');
        });
        document.querySelectorAll('[data-fv3-scrubbed]').forEach(function(el) {
            var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            var node;
            while (node = walker.nextNode()) {
                if (node._fv3Original) {
                    node.nodeValue = node._fv3Original;
                    delete node._fv3Original;
                }
            }
            el.removeAttribute('data-fv3-scrubbed');
        });
        nameMap = {};
        nameCounter = { container: 0, vm: 0, folder: 0 };
    };

    window.fv3IncognitoToggle = function() {
        fv3Incognito = !fv3Incognito;
        localStorage.setItem('fv3-incognito-' + fv3IncognitoPage, fv3Incognito);
        if (fv3Incognito) fv3IncognitoApply();
        else fv3IncognitoRemove();
        var btn = document.getElementById('fv3-incognito-btn');
        if (btn) btn.classList.toggle('fv3-incognito-active', fv3Incognito);
    };

    function createBtn() {
        var btn = document.createElement('button');
        btn.id = 'fv3-incognito-btn';
        btn.className = 'fv3-incognito-btn' + (fv3Incognito ? ' fv3-incognito-active' : '');
        btn.title = 'Incognito Mode';
        btn.innerHTML = '<i class="fa fa-eye-slash"></i>';
        btn.addEventListener('click', fv3IncognitoToggle);
        return btn;
    }

    function injectToggle() {
        if (document.getElementById('fv3-incognito-btn')) return;

        fv3IncognitoPage = detectPage();
        fv3Incognito = localStorage.getItem('fv3-incognito-' + fv3IncognitoPage) === 'true';

        var toggleView = document.querySelector('.ToggleViewMode');
        if (toggleView) {
            toggleView.insertBefore(createBtn(), toggleView.firstChild);
            return;
        }

        var table = document.querySelector('table#docker_containers, table#kvm_table');
        if (table) {
            var wrapper = document.createElement('div');
            wrapper.className = 'fv3-incognito-bar';
            wrapper.appendChild(createBtn());
            table.parentNode.insertBefore(wrapper, table);
            return;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(injectToggle, 100); });
    } else {
        setTimeout(injectToggle, 100);
    }

    if (typeof folderEvents !== 'undefined') {
        folderEvents.addEventListener('docker-post-folders-creation', function() {
            injectToggle();
            if (fv3Incognito) setTimeout(fv3IncognitoApply, 100);
        });
        folderEvents.addEventListener('vm-post-folders-creation', function() {
            injectToggle();
            if (fv3Incognito) setTimeout(fv3IncognitoApply, 100);
        });
    }
})();

// Error banners
var _fv3BannerShown = {};
window.fv3ShowBanner = (message, level) => {
    if (_fv3BannerShown[message]) return;
    _fv3BannerShown[message] = true;
    var banner = document.createElement('div');
    banner.className = 'fv3-banner fv3-banner-' + (level || 'warn');
    var text = document.createElement('span');
    text.textContent = message;
    banner.appendChild(text);
    if (level !== 'error') {
        var close = document.createElement('span');
        close.className = 'fv3-banner-close';
        close.textContent = '\u00d7';
        close.onclick = function() { banner.remove(); delete _fv3BannerShown[message]; };
        banner.appendChild(close);
        setTimeout(function() { if (banner.parentNode) banner.remove(); delete _fv3BannerShown[message]; }, 15000);
    }
    var target = document.getElementById('docker_list') || document.getElementById('vm_list') || document.querySelector('.dashboard_vm') || document.body;
    target.parentNode.insertBefore(banner, target);
    fv3Error('Banner', message);
};

window.fv3EditFolder = (type, basePath, id) => {
    location.href = basePath + '?type=' + type + '&id=' + id;
};

window.fv3CreateFolderBtn = (type, basePath) => {
    location.href = basePath + '?type=' + type;
};

window.fv3RmFolder = (type, globalFolders, loadlist, id) => {
    swal({
        title: $.i18n('are-you-sure'),
        text: `${$.i18n('remove-folder')}: ${escapeHtml(globalFolders[id].name)}`,
        type: 'warning',
        html: true,
        showCancelButton: true,
        confirmButtonText: $.i18n('yes-delete'),
        cancelButtonText: $.i18n('cancel'),
        showLoaderOnConfirm: true
    },
    async (c) => {
        if (!c) { setTimeout(loadlist, 0); return; }
        $('div.spinner.fixed').show('slow');
        await $.post('/plugins/folder.view3/server/delete.php', { type: type, id: id }).promise();
        setTimeout(loadlist, 500);
    });
};

window.fv3DropDownButton = (eventPrefix, globalFolders, id, postCallback) => {
    folderEvents.dispatchEvent(new CustomEvent(eventPrefix + '-pre-folder-expansion', {detail: { id }}));
    const element = $(`.dropDown-${id}`);
    const state = element.attr('active') === "true";
    if (state) {
        element.children().removeClass('fa-chevron-up').addClass('fa-chevron-down');
        $(`tr.folder-id-${id}`).addClass('sortable');
        $(`tr.folder-id-${id} .folder-storage`).append($(`.folder-${id}-element`));
        element.attr('active', 'false');
    } else {
        element.children().removeClass('fa-chevron-down').addClass('fa-chevron-up');
        $(`tr.folder-id-${id}`).removeClass('sortable').removeClass('ui-sortable-handle').off().css('cursor', '');
        $(`tr.folder-id-${id}`).after($(`.folder-${id}-element`));
        $(`.folder-${id}-element > td > i.fa-arrows-v`).remove();
        element.attr('active', 'true');
        // listview() on view toggle skips readmore for cells hidden inside .folder-storage; rewrap on expand
        if (eventPrefix === 'docker') {
            const $readmoreEls = $(`.folder-${id}-element .docker_readmore`);
            if ($readmoreEls.length && typeof $readmoreEls.readmore === 'function') {
                $readmoreEls.readmore('destroy');
                $readmoreEls.readmore({
                    maxHeight: 32,
                    moreLink: "<a href='#' style='text-align:center'><i class='fa fa-chevron-down'></i></a>",
                    lessLink: "<a href='#' style='text-align:center'><i class='fa fa-chevron-up'></i></a>"
                });
            }
        }
    }
    if(globalFolders[id]) {
        globalFolders[id].status.expanded = !state;
    }
    folderEvents.dispatchEvent(new CustomEvent(eventPrefix + '-post-folder-expansion', {detail: { id }}));
    if (postCallback) postCallback();
};

// Allowlist sanitizer: the debug JSON only needs the fields the renderer actually
// consumes. Dumping the full Docker inspect blob leaked host volume paths (Binds/Mounts),
// ZFS mountpoints, log/template paths, and bloated the file ~10x. Keep an explicit allowlist.
// NOTE: this output feeds the debug JSON only, never rendering — dropping fields is safe.
window.fv3SanitizeContainersInfo = (containersInfo) => {
    var redactIP = (str) => typeof str === 'string' ? str.replace(/\b(\d{1,3}\.){3}\d{1,3}\b/g, 'x.x.x.x') : str;
    var out = {};
    try {
        Object.keys(containersInfo || {}).forEach(key => {
            var ct = containersInfo[key];
            if (!ct || typeof ct !== 'object') { out[key] = ct; return; }
            var info = ct.info || {};
            var st = info.State || {};
            var labels = ct.Labels || {};
            out[key] = {
                shortId: ct.shortId,
                shortImageId: ct.shortImageId,
                Image: ct.Image,
                State: ct.State,
                Status: ct.Status,
                Names: ct.Names,
                Labels: {
                    'folder.view3': labels['folder.view3'],
                    'net.unraid.docker.icon': labels['net.unraid.docker.icon']
                },
                Health: ct.Health ? { Status: ct.Health.Status } : undefined,
                info: {
                    Name: info.Name,
                    Shell: info.Shell,
                    State: {
                        Status: st.Status,
                        Running: st.Running,
                        Paused: st.Paused,
                        Autostart: st.Autostart,
                        Updated: st.Updated,
                        manager: st.manager,
                        WebUi: redactIP(st.WebUi),
                        TSWebUi: redactIP(st.TSWebUi)
                    }
                }
            };
        });
    } catch (e) {
        return { _sanitizeError: String(e) };
    }
    return out;
};

window.fv3CollectEnv = () => {
    const getCookie = (n) => { try { return (typeof $ !== 'undefined' && $.cookie) ? $.cookie(n) : null; } catch (_) { return null; } };
    const sample = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
            width: el.offsetWidth,
            height: el.offsetHeight,
            cssHeight: cs.height,
            overflow: cs.overflow,
            display: cs.display,
            flexWrap: cs.flexWrap,
            alignItems: cs.alignItems,
            alignContent: cs.alignContent,
            minWidth: cs.minWidth,
            maxWidth: cs.maxWidth,
            whiteSpace: cs.whiteSpace,
            borderStyle: cs.borderStyle,
            borderWidth: cs.borderWidth,
            borderColor: cs.borderColor,
            borderRadius: cs.borderRadius,
            padding: cs.padding,
            boxSizing: cs.boxSizing
        };
    };
    const tableSize = (id) => {
        const t = document.getElementById(id);
        if (!t) return null;
        return { offsetWidth: t.offsetWidth, scrollWidth: t.scrollWidth, rowCount: t.rows.length };
    };
    const readCssVars = (names) => {
        const cs = getComputedStyle(document.documentElement);
        const out = {};
        for (const n of names) out[n] = (cs.getPropertyValue(n) || '').trim();
        return out;
    };
    const collectStylesheets = () => {
        return [...document.querySelectorAll('link[rel="stylesheet"]')]
            .map(l => l.getAttribute('href'))
            .filter(h => h && h.includes('/folder.view3/'));
    };
    // Foreign stylesheets (a theme/custom plugin restyling the Docker table is a prime
    // layout-bug source and was previously uncaptured — only foreign scripts were).
    const collectForeignStylesheets = () => {
        return [...document.querySelectorAll('link[rel="stylesheet"]')]
            .map(l => l.getAttribute('href'))
            .filter(h => h && !h.includes('/folder.view3/'))
            .slice(0, 20);
    };
    // Per-column rendered geometry for whichever container tables exist on this page
    // (Docker tab = #docker_containers, VM tab = #kvm_table). This is what the width-fix
    // keys off and the most likely place a non-standard layout / sub-pixel rounding goes wrong.
    const tableLayoutFor = (tbl) => {
        const ths = [...tbl.querySelectorAll('thead > tr > th')];
        const styleEl = document.getElementById('fv3-width-style');
        return {
            tableLayout: tbl.style.tableLayout || getComputedStyle(tbl).tableLayout,
            widthStylePresent: !!styleEl,
            widthStyle: styleEl ? (styleEl.textContent || '').slice(0, 1500) : null,
            columns: ths.map((h, i) => ({
                i, cls: h.className || '', label: (h.textContent || '').trim().slice(0, 24),
                rectW: Math.round(h.getBoundingClientRect().width * 10) / 10,
                styleW: h.style.width || '', hidden: h.offsetParent === null && h.getBoundingClientRect().width === 0
            }))
        };
    };
    const collectTableLayout = () => {
        const out = {};
        ['docker_containers', 'kvm_table'].forEach(id => {
            const tbl = document.getElementById(id);
            if (tbl) out[id] = tableLayoutFor(tbl);
        });
        // widthFix snapshot is docker-only; include once if present
        if (typeof window.fv3GetWidthState === 'function') out.widthState = window.fv3GetWidthState();
        return Object.keys(out).length ? out : null;
    };
    // Computed facts about one .folder-preview container — shared by every page type.
    const previewInfo = (prev) => {
        const cs = getComputedStyle(prev);
        return {
            offsetWidth: prev.offsetWidth, scrollWidth: prev.scrollWidth,
            justifyContent: cs.justifyContent, display: cs.display, flexWrap: cs.flexWrap,
            overflow: cs.overflow, className: prev.className,
            children: prev.children.length,
            wrappers: prev.querySelectorAll('.folder-preview-wrapper').length,
            dividers: prev.querySelectorAll('.folder-preview-divider').length
        };
    };
    // Per-folder manifest across ALL rendered folders, table-based (Docker/VM tr.folder)
    // and Dashboard showcase (.folder-showcase-outer). Captures preview cell placement,
    // the overflow mode actually applied (in className), and child/divider counts — so
    // "preview pushed right / clipped / wrong-content" is diagnosable on any page, for
    // every folder, not just the first one.
    // Every child cell of a row — index/class/colSpan/position/width/display. This is what
    // reveals a structural mismatch (e.g. the preview colspan cell landing far right because
    // a sibling cell isn't conforming to the locked column grid).
    const cellInfo = (c, i) => {
        const r = c.getBoundingClientRect();
        return { i, tag: c.tagName, cls: (c.className || '').slice(0, 30), colSpan: c.colSpan,
            left: Math.round(r.left), w: Math.round(r.width), disp: getComputedStyle(c).display };
    };
    const collectFolders = () => {
        const out = [];
        const rows = [...document.querySelectorAll('tr.folder')];
        rows.forEach((row, idx) => {
            const prev = row.querySelector('.folder-preview');
            const cell = prev ? [...row.children].find(td => td.contains(prev)) : null;
            const nameEl = row.querySelector('.folder-appname');
            const rec = {
                kind: 'row',
                id: (row.className.match(/folder-id-(\S+)/) || [])[1] || null,
                name: nameEl ? nameEl.textContent.trim().slice(0, 40) : null,
                cell: cell ? { colSpan: cell.colSpan, offsetLeft: cell.offsetLeft, offsetWidth: cell.offsetWidth } : null,
                cells: [...row.children].map(cellInfo),
                storageRows: row.querySelectorAll('.folder-storage tr').length,
                preview: prev ? previewInfo(prev) : null
            };
            if (idx === 0) {
                try {
                    const clone = row.cloneNode(true);
                    clone.querySelectorAll('.folder-storage').forEach(s => { s.innerHTML = ''; });
                    rec.skeletonHTML = clone.outerHTML.slice(0, 2500);
                    const st = row.querySelector('.folder-storage tr');
                    if (st) rec.firstStorageRowCells = [...st.children].map(cellInfo);
                } catch (_) {}
            }
            out.push(rec);
        });
        document.querySelectorAll('.folder-showcase-outer').forEach(box => {
            const prev = box.querySelector('.folder-preview');
            const nameEl = box.querySelector('.folder-appname, .folder-name');
            out.push({
                kind: 'showcase',
                name: nameEl ? nameEl.textContent.trim().slice(0, 40) : null,
                expanded: box.getAttribute('expanded'),
                offsetLeft: box.offsetLeft, offsetWidth: box.offsetWidth,
                preview: prev ? previewInfo(prev) : null
            });
        });
        return out;
    };
    // Browser-divergence signals — to settle whether a layout bug is Chrome-vs-Firefox.
    // Late SVG/icon layout (Gecko resolves intrinsic size later) widens the measure-before-load
    // race window; fractional DPR + scrollbar gutter change the width math between engines.
    const collectRenderSignals = () => {
        const folder = document.querySelector('#docker_containers tr.folder, #kvm_table tr.folder, .folder-showcase-outer');
        const icons = folder
            ? [...folder.querySelectorAll('img')].slice(0, 12).map(img => ({
                complete: img.complete, naturalW: img.naturalWidth, naturalH: img.naturalHeight,
                rectW: Math.round(img.getBoundingClientRect().width * 10) / 10,
                isSvg: /\.svg(\?|$)/i.test(img.currentSrc || img.src || '')
            }))
            : [];
        const tbl = document.getElementById('docker_containers') || document.getElementById('kvm_table');
        const parentW = tbl && tbl.parentElement ? tbl.parentElement.clientWidth : null;
        let fonts = null;
        try { fonts = { status: document.fonts && document.fonts.status, ready: !!window.fv3FontsReadyAt, readyAt: window.fv3FontsReadyAt || null }; } catch (_) {}
        let stats = null;
        try {
            stats = Object.assign({}, window.fv3StatsState, {
                apiAvailable: window.fv3ApiAvailable,
                cpuCores: window.fv3CpuCores,
                wsReadyState: window.fv3StatsConnection ? window.fv3StatsConnection.readyState : null,
                listeners: Array.isArray(window.fv3StatsCallbacks) ? window.fv3StatsCallbacks.length : null
            });
        } catch (_) {}
        return {
            fonts,
            stats,
            icons,
            scrollbarGutter: (parentW != null) ? (window.innerWidth - parentW) : null,
            docClientWidth: document.documentElement.clientWidth,
            outerWidth: window.outerWidth,
            widthFixDiff: (typeof window.fv3WidthFixDiff === 'function') ? window.fv3WidthFixDiff() : null
        };
    };
    // Browser-measured load timing — navigation milestones + per-resource network timings for
    // the plugin's own assets and the preview-icon hosts. Lets you compare "when did each icon
    // finish downloading" against the width-fix run times in env.milestones (the race signal).
    const collectPerf = () => {
        const out = { navigation: null, resources: [] };
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) out.navigation = {
                type: nav.type,
                responseStart: Math.round(nav.responseStart),
                domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
                loadEventEnd: Math.round(nav.loadEventEnd),
                duration: Math.round(nav.duration)
            };
            const want = /folder\.view3|githubusercontent|hotio\.dev|jsdelivr|lscr\.io|ghcr\.io|notifiarr|\.png|\.svg/i;
            out.resources = performance.getEntriesByType('resource')
                .filter(r => want.test(r.name))
                .slice(-80)
                .map(r => ({
                    name: r.name.replace(/^https?:\/\//, '').slice(0, 90),
                    type: r.initiatorType,
                    start: Math.round(r.startTime),
                    end: Math.round(r.responseEnd),
                    dur: Math.round(r.duration),
                    size: r.transferSize || 0
                }));
        } catch (_) {}
        return out;
    };
    // Table + ancestor widths — to spot a container/table forcing an unexpected width, or a
    // duplicate/nested #docker_containers table that the folder rows might land in.
    const collectTableGeom = () => {
        const t = document.getElementById('docker_containers');
        if (!t) return null;
        const cs = getComputedStyle(t);
        const chain = [];
        let el = t;
        for (let i = 0; i < 5 && el; i++) {
            const r = el.getBoundingClientRect();
            chain.push({ tag: el.tagName, id: el.id || '', cls: (el.className || '').slice(0, 30), clientW: el.clientWidth, rectW: Math.round(r.width) });
            el = el.parentElement;
        }
        return {
            count: document.querySelectorAll('#docker_containers').length,
            nestedTables: t.querySelectorAll('table').length,
            tableLayout: cs.tableLayout, width: cs.width, minWidth: cs.minWidth,
            offsetWidth: t.offsetWidth, clientWidth: t.clientWidth, chain
        };
    };
    return {
        capturedAt: new Date().toISOString(),
        viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
        userAgent: navigator.userAgent,
        path: location.pathname,
        unraidTheme: window.fv3UnraidTheme,
        graphqlAvailable: window.fv3ApiAvailable,
        advancedViewDocker: getCookie('display') === 'advanced',
        advancedViewVM: getCookie('display_vm') === 'advanced',
        bodyFv3Attrs: {
            unraid: document.body.getAttribute('data-fv3-unraid'),
            preset: document.body.getAttribute('data-fv3-preset'),
            toggle: document.body.getAttribute('data-fv3-toggle')
        },
        externalInjections: {
            dockerVersions: !!document.querySelector('.changelog, .change-log-summary'),
            unraidNet: !!document.querySelector('[id*="unraid-net"], .unraid-net-connect-banner'),
            composeManager: !!document.querySelector('#compose'),
            foreignPluginScripts: [...document.querySelectorAll('script[src*="/plugins/"]')]
                .map(s => s.getAttribute('src'))
                .filter(src => src && !src.includes('/plugins/folder.view3/'))
                .slice(0, 20)
        },
        tables: { docker: tableSize('docker_containers'), vm: tableSize('kvm_table') },
        unraidRelease: window.fv3UnraidRelease || null,
        tableLayout: collectTableLayout(),
        tableGeom: collectTableGeom(),
        foldersRendered: collectFolders(),
        samples: {
            folderPreview: sample('tr.folder .folder-preview'),
            folderPreviewScroll: sample('tr.folder .folder-preview.fv3-overflow-scroll'),
            folderPreviewExpand: sample('tr.folder .folder-preview.fv3-overflow-expand'),
            folderNameSub: sample('tr.folder .folder-name-sub'),
            folderNameTd: sample('tr.folder td.folder-name'),
            ctName: sample('#docker_containers tr.sortable:not(.folder) td.ct-name, #docker_containers tr.folder-element td.ct-name'),
            updateColumn: sample('#docker_containers tr.sortable:not(.folder) td.updatecolumn, #docker_containers tr.folder-element td.updatecolumn')
        },
        cssVariables: readCssVars([
            '--fv3-accent-color',
            '--fv3-appname-color',
            '--fv3-toggle-color',
            '--fv3-toggle-hover-color',
            '--fv3-folder-row-border-width',
            '--fv3-folder-row-border-color',
            '--fv3-folder-row-radius',
            '--fv3-folder-row-padding',
            '--fv3-preview-row-border-width',
            '--fv3-preview-row-border-color',
            '--fv3-folder-preview-bg',
            '--fv3-preview-icon-size',
            '--fv3-folder-icon-size',
            '--fv3-folder-name-weight',
            '--fv3-border'
        ]),
        stylesheets: collectStylesheets(),
        foreignStylesheets: collectForeignStylesheets(),
        customExtensions: {
            customPhpLoaded: !!document.querySelector('link[href*="/folder.view3/custom.php"], script[src*="/folder.view3/custom.php"]'),
            fv3PresetStyles: [...document.querySelectorAll('style[id^="fv3-"], style.fv3-preset-styles')].map(s => s.id || s.className).slice(0, 10)
        },
        // Eviction-proof page-load timeline + browser-measured timing, captured before
        // renderSignals re-runs the width-fix (which would add a 'widthfix' mark).
        milestones: Object.assign({}, window.fv3Milestones),
        iconLoads: [...(window.fv3IconLoads || [])],
        perf: collectPerf(),
        // renderSignals re-runs the width-fix to compute its diff, so it is evaluated last;
        // tableLayout/previewGeom above captured the original (pre-rerun) locked state.
        renderSignals: collectRenderSignals(),
        traceBuffer: [...(window.fv3TraceBuffer || [])]
    };
};

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
// fixing the old bug where env was captured before folders/the width-fix existed.
window.fv3DebugPayloads = {};
window.fv3DebugSource = null;
window.fv3CaptureDebug = (source) => {
    source = source || window.fv3DebugSource || 'UNKNOWN';
    const stored = window.fv3DebugPayloads[source];
    let payload;
    if (stored) {
        try { payload = JSON.parse(stored); } catch (_) { payload = { rawBody: stored }; }
    } else {
        payload = { _note: 'no stored payload for ' + source + '; arm debug (type fv3debug) and reload for full data', folders: window.globalFolders || {} };
    }
    fv3DownloadDebugJSON('debug-' + source + '.json', JSON.stringify(payload));
    return true;
};

window.fv3RunUserScript = async (act, prom) => {
    const args = act.script_args || '';
    if(act.script_sync) {
        let scriptVariables = {};
        let rawVars = await $.post("/plugins/user.scripts/exec.php",{action:'getScriptVariables',script:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`}).promise();
        rawVars.trim().split('\n').forEach((e) => { const variable = e.split('='); scriptVariables[variable[0]] = variable[1] });
        if(scriptVariables['directPHP']) {
            $.post("/plugins/user.scripts/exec.php",{action:'directRunScript',path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`},function(data) {if(data) { openBox(data,act.name,800,1200, 'loadlist');}});
        } else {
            $.post("/plugins/user.scripts/exec.php",{action:'convertScript',path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`},function(data) {if(data) {openBox('/plugins/user.scripts/startScript.sh&arg1='+data+'&arg2='+args,act.name,800,1200,true, 'loadlist');}});
        }
    } else {
        const cmd = await $.post("/plugins/user.scripts/exec.php",{action:'convertScript', path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`}).promise();
        prom.push($.get('/logging.htm?cmd=/plugins/user.scripts/backgroundScript.sh&arg1='+cmd+'&arg2='+args+'&csrf_token='+csrf_token+'&done=Done').promise());
    }
};

// Row separators
window.fv3UpdateRowSeparators = (folderMap, folderId) => {
    const ids = folderId ? [folderId] : Object.keys(folderMap);
    ids.forEach(id => {
        const folder = folderMap[id];
        if (!folder || !folder.settings.preview_row_separator || folder.settings.preview_overflow !== 1) return;
        const preview = $(`tr.folder-id-${id} div.folder-preview`)[0];
        if (!preview) return;
        preview.querySelectorAll('.fv3-row-separator').forEach(el => el.remove());
        const wrappers = $(`tr.folder-id-${id} div.folder-preview .folder-preview-wrapper`).get();
        if (wrappers.length < 2) return;
        let lastTop = wrappers[0].offsetTop;
        const rows = [[]];
        wrappers.forEach(w => {
            if (w.offsetTop - lastTop > w.offsetHeight / 2) { rows.push([]); lastTop = w.offsetTop; }
            rows[rows.length - 1].push(w);
        });
        if (rows.length > 1) {
            const sepColor = folder.settings.preview_row_separator_color || '';
            for (let i = 0; i < rows.length - 1; i++) {
                const lastInRow = rows[i][rows[i].length - 1];
                const nextRowFirst = rows[i + 1][0];
                const bottom = lastInRow.offsetTop + lastInRow.offsetHeight;
                const top = nextRowFirst.offsetTop;
                const sep = document.createElement('div');
                sep.className = 'fv3-row-separator';
                sep.style.top = Math.round((bottom + top) / 2) + 'px';
                if (sepColor) {
                    if (folder.settings.lock_colors) {
                        sep.style.backgroundColor = sepColor;
                    } else {
                        sep.style.setProperty('--fv3-separator-color', sepColor);
                    }
                }
                preview.appendChild(sep);
            }
        }
    });
};

window._fv3FolderMapGetter = null;
let _fv3SepTimer;

// Preview height sync
window.fv3SyncPreviewHeights = (cookieName) => {
    const isAdvanced = $.cookie(cookieName) == 'advanced';
    document.querySelectorAll('tr.folder div.folder-preview:not(.fv3-overflow-expand)').forEach(el => {
        el.style.height = '';
        const cpuCell = el.closest('tr').querySelector('td.folder-advanced');
        if (isAdvanced && cpuCell && cpuCell.offsetHeight > 0) {
            const targetHeight = cpuCell.offsetHeight - 10;
            const defaultHeight = el.offsetHeight;
            if (targetHeight > defaultHeight) {
                el.style.height = targetHeight + 'px';
            }
        }
    });
    document.querySelectorAll('tr.folder .folder-preview').forEach(el => {
        if (el._fv3CheckExpand) el._fv3CheckExpand();
        if (el._fv3ClipPreview) el._fv3ClipPreview();
    });
    if (_fv3FolderMapGetter) {
        clearTimeout(_fv3SepTimer);
        _fv3SepTimer = setTimeout(() => fv3UpdateRowSeparators(_fv3FolderMapGetter()), 300);
    }
    if (window.fv3SchedulePillSize) window.fv3SchedulePillSize();
};

// Unraid GraphQL API detection + helpers
window.fv3ApiAvailable = null;
window.fv3CpuCores = null;
window.fv3UnraidTheme = null;

window.fv3DetectApi = async () => {
    if (fv3ApiAvailable !== null) return fv3ApiAvailable;
    try {
        const resp = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof csrf_token !== 'undefined' ? csrf_token : '' },
            credentials: 'same-origin',
            body: JSON.stringify({ query: '{ info { os { release } cpu { cores } } }' })
        });
        if (resp.ok) {
            const json = await resp.json();
            if (json.errors && json.errors.length) { fv3ApiAvailable = false; fv3Debug('API', 'GraphQL returned error:', json.errors[0].message); return fv3ApiAvailable; }
            fv3ApiAvailable = !!(json && json.data && json.data.info && json.data.info.os && json.data.info.os.release);
            if (fv3ApiAvailable) {
                window.fv3UnraidRelease = json.data.info.os.release;
                fv3Debug('API', 'Unraid GraphQL API detected, release:', json.data.info.os.release);
                if (json.data.info.cpu && json.data.info.cpu.cores) {
                    fv3CpuCores = json.data.info.cpu.cores;
                    fv3Debug('API', 'CPU cores from API:', fv3CpuCores);
                }
            }
        } else {
            fv3ApiAvailable = false;
        }
    } catch (e) {
        fv3ApiAvailable = false;
    }
    if (!fv3ApiAvailable) fv3Debug('API', 'GraphQL not available, using PHP fallback');
    return fv3ApiAvailable;
};

window.fv3GraphQL = async (query, variables) => {
    const resp = await fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof csrf_token !== 'undefined' ? csrf_token : '' },
        credentials: 'same-origin',
        body: JSON.stringify(variables ? { query: query, variables: variables } : { query: query })
    });
    if (!resp.ok) throw new Error('GraphQL HTTP ' + resp.status);
    const json = await resp.json();
    if (json.errors && json.errors.length) throw new Error(json.errors[0].message);
    return json.data;
};

window.fv3DetectTheme = async () => {
    if (window.fv3UnraidTheme !== null) return;
    window.fv3UnraidTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    if (!fv3ApiAvailable) return;
    try {
        const data = await fv3GraphQL('{ display { theme } }');
        if (data && data.display && data.display.theme) {
            window.fv3UnraidTheme = data.display.theme;
            fv3Debug('API', 'Unraid theme:', window.fv3UnraidTheme);
        }
    } catch (e) {}
};

window.fv3IsDarkTheme = () => {
    const t = window.fv3UnraidTheme;
    if (t === 'black' || t === 'gray' || t === 'dark') return true;
    if (t === 'azure' || t === 'white' || t === 'light') return false;
    return document.documentElement.classList.contains('dark');
};

// Action name mapping: FV3 → GraphQL
var fv3DockerActionMap = {
    start: 'start', stop: 'stop', restart: 'restart', pause: 'pause', resume: 'unpause'
};
var fv3VmActionMap = {
    'domain-start': 'start', 'domain-stop': 'stop', 'domain-pause': 'pause',
    'domain-resume': 'resume', 'domain-restart': 'reboot', 'domain-destroy': 'forceStop',
    'domain-reset': 'reset'
};

window.fv3ContainerAction = async (type, id, action) => {
    if (await fv3DetectApi()) {
        var map = type === 'docker' ? fv3DockerActionMap : fv3VmActionMap;
        var gqlAction = map[action];
        if (gqlAction) {
            try {
                fv3Debug('API', type + ' action via GraphQL:', gqlAction, id);
                if (type === 'docker') {
                    await fv3GraphQL('mutation($id: PrefixedID!) { docker { ' + gqlAction + '(id: $id) { id } } }', { id: id });
                } else {
                    await fv3GraphQL('mutation($id: PrefixedID!) { vm { ' + gqlAction + '(id: $id) } }', { id: id });
                }
                return { success: true };
            } catch (e) {
                fv3DebugWarn('API', type + ' action GraphQL failed, falling back:', e.message);
            }
        }
    }
    return null;
};

window.fv3DockerAction = (action, containerId, fullId) => {
    var gqlAction = fv3DockerActionMap[action];
    var phpFallback = () => $.post(window.eventURL || '/update.htm', { action: action, container: containerId }, null, 'json').promise()
        .fail(() => fv3ShowBanner('Could not ' + action + ' container. Check your server connection.'));
    if (fv3ApiAvailable && gqlAction && fullId) {
        return fv3GraphQL('mutation($id: PrefixedID!) { docker { ' + gqlAction + '(id: $id) { id } } }', { id: fullId })
            .then(() => { fv3Debug('API', 'Docker', gqlAction, containerId, 'OK'); return { success: true }; })
            .catch((e) => {
                fv3DebugWarn('API', 'Docker GraphQL failed, falling back:', e.message);
                return phpFallback();
            });
    }
    return phpFallback();
};

window.fv3VmAction = (action, uuid) => {
    var gqlAction = fv3VmActionMap[action];
    var phpFallback = () => $.post('/plugins/dynamix.vm.manager/include/VMajax.php', { action: action, uuid: uuid }, null, 'json').promise()
        .fail(() => fv3ShowBanner('Could not ' + action.replace('domain-', '') + ' VM. Check your server connection.'));
    if (fv3ApiAvailable && gqlAction) {
        return fv3GraphQL('mutation($id: PrefixedID!) { vm { ' + gqlAction + '(id: $id) } }', { id: uuid })
            .then(() => { fv3Debug('API', 'VM', gqlAction, uuid, 'OK'); return { success: true }; })
            .catch((e) => {
                fv3DebugWarn('API', 'VM GraphQL failed, falling back:', e.message);
                return phpFallback();
            });
    }
    return phpFallback();
};

window.fv3CheckUpdates = async () => {
    if (!await fv3DetectApi()) return {};
    try {
        var data = await fv3GraphQL('{ docker { containerUpdateStatuses { name updateStatus } } }');
        var statuses = data && data.docker && data.docker.containerUpdateStatuses;
        if (!statuses) return {};
        var result = {};
        for (var i = 0; i < statuses.length; i++) {
            result[statuses[i].name] = statuses[i].updateStatus;
        }
        fv3Debug('API', 'Update check complete:', Object.keys(result).length, 'containers');
        return result;
    } catch (e) {
        fv3Debug('API', 'Update check failed:', e.message);
        return {};
    }
};

// Organizer sync
window.fv3OrganizerSyncDone = false;

window.fv3SyncOrganizer = async (folders) => {
    if (!fv3ApiAvailable || fv3OrganizerSyncDone) return;
    fv3OrganizerSyncDone = true;

    try {
        var data = await fv3GraphQL(
            '{ docker { organizer { views { id flatEntries { id type name childrenIds } } } } }'
        );
        var views = data && data.docker && data.docker.organizer && data.docker.organizer.views;
        if (!views || !views.length) { fv3Debug('OrgSync', 'No organizer views, skipping'); return; }

        var entries = views[0].flatEntries || [];
        var orgFolders = {};
        var orgEntries = {};
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (e.type === 'folder' || e.type === 'group') {
                if (!orgFolders[e.name]) orgFolders[e.name] = e;
            } else {
                orgEntries[e.name] = e.id;
            }
        }

        var seen = {};
        var created = 0, updated = 0;

        for (var fv3Id in folders) {
            var folder = folders[fv3Id];
            var name = folder.name;
            if (!name || seen[name]) continue;
            seen[name] = true;

            var containerNames = folder.containers ? Object.keys(folder.containers) : [];
            var childIds = containerNames.map(function(n) { return orgEntries[n]; }).filter(Boolean);

            var existing = orgFolders[name];
            if (existing) {
                var cur = {};
                (existing.childrenIds || []).forEach(function(id) { cur[id] = true; });
                var want = {};
                childIds.forEach(function(id) { want[id] = true; });
                var curKeys = Object.keys(cur);
                var wantKeys = Object.keys(want);
                if (curKeys.length !== wantKeys.length || !wantKeys.every(function(id) { return cur[id]; })) {
                    await fv3GraphQL(
                        'mutation($fid: String!, $cids: [String!]!) { setDockerFolderChildren(folderId: $fid, childrenIds: $cids) { version } }',
                        { fid: existing.id, cids: childIds }
                    );
                    updated++;
                }
            } else {
                await fv3GraphQL(
                    'mutation($n: String!, $ids: [String!]) { createDockerFolderWithItems(name: $n, sourceEntryIds: $ids) { version } }',
                    { n: name, ids: childIds }
                );
                created++;
            }
        }

        if (created || updated) fv3Debug('OrgSync', 'Done:', { created: created, updated: updated });
    } catch (e) {
        fv3DebugWarn('OrgSync', 'Sync failed (non-fatal):', e.message);
    }
};

// Stats connections
window.fv3StatsConnection = null;
window.fv3StatsCallbacks = [];
// Live-stats diagnostics: which transport is active and whether data is actually flowing.
// Covers the "graphs blank/frozen" class of report that the layout capture can't see.
window.fv3StatsState = { transport: null, lastStatAt: null, statCount: 0, fallbacks: 0 };
window.fv3StatsMark = (transport) => {
    window.fv3StatsState.transport = transport;
    window.fv3StatsState.lastStatAt = Math.round((typeof performance !== 'undefined' && performance.now ? performance.now() : 0) * 10) / 10;
    window.fv3StatsState.statCount++;
    window.fv3Mark('stats-first');
};

window.fv3ConnectStats = (onData, onFallback) => {
    if (fv3ApiAvailable) {
        fv3StatsCallbacks.push(onData);
        if (fv3StatsConnection && fv3StatsConnection.readyState <= 1) {
            fv3Debug('API', 'WebSocket already connected, added listener');
            return fv3StatsConnection;
        }
        try {
            return fv3ConnectStatsWebSocket(onFallback);
        } catch (e) {
            fv3DebugWarn('API', 'WebSocket stats init failed, using SSE');
            if (onFallback) onFallback();
        }
    }
    return null;
};

window.fv3ConnectStatsWebSocket = (onFallback) => {
    var wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/graphql';
    var ws = new WebSocket(wsUrl, 'graphql-transport-ws');

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'connection_init', payload: { 'x-csrf-token': typeof csrf_token !== 'undefined' ? csrf_token : '' } }));
        setTimeout(() => {
            ws.send(JSON.stringify({
                id: 'fv3-stats',
                type: 'subscribe',
                payload: { query: 'subscription { dockerContainerStats { id cpuPercent memUsage } }' }
            }));
        }, 200);
        window.fv3StatsState.transport = 'websocket';
        fv3Debug('API', 'WebSocket stats connected');
    };

    ws.onmessage = (event) => {
        var msg = fv3SafeParse(event.data, null);
        if (!msg) return;
        if (msg.type === 'next' && msg.payload && msg.payload.data && msg.payload.data.dockerContainerStats) {
            var raw = msg.payload.data.dockerContainerStats;
            var cleanId = raw.id.replace(/[\x00-\x1f]/g, '').split(':').pop();
            var stat = {
                shortId: cleanId.substring(0, 12),
                cpuPercent: raw.cpuPercent,
                mem: raw.memUsage.split(' / ')
            };
            window.fv3StatsMark('websocket');
            for (var i = 0; i < fv3StatsCallbacks.length; i++) {
                try { fv3StatsCallbacks[i](stat); } catch(e) {}
            }
        } else if (msg.type === 'error') {
            fv3DebugWarn('API', 'WebSocket subscription error:', msg.payload);
            ws.close();
        }
    };

    ws.onerror = () => {
        fv3DebugWarn('API', 'WebSocket stats error, falling back to SSE');
        fv3StatsConnection = null;
        fv3StatsCallbacks = [];
        window.fv3StatsState.fallbacks++;
        window.fv3StatsState.transport = 'sse';
        if (onFallback) onFallback();
    };

    var fv3WsClosing = false;
    ws.onclose = () => {
        if (fv3StatsConnection === ws) {
            fv3StatsConnection = null;
            fv3StatsCallbacks = [];
            if (!fv3WsClosing && onFallback) { window.fv3StatsState.fallbacks++; window.fv3StatsState.transport = 'sse'; onFallback(); }
        }
    };

    fv3StatsConnection = ws;
    fv3Cleanups.push(() => { fv3WsClosing = true; if (ws.readyState <= 1) ws.close(); });
    return ws;
};

window.fv3DisconnectStats = () => {
    if (fv3StatsConnection) {
        if (fv3StatsConnection.close) fv3StatsConnection.close();
        fv3StatsConnection = null;
    }
};

fv3Cleanups.push(fv3DisconnectStats);

fv3DetectApi().then(() => fv3DetectTheme());

// Preview mode setup (overflow: expand / overflow: scroll)
window.fv3SetupPreviewMode = (folder, id, globalFolders) => {
    const $preview = $(`tr.folder-id-${id} div.folder-preview`);
    const el = $preview[0];
    if (!el) return;
    if (window.fv3RecordIconLoads) window.fv3RecordIconLoads(el);

    if (folder.settings.preview_overflow === 1) {
        $preview.addClass('fv3-overflow-expand');
        if (folder.settings.preview_row_separator) {
            $preview.addClass('fv3-has-separators');
        }
        const checkExpand = () => {
            const wrappers = el.querySelectorAll('.folder-preview-wrapper');
            const isWrapped = wrappers.length >= 2 &&
                wrappers[wrappers.length - 1].offsetTop - wrappers[0].offsetTop > wrappers[0].offsetHeight / 2;
            const wasExpand = el.classList.contains('fv3-overflow-expand');
            if (isWrapped && !wasExpand) el.classList.add('fv3-overflow-expand');
            else if (!isWrapped && wasExpand) el.classList.remove('fv3-overflow-expand');
            if (isWrapped) {
                const prev = el.style.minHeight;
                el.style.minHeight = '';
                void el.offsetHeight;
                const needed = el.scrollHeight + 'px';
                if (prev !== needed) el.style.minHeight = needed;
                else el.style.minHeight = prev;
            } else if (el.style.minHeight) {
                el.style.minHeight = '';
            }
        };
        const onPreviewSettled = () => {
            checkExpand();
            if (folder.settings.preview_row_separator) fv3UpdateRowSeparators(globalFolders, id);
        };
        el._fv3CheckExpand = onPreviewSettled;
        requestAnimationFrame(onPreviewSettled);
        el.querySelectorAll('img').forEach(img => {
            if (!img.complete) {
                img.addEventListener('load', () => requestAnimationFrame(onPreviewSettled), { once: true });
                img.addEventListener('error', () => requestAnimationFrame(onPreviewSettled), { once: true });
            }
        });
        const ro = new ResizeObserver(() => requestAnimationFrame(onPreviewSettled));
        ro.observe(el);
        fv3Cleanups.push(() => ro.disconnect());
    } else if (folder.settings.preview_overflow === 2) {
        $preview.addClass('fv3-overflow-scroll');
        requestAnimationFrame(() => {
            if (el.scrollWidth <= el.clientWidth) {
                el.classList.remove('fv3-overflow-scroll');
            }
        });
        const ro = new ResizeObserver(() => {
            el.classList.add('fv3-overflow-scroll');
            requestAnimationFrame(() => {
                if (el.scrollWidth <= el.clientWidth) {
                    el.classList.remove('fv3-overflow-scroll');
                }
            });
        });
        ro.observe(el);
        fv3Cleanups.push(() => ro.disconnect());
    } else {
        const clipPreview = () => {
            const children = el.children;
            for (let i = 0; i < children.length; i++) {
                children[i].style.display = '';
            }
            let firstTop = -1;
            let clipping = false;
            let lastVisibleDivider = null;
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const isWrapper = child.classList.contains('folder-preview-wrapper');
                const isDivider = child.classList.contains('folder-preview-divider');
                if (clipping) {
                    child.style.display = 'none';
                    continue;
                }
                if (isWrapper) {
                    if (firstTop < 0) firstTop = child.offsetTop;
                    if (child.offsetTop - firstTop > child.offsetHeight / 2) {
                        clipping = true;
                        child.style.display = 'none';
                        if (lastVisibleDivider) lastVisibleDivider.style.display = 'none';
                        continue;
                    }
                }
                if (isDivider) lastVisibleDivider = child;
            }
        };
        el._fv3ClipPreview = clipPreview;
        requestAnimationFrame(clipPreview);
        el.querySelectorAll('img').forEach(img => {
            if (!img.complete) {
                img.addEventListener('load', () => requestAnimationFrame(clipPreview), { once: true });
            }
        });
        const ro = new ResizeObserver(() => requestAnimationFrame(clipPreview));
        ro.observe(el);
        fv3Cleanups.push(() => ro.disconnect());
    }
};

// Docker table column-width lock
window.fv3InstallDockerTableWidthFix = () => {
    _fv3WidthFixRuns++;
    window.fv3Mark('widthfix');
    fv3Debug('WidthFix', 'run #' + _fv3WidthFixRuns);
    const STYLE_ID = 'fv3-width-style';
    const tbl = document.querySelector('#docker_containers');
    if (!tbl) return;
    const headers = Array.from(tbl.querySelectorAll('thead > tr > th'));
    if (!headers.length) return;

    document.getElementById(STYLE_ID)?.remove();
    headers.forEach(th => { th.style.width = ''; th.style.boxSizing = ''; });
    tbl.style.tableLayout = '';
    void tbl.offsetHeight;
    void document.body.offsetHeight;

    const firstFolder = tbl.querySelector('tr.folder');
    if (!firstFolder) return;

    const containerW = (tbl.parentElement && tbl.parentElement.clientWidth) || tbl.clientWidth;
    const targetW = containerW - 2;

    const maxCols = headers.map(h => h.getBoundingClientRect().width);
    let verContentMax = 0;

    Array.from(tbl.querySelectorAll('tr.folder')).forEach(folder => {
        const storage = folder.querySelector('.folder-storage');
        if (!storage || !storage.children.length) return;
        const children = Array.from(storage.children);
        const origStyles = children.map(c => c.getAttribute('style') || '');
        children.forEach(c => c.style.cssText += ';visibility:hidden !important;');
        children.forEach(c => folder.parentNode.insertBefore(c, folder.nextSibling));
        void tbl.offsetHeight;
        headers.forEach((h, i) => {
            const w = h.getBoundingClientRect().width;
            if (w > maxCols[i]) maxCols[i] = w;
        });
        children.forEach(row => {
            const verTd = row.querySelector('td:nth-child(2)');
            if (!verTd) return;
            Array.from(verTd.children).forEach(el => {
                if (getComputedStyle(el).display === 'none') return;
                const w = el.getBoundingClientRect().width;
                if (w > verContentMax) verContentMax = w;
            });
        });
        children.forEach(c => storage.appendChild(c));
        children.forEach((c, i) => c.setAttribute('style', origStyles[i]));
    });
    void tbl.offsetHeight;

    let verCap = 0;
    if (verContentMax > 0) {
        verCap = Math.ceil(verContentMax + 2);
        const verCell = firstFolder.querySelector('td.folder-update');
        if (verCell) {
            const verCs = getComputedStyle(verCell);
            const verPad = parseFloat(verCs.paddingLeft || '0') + parseFloat(verCs.paddingRight || '0');
            const verHint = Math.ceil(verCap + verPad + 2);
            maxCols[1] = verHint;
        }
    }

    const displayHidden = headers.map(h => h.offsetParent === null && h.getBoundingClientRect().width === 0);
    displayHidden.forEach((hidden, i) => { if (hidden) maxCols[i] = 0; });

    const autostartIdx = headers.findIndex(h => h.classList && h.classList.contains('nine'));
    if (autostartIdx >= 0 && !displayHidden[autostartIdx]) {
        const folderRow = tbl.querySelector('tr.folder');
        const cell = folderRow?.children[folderRow.children.length - 2];
        let visibleNeed = 100;
        if (cell) {
            const switchBg = cell.querySelector('.switch-button-background');
            const labels = Array.from(cell.querySelectorAll('.switch-button-label'))
                .filter(l => getComputedStyle(l).display !== 'none');
            let total = 0;
            if (switchBg) total += switchBg.getBoundingClientRect().width;
            for (const l of labels) total += l.getBoundingClientRect().width;
            if (total > 0) visibleNeed = Math.max(Math.ceil(total) + 24, 100);
        }
        if (maxCols[autostartIdx] > visibleNeed) maxCols[autostartIdx] = visibleNeed;
    }

    const distributeSlack = (cols) => {
        const sum = cols.reduce((a, b) => a + b, 0);
        const widths = cols.map(Math.ceil);
        if (sum > targetW) {
            const overflow = sum - targetW;
            let flex = 0;
            for (let i = 2; i <= 6; i++) flex += cols[i];
            if (flex > overflow) {
                const scale = (flex - overflow) / flex;
                for (let i = 2; i <= 6; i++) widths[i] = Math.max(40, Math.floor(cols[i] * scale));
            }
        } else if (sum < targetW) {
            const extra = targetW - sum;
            let flex = 0;
            for (let i = 2; i <= 6; i++) if (cols[i] > 0) flex += cols[i];
            if (flex > 0) {
                for (let i = 2; i <= 6; i++) {
                    if (cols[i] > 0) widths[i] = Math.floor(cols[i] + extra * (cols[i] / flex));
                }
            }
        }
        let finalSum = widths.reduce((a, b) => a + b, 0);
        if (finalSum !== targetW) {
            const diff = targetW - finalSum;
            if (widths[6] + diff >= 60) widths[6] += diff;
        }
        return widths;
    };

    const widthsExpanded = distributeSlack(maxCols);

    const uptimeIdx = headers.findIndex(h => h.classList && h.classList.contains('five'));
    const volMappingsIdx = 6;
    const widthsCollapsed = widthsExpanded.slice();
    if (uptimeIdx >= 0 && !displayHidden[uptimeIdx] && widthsExpanded[uptimeIdx] > 0
        && volMappingsIdx >= 0 && volMappingsIdx < widthsCollapsed.length) {
        const freed = widthsCollapsed[uptimeIdx];
        widthsCollapsed[uptimeIdx] = 0;
        widthsCollapsed[volMappingsIdx] += freed;
    }

    _fv3WidthSnapshots = {
        expanded: widthsExpanded,
        collapsed: widthsCollapsed,
        displayHidden,
        verCap,
        headerCount: headers.length,
    };

    fv3ApplyCachedWidths();

    if (verCap > 0) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #docker_containers td.folder-update *,
            #docker_containers tr:not(.folder) > td:nth-child(2) * {
                max-width: ${verCap}px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        `;
        document.head.appendChild(style);
    }
    fv3Debug('WidthFix', `containerW=${containerW} targetW=${targetW} verCap=${verCap} expanded=`, widthsExpanded, 'collapsed=', widthsCollapsed);
};

let _fv3WidthSnapshots = null;
let _fv3WidthFixRuns = 0;

// Diagnostic accessor: the locked column-width snapshot is otherwise a module-local.
window.fv3GetWidthState = () => ({ snapshots: _fv3WidthSnapshots, runs: _fv3WidthFixRuns });

// Recompute-and-diff: re-run the width-fix now (icons/fonts have since loaded) and diff the
// freshly computed widths against what is currently locked. A non-zero delta proves the
// applied layout was stale — the smoking gun for a measure-before-load race. Re-running is
// safe: it is idempotent and already fires on window resize.
window.fv3WidthFixDiff = () => {
    const tbl = document.querySelector('#docker_containers');
    if (!tbl || !_fv3WidthSnapshots) return { available: false };
    const before = { expanded: [..._fv3WidthSnapshots.expanded], collapsed: [..._fv3WidthSnapshots.collapsed] };
    try { fv3InstallDockerTableWidthFix(); } catch (e) { return { available: false, error: String(e) }; }
    const after = { expanded: [..._fv3WidthSnapshots.expanded], collapsed: [..._fv3WidthSnapshots.collapsed] };
    const delta = before.expanded.map((w, i) => (after.expanded[i] ?? 0) - w);
    const changed = delta.some(d => Math.abs(d) > 1);
    return { available: true, changed, delta, before, after };
};

window.fv3AnyNonFolderRowVisible = () => {
    const tbl = document.querySelector('#docker_containers');
    if (!tbl) return false;
    const rows = tbl.querySelectorAll('tbody > tr:not(.folder)');
    for (const r of rows) {
        if (getComputedStyle(r).display === 'none') continue;
        return true;
    }
    return false;
};

window.fv3ApplyCachedWidths = () => {
    const snap = _fv3WidthSnapshots;
    if (!snap) return;
    const tbl = document.querySelector('#docker_containers');
    if (!tbl) return;
    const headers = Array.from(tbl.querySelectorAll('thead > tr > th'));
    if (headers.length !== snap.headerCount) return;
    const widths = fv3AnyNonFolderRowVisible() ? snap.expanded : snap.collapsed;
    headers.forEach((th, i) => {
        if (snap.displayHidden[i]) return;
        th.style.boxSizing = 'border-box';
        th.style.width = widths[i] + 'px';
        if (widths[i] === 0) {
            th.style.padding = '0';
            th.style.fontSize = '0';
        } else {
            th.style.padding = '';
            th.style.fontSize = '';
        }
    });
    // table-layout:fixed gives stable columns, but at FRACTIONAL devicePixelRatio (e.g. Windows
    // display scaling 125%) the browser's fixed-layout colspan distribution breaks and collapses
    // the folder preview cell (a colspan cell), pushing it right / clipping it. FolderView2 never
    // had this because it used the browser's default (auto) layout. So only lock to fixed at
    // INTEGER DPR; at fractional DPR fall back to auto layout (the th width hints above keep the
    // columns aligned), which sizes the colspan cell correctly. Setting widths on the body cells
    // does NOT help — under table-layout:fixed the column widths come from the <th>, not the cells.
    tbl.style.tableLayout = Number.isInteger(window.devicePixelRatio) ? 'fixed' : 'auto';
    if (window.fv3SchedulePillSize) window.fv3SchedulePillSize();
};

let _fv3WidthFixTimer;
window.fv3ScheduleWidthFix = () => {
    clearTimeout(_fv3WidthFixTimer);
    _fv3WidthFixTimer = setTimeout(() => {
        try { fv3InstallDockerTableWidthFix(); } catch (e) { fv3DebugWarn('WidthFix', e.message); }
    }, 150);
};

let _fv3ApplyTimer;
window.fv3ScheduleApplyCachedWidths = () => {
    clearTimeout(_fv3ApplyTimer);
    _fv3ApplyTimer = setTimeout(() => {
        try { fv3ApplyCachedWidths(); } catch (e) { fv3DebugWarn('ApplyWidths', e.message); }
    }, 50);
};

// Pill height invariants (do not break):
//   1. Clear inline height before measuring; otherwise the pill props the cell open.
//   2. Observe preview CELL not row — observing the row causes growth loops.
const _fv3PreviewObserved = new WeakSet();
const _fv3PreviewRO = ('ResizeObserver' in window) ? new ResizeObserver(() => {
    requestAnimationFrame(() => {
        try { fv3SizeFolderPills(); } catch (e) { fv3DebugWarn('PillSize', e.message); }
    });
}) : null;
if (_fv3PreviewRO) fv3Cleanups.push(() => _fv3PreviewRO.disconnect());

window.fv3SizeFolderPills = () => {
    if (!document.body.hasAttribute('data-fv3-preset')) return;
    document.querySelectorAll('tr.folder > td.folder-name').forEach(td => {
        const sub = td.querySelector('.folder-name-sub');
        if (!sub) return;
        const cs = getComputedStyle(td);
        const pad = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0');
        sub.style.height = '';
        const h = td.getBoundingClientRect().height - pad;
        if (h > 0) sub.style.height = h + 'px';
        const previewCell = td.parentElement?.querySelector('.folder-preview')?.closest('td');
        if (_fv3PreviewRO && previewCell && !_fv3PreviewObserved.has(previewCell)) {
            _fv3PreviewRO.observe(previewCell);
            _fv3PreviewObserved.add(previewCell);
        }
    });
};

let _fv3PillTimer;
window.fv3SchedulePillSize = () => {
    clearTimeout(_fv3PillTimer);
    _fv3PillTimer = setTimeout(() => {
        try { fv3SizeFolderPills(); } catch (e) { fv3DebugWarn('PillSize', e.message); }
    }, 50);
};

(function() {
    if (typeof folderEvents !== 'undefined') {
        folderEvents.addEventListener('docker-post-folders-creation', fv3SchedulePillSize);
        folderEvents.addEventListener('vm-post-folders-creation', fv3SchedulePillSize);
        folderEvents.addEventListener('docker-post-folder-expansion', fv3SchedulePillSize);
        folderEvents.addEventListener('vm-post-folder-expansion', fv3SchedulePillSize);
        folderEvents.addEventListener('docker-post-folder-expansion', fv3ScheduleApplyCachedWidths);
    }
    window.addEventListener('resize', fv3SchedulePillSize);
})();

// Resize / view-mode listeners (per-page)
window.fv3SetupResizeListeners = (folderMapGetter, cookieName) => {
    _fv3FolderMapGetter = folderMapGetter;
    let recalcTimer;
    const recalc = () => fv3SyncPreviewHeights(cookieName);

    window.addEventListener('resize', () => {
        clearTimeout(recalcTimer);
        recalcTimer = setTimeout(recalc, 150);
    });

    const ro = new ResizeObserver(() => {
        clearTimeout(recalcTimer);
        recalcTimer = setTimeout(recalc, 50);
    });
    const firstPreview = document.querySelector('tr.folder .folder-preview');
    if (firstPreview) ro.observe(firstPreview);
    const firstCpuCell = document.querySelector('tr.folder td.folder-advanced');
    if (firstCpuCell) ro.observe(firstCpuCell);
    fv3Cleanups.push(() => ro.disconnect());

    let lastAdvanced = $.cookie(cookieName) == 'advanced';
    document.addEventListener('click', () => {
        setTimeout(() => {
            const nowAdvanced = $.cookie(cookieName) == 'advanced';
            if (nowAdvanced !== lastAdvanced) {
                lastAdvanced = nowAdvanced;
                clearTimeout(recalcTimer);
                recalcTimer = setTimeout(recalc, 300);
            }
        }, 100);
    }, true);
};
