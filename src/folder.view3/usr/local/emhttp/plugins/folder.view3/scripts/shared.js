// FolderView3 shared utilities for Docker, VM, and Dashboard pages

// Debug system — persisted in localStorage, zero overhead when off
window.FV3_DEBUG = localStorage.getItem('fv3-debug') === 'true';

window.fv3Debug = FV3_DEBUG ? function(context) {
    console.log.apply(console, ['[FV3] ' + context + ':'].concat(Array.prototype.slice.call(arguments, 1)));
} : function() {};

window.fv3DebugWarn = FV3_DEBUG ? function(context) {
    console.warn.apply(console, ['[FV3] ' + context + ':'].concat(Array.prototype.slice.call(arguments, 1)));
} : function() {};

window.fv3Error = function(context, error) {
    console.error('[FV3 ERROR] ' + context + ':', error);
};

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
            window.fv3Debug = newState
                ? function(ctx) { console.log.apply(console, ['[FV3] ' + ctx + ':'].concat(Array.prototype.slice.call(arguments, 1))); }
                : function() {};
            window.fv3DebugWarn = newState
                ? function(ctx) { console.warn.apply(console, ['[FV3] ' + ctx + ':'].concat(Array.prototype.slice.call(arguments, 1))); }
                : function() {};
            console.log('[FV3] Debug mode ' + (newState ? 'ON' : 'OFF') + '. Reload page for full effect.');
        }
    });
})();

