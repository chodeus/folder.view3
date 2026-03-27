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

// Resource cleanup — prevents SSE/WebSocket leaks on page navigation
window.fv3Cleanups = [];
window.addEventListener('beforeunload', () => {
    fv3Cleanups.forEach(fn => { try { fn(); } catch(e) {} });
});

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

window.fv3SyncPreviewHeights = (cookieName) => {
    const isAdvanced = $.cookie(cookieName) == 'advanced';
    document.querySelectorAll('tr.folder div.folder-preview:not(.fv3-overflow-expand)').forEach(el => {
        el.style.height = '';
        el.querySelectorAll('.folder-preview-wrapper').forEach(w => { w.style.marginTop = ''; });
        if (!el.classList.contains('fv3-overflow-scroll')) {
            el.querySelectorAll('.folder-preview-divider').forEach(d => { d.style.marginTop = ''; });
        }
        const cpuCell = el.closest('tr').querySelector('td.folder-advanced');
        const isScroll = el.classList.contains('fv3-overflow-scroll');
        if (isAdvanced && cpuCell && cpuCell.offsetHeight > 0) {
            const targetHeight = cpuCell.offsetHeight - 10;
            const defaultHeight = el.offsetHeight;
            if (targetHeight > defaultHeight) {
                el.style.height = targetHeight + 'px';
                const extra = targetHeight - defaultHeight;
                const newMargin = 7 + extra / 2;
                el.querySelectorAll('.folder-preview-wrapper').forEach(w => {
                    w.style.marginTop = newMargin + 'px';
                });
                if (!isScroll) {
                    el.querySelectorAll('.folder-preview-divider').forEach(d => {
                        d.style.marginTop = -newMargin + 'px';
                    });
                }
            }
        }
    });
};

// --- Phase 6: Unraid 7.2+ API Integration ---

window.fv3ApiAvailable = null;