window.fv3SafeParseWithRecovery = (raw, storageKey, fallback) => {
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

// Global folder defaults — loaded once, used as fallback for per-folder settings
window.fv3FolderDefaults = null;
window.fv3LoadFolderDefaults = async () => {
    if (fv3FolderDefaults !== null) return fv3FolderDefaults;
    try {
        const resp = await fetch('/plugins/folder.view3/server/read_settings.php', { credentials: 'same-origin' });
        const settings = await resp.json();
        fv3FolderDefaults = {
            preview: parseInt(settings.default_preview !== undefined ? settings.default_preview : '1', 10),
            preview_hover: settings.default_preview_hover === 'yes',
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
            update_column: settings.default_update_column === 'yes'
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

// Resource cleanup — prevents SSE/WebSocket leaks on page navigation
window.fv3Cleanups = [];
window.addEventListener('beforeunload', () => {
    fv3Cleanups.forEach(fn => { try { fn(); } catch(e) {} });
});

// Incognito mode — obfuscates container/VM/folder names and icons for screenshots
window.fv3Incognito = localStorage.getItem('fv3-incognito') === 'true';
(function() {
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

    function scrubText(text, knownNames) {
        var result = text;
        for (var i = 0; i < knownNames.length; i++) {
            if (knownNames[i] && result.indexOf(knownNames[i]) !== -1) {
                result = result.split(knownNames[i]).join(getAnon(knownNames[i], 'container'));
            }
        }
        return result;
    }

    window.fv3IncognitoApply = function() {
        if (!fv3Incognito) return;
        document.body.classList.add('fv3-incognito');
        var knownNames = [];

        document.querySelectorAll('.folder-name .folder-inner, .fv3-folder-appname, .folder-appname').forEach(function(el) {
            var name = el.textContent.trim();
            if (name) knownNames.push(name);
            el.setAttribute('data-fv3-real', name);
            el.textContent = getAnon(name, el.closest('.folder-name, [class*="folder-docker"], [class*="folder-vm"]') ? 'folder' : 'container');
        });

        document.querySelectorAll('.appname, .appname a, td.ct-name > span > a, td.vm-name span.inner a').forEach(function(el) {
            var name = el.textContent.trim();
            if (name) knownNames.push(name);
            el.setAttribute('data-fv3-real', name);
            el.textContent = getAnon(name, el.closest('.vm-name') ? 'vm' : 'container');
        });

        document.querySelectorAll('.folder-preview [data-name], .folder-preview .folder-element span').forEach(function(el) {
            var name = (el.getAttribute('data-name') || el.textContent || '').trim();
            if (name) {
                el.setAttribute('data-fv3-real', name);
                el.textContent = getAnon(name, 'container');
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

        document.querySelectorAll('a[href*="://"]').forEach(function(el) {
            var href = el.getAttribute('href') || '';
            if (el.closest('.fv3-incognito-skip')) return;
            for (var i = 0; i < knownNames.length; i++) {
                if (href.indexOf(knownNames[i].toLowerCase()) !== -1 || (el.textContent && el.textContent.indexOf(knownNames[i]) !== -1)) {
                    el.setAttribute('data-fv3-real', el.textContent);
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

        document.querySelectorAll('.info-section td, .tooltip-content, .preview-outbox .status-info').forEach(function(el) {
            var html = el.innerHTML;
            var changed = scrubText(html, knownNames);
            if (changed !== html) {
                el.setAttribute('data-fv3-real-html', html);
                el.innerHTML = changed;
            }
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
        nameMap = {};
        nameCounter = { container: 0, vm: 0, folder: 0 };
    };

    window.fv3IncognitoToggle = function() {
        fv3Incognito = !fv3Incognito;
        localStorage.setItem('fv3-incognito', fv3Incognito);
        if (fv3Incognito) fv3IncognitoApply();
        else fv3IncognitoRemove();
        var btn = document.getElementById('fv3-incognito-btn');
        if (btn) btn.classList.toggle('fv3-incognito-active', fv3Incognito);
    };

    function createBtn() {
        var btn = document.createElement('button');
        btn.id = 'fv3-incognito-btn';
        btn.className = 'fv3-incognito-btn' + (fv3Incognito ? ' fv3-incognito-active' : '');
        btn.title = 'Incognito Mode — hide container/VM names for screenshots';
        btn.innerHTML = '<i class="fa fa-eye-slash"></i>';
        btn.addEventListener('click', fv3IncognitoToggle);
        return btn;
    }

    function injectToggle() {
        if (document.getElementById('fv3-incognito-btn')) return;

        var appsToggle = document.querySelector('input#apps');
        if (appsToggle) {
            var label = appsToggle.closest('label') || appsToggle.parentNode;
            label.parentNode.insertBefore(createBtn(), label.nextSibling);
            if (fv3Incognito) setTimeout(fv3IncognitoApply, 500);
            return;
        }

        var table = document.querySelector('table#docker_containers, table#kvm_table');
        if (table) {
            table.parentNode.insertBefore(createBtn(), table);
            if (fv3Incognito) setTimeout(fv3IncognitoApply, 500);
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
            if (fv3Incognito) setTimeout(fv3IncognitoApply, 100);
        });
        folderEvents.addEventListener('vm-post-folders-creation', function() {
            if (fv3Incognito) setTimeout(fv3IncognitoApply, 100);
        });
    }
})();

// Runtime error banner — only fires on genuine failures, never on expected fallbacks
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
    }
    if(globalFolders[id]) {
        globalFolders[id].status.expanded = !state;
    }
    folderEvents.dispatchEvent(new CustomEvent(eventPrefix + '-post-folder-expansion', {detail: { id }}));
    if (postCallback) postCallback();
};

window.fv3DownloadDebugJSON = (filename, data) => {
    const blob = new Blob([data], { type: 'application/json' });
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
            if (w.offsetTop > lastTop) { rows.push([]); lastTop = w.offsetTop; }
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
                if (sepColor) sep.style.backgroundColor = sepColor;
                preview.appendChild(sep);
            }
        }
    });
};

window._fv3FolderMapGetter = null;
let _fv3SepTimer;

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
    });
    if (_fv3FolderMapGetter) {
        clearTimeout(_fv3SepTimer);
        _fv3SepTimer = setTimeout(() => fv3UpdateRowSeparators(_fv3FolderMapGetter()), 300);
    }
};

// --- Phase 6: Unraid 7.2+ API Integration ---

window.fv3ApiAvailable = null;
window.fv3CpuCores = null;

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
    var phpFallback = () => $.post(eventURL, { action: action, container: containerId }, null, 'json').promise()
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

// One-way sync: FV3 Docker folders → Unraid native organizer (7.2+)
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

// Stats connection management
window.fv3StatsConnection = null;
window.fv3StatsCallbacks = [];

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
        if (onFallback) onFallback();
    };

    ws.onclose = () => {
        if (fv3StatsConnection === ws) {
            fv3StatsConnection = null;
            fv3StatsCallbacks = [];
        }
    };

    fv3StatsConnection = ws;
    fv3Cleanups.push(() => { if (ws.readyState <= 1) ws.close(); });
    return ws;
};

window.fv3DisconnectStats = () => {
    if (fv3StatsConnection) {
        if (fv3StatsConnection.close) fv3StatsConnection.close();
        fv3StatsConnection = null;
    }
};

fv3Cleanups.push(fv3DisconnectStats);

// Fire API detection early so it's resolved before any action is triggered
fv3DetectApi();

// --- End Phase 6 ---

window.fv3SetupPreviewMode = (folder, id, globalFolders) => {
    const $preview = $(`tr.folder-id-${id} div.folder-preview`);
    const el = $preview[0];
    if (!el) return;

    if (folder.settings.preview_overflow === 1) {
        $preview.addClass('fv3-overflow-expand');
        if (folder.settings.preview_row_separator) {
            $preview.addClass('fv3-has-separators');
        }
        const checkExpand = () => {
            if (el.classList.contains('fv3-overflow-expand')) {
                const wrappers = el.querySelectorAll('.folder-preview-wrapper');
                if (wrappers.length < 2) return;
                if (wrappers[0].offsetTop === wrappers[wrappers.length - 1].offsetTop) {
                    el.classList.remove('fv3-overflow-expand');
                }
            } else if (el.scrollWidth > el.clientWidth) {
                el.classList.add('fv3-overflow-expand');
            }
        };
        el._fv3CheckExpand = checkExpand;
        requestAnimationFrame(checkExpand);
        el.querySelectorAll('img').forEach(img => {
            if (!img.complete) {
                img.addEventListener('load', () => requestAnimationFrame(checkExpand), { once: true });
                img.addEventListener('error', () => requestAnimationFrame(checkExpand), { once: true });
            }
        });
        const ro = new ResizeObserver(() => requestAnimationFrame(checkExpand));
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
    }
};

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