window.fv3DetectApi = async () => {
    if (fv3ApiAvailable !== null) return fv3ApiAvailable;
    try {
        const resp = await fetch('/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof csrf_token !== 'undefined' ? csrf_token : '' },
            credentials: 'same-origin',
            body: JSON.stringify({ query: '{ info { os { release } } }' })
        });
        if (resp.ok) {
            const json = await resp.json();
            if (json.errors && json.errors.length) { fv3ApiAvailable = false; fv3Debug('API', 'GraphQL returned error:', json.errors[0].message); return fv3ApiAvailable; }
            fv3ApiAvailable = !!(json && json.data && json.data.info && json.data.info.os && json.data.info.os.release);
            if (fv3ApiAvailable) fv3Debug('API', 'Unraid GraphQL API detected, release:', json.data.info.os.release);
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
    start: 'start', stop: 'stop', pause: 'pause', resume: 'unpause', restart: 'restart'
};
var fv3VmActionMap = {
    'domain-start': 'start', 'domain-stop': 'stop', 'domain-pause': 'pause',
    'domain-resume': 'resume', 'domain-restart': 'reboot', 'domain-destroy': 'forceStop'
};

window.fv3ContainerAction = async (type, id, action) => {
    if (await fv3DetectApi()) {
        var map = type === 'docker' ? fv3DockerActionMap : fv3VmActionMap;
        var gqlAction = map[action];
        if (gqlAction) {
            try {
                fv3Debug('API', type + ' action via GraphQL:', gqlAction, id);
                if (type === 'docker') {
                    await fv3GraphQL('mutation($id: String!) { docker { ' + gqlAction + '(id: $id) } }', { id: id });
                } else {
                    await fv3GraphQL('mutation($vmId: String!) { vms { ' + gqlAction + '(vmId: $vmId) } }', { vmId: id });
                }
                return { success: true };
            } catch (e) {
                fv3DebugWarn('API', type + ' action GraphQL failed, falling back:', e.message);
            }
        }
    }
    return null;
};

window.fv3DockerAction = (action, containerId) => {
    var gqlAction = fv3DockerActionMap[action];
    if (fv3ApiAvailable && gqlAction) {
        return fv3GraphQL('mutation($id: String!) { docker { ' + gqlAction + '(id: $id) } }', { id: containerId })
            .then(() => { fv3Debug('API', 'Docker', gqlAction, containerId, 'OK'); return { success: true }; })
            .catch((e) => {
                fv3DebugWarn('API', 'Docker GraphQL failed, falling back:', e.message);
                return $.post(eventURL, { action: action, container: containerId }, null, 'json').promise();
            });
    }
    return $.post(eventURL, { action: action, container: containerId }, null, 'json').promise();
};

window.fv3VmAction = (action, uuid) => {
    var gqlAction = fv3VmActionMap[action];
    if (fv3ApiAvailable && gqlAction) {
        return fv3GraphQL('mutation($vmId: String!) { vms { ' + gqlAction + '(vmId: $vmId) } }', { vmId: uuid })
            .then(() => { fv3Debug('API', 'VM', gqlAction, uuid, 'OK'); return { success: true }; })
            .catch((e) => {
                fv3DebugWarn('API', 'VM GraphQL failed, falling back:', e.message);
                return $.post('/plugins/dynamix.vm.manager/include/VMajax.php', { action: action, uuid: uuid }, null, 'json').promise();
            });
    }
    return $.post('/plugins/dynamix.vm.manager/include/VMajax.php', { action: action, uuid: uuid }, null, 'json').promise();
};

window.fv3CheckUpdates = async () => {
    if (!await fv3DetectApi()) return {};
    try {
        var data = await fv3GraphQL('{ docker { containerUpdateStatuses { id updateAvailable } } }');
        var statuses = data && data.docker && data.docker.containerUpdateStatuses;
        if (!statuses) return {};
        var result = {};
        for (var i = 0; i < statuses.length; i++) {
            result[statuses[i].id] = statuses[i].updateAvailable;
        }
        return result;
    } catch (e) {
        fv3Debug('API', 'Update check failed:', e.message);
        return {};
    }
};

// Stats connection management
window.fv3StatsConnection = null;

window.fv3ConnectStats = (onData) => {
    if (fv3ApiAvailable) {
        try { return fv3ConnectStatsWebSocket(onData); }
        catch (e) { fv3DebugWarn('API', 'WebSocket stats init failed, using SSE'); }
    }
    return null;
};

window.fv3ConnectStatsWebSocket = (onData) => {
    var wsUrl = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/graphql';
    var ws = new WebSocket(wsUrl, 'graphql-transport-ws');

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'connection_init' }));
        ws.send(JSON.stringify({
            id: 'fv3-stats',
            type: 'subscribe',
            payload: { query: 'subscription { dockerContainerStats { id cpu memory } }' }
        }));
        fv3Debug('API', 'WebSocket stats connected');
    };

    ws.onmessage = (event) => {
        var msg = fv3SafeParse(event.data, null);
        if (msg && msg.type === 'next' && msg.payload && msg.payload.data && msg.payload.data.dockerContainerStats) {
            onData(msg.payload.data.dockerContainerStats);
        }
    };

    ws.onerror = () => {
        fv3DebugWarn('API', 'WebSocket stats error, falling back to SSE');
        fv3StatsConnection = null;
    };

    ws.onclose = () => { fv3StatsConnection = null; };

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

window.fv3SetupResizeListeners = (folderMapGetter, cookieName) => {
    let resizeTimer;
    const recalc = () => {
        fv3SyncPreviewHeights(cookieName);
        fv3UpdateRowSeparators(folderMapGetter());
    };

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(recalc, 150);
    });

    let lastAdvanced = $.cookie(cookieName) == 'advanced';
    document.addEventListener('click', () => {
        setTimeout(() => {
            const nowAdvanced = $.cookie(cookieName) == 'advanced';
            if (nowAdvanced !== lastAdvanced) {
                lastAdvanced = nowAdvanced;
                setTimeout(recalc, 300);
            }
        }, 100);
    });
};
