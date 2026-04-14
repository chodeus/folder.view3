(function() {
    var isModern = !!document.querySelector('link[href*="default-base"]');
    document.body.dataset.fv3Unraid = isModern ? 'modern' : 'legacy';
    window.fv3UnraidLegacy = !isModern;
})();

window.folderEvents = window.folderEvents || new EventTarget();

window.escapeHtml = window.escapeHtml || ((str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
});

window.fv3ResolveRenamedContainers = window.fv3ResolveRenamedContainers || ((folders, containersInfo, type) => {
    // VMs: match by UUID (persists across renames)
    // Docker: match by image (Unraid recreates containers with new IDs on rename)
    const uuidIndex = {};
    const imageIndex = {};
    for (const [name, ct] of Object.entries(containersInfo)) {
        if (type === 'vm') {
            if (ct.uuid) uuidIndex[ct.uuid] = name;
        } else {
            const img = ct.info?.Config?.Image || '';
            if (img) {
                if (!imageIndex[img]) imageIndex[img] = [];
                imageIndex[img].push(name);
            }
        }
    }
    // Build set of all names currently claimed by any folder
    const claimedNames = new Set();
    for (const folder of Object.values(folders)) {
        if (!Array.isArray(folder.containers)) continue;
        for (const name of folder.containers) {
            if (containersInfo[name]) claimedNames.add(name);
        }
    }
    let dirty = false;
    for (const [folderId, folder] of Object.entries(folders)) {
        if (!Array.isArray(folder.containers)) continue;
        for (let i = 0; i < folder.containers.length; i++) {
            const oldName = folder.containers[i];
            if (containersInfo[oldName]) continue;
            let newName = null;
            if (type === 'vm') {
                // VM: match by stored UUID
                const storedId = folder.containerIds?.[oldName];
                if (storedId) newName = uuidIndex[storedId];
            } else {
                // Docker: match by stored image — find unclaimed container with same image
                const storedImage = folder.containerImages?.[oldName];
                if (storedImage) {
                    const candidates = (imageIndex[storedImage] || []).filter(n => !claimedNames.has(n));
                    if (candidates.length === 1) newName = candidates[0];
                }
            }
            if (!newName) continue;
            folder.containers[i] = newName;
            claimedNames.add(newName);
            if (type === 'vm' && folder.containerIds) {
                folder.containerIds[newName] = folder.containerIds[oldName];
                delete folder.containerIds[oldName];
            }
            if (type === 'docker' && folder.containerImages) {
                folder.containerImages[newName] = folder.containerImages[oldName];
                delete folder.containerImages[oldName];
            }
            if (folder.hidden_preview && Array.isArray(folder.hidden_preview)) {
                const hIdx = folder.hidden_preview.indexOf(oldName);
                if (hIdx !== -1) folder.hidden_preview[hIdx] = newName;
            }
            dirty = true;
        }
    }
    if (dirty && typeof $ !== 'undefined') {
        const saveData = {};
        for (const [folderId, folder] of Object.entries(folders)) {
            if (type === 'vm' && !folder.containerIds) continue;
            if (type === 'docker' && !folder.containerImages) continue;
            saveData[folderId] = { containers: folder.containers };
            if (folder.containerIds) saveData[folderId].containerIds = folder.containerIds;
            if (folder.containerImages) saveData[folderId].containerImages = folder.containerImages;
            if (folder.hidden_preview) saveData[folderId].hidden_preview = folder.hidden_preview;
        }
        $.post('/plugins/folder.view3/server/update_ids.php', { type: type, data: JSON.stringify(saveData) });
    }
});

window.fv3SafeParse = window.fv3SafeParse || ((raw, fallback) => {
    if (raw !== null && typeof raw === 'object') return raw;
    try { return JSON.parse(raw); }
    catch (e) { console.error('[FV3] JSON parse failed:', e); return fallback; }
});

window.fv3ApplyToggleStyle = window.fv3ApplyToggleStyle || ((style) => {
    if (!style || style === 'default') {
        document.body.removeAttribute('data-fv3-toggle');
        return;
    }
    document.body.setAttribute('data-fv3-toggle', style);
    document.querySelectorAll('.fv3-toggle').forEach(el => {
        el.classList.remove('fv3-toggle-rounded', 'fv3-toggle-material', 'fv3-toggle-pill');
        if (style !== 'flat') el.classList.add('fv3-toggle-' + style);
    });
    var stripSwitchInline = function(bg) {
        bg.style.width = '';
        bg.style.height = '';
        bg.style.borderRadius = '';
        bg.style.background = '';
        bg.style.border = '';
        var btn = bg.querySelector('.switch-button-button');
        if (btn) {
            btn.style.width = '';
            btn.style.height = '';
            btn.style.borderRadius = '';
            btn.style.top = '';
            btn.style.left = '';
            btn.style.background = '';
            btn.style.border = '';
            btn.style.boxShadow = '';
            btn.style.margin = '';
        }
    };
    var stripAll = function() {
        document.querySelectorAll('.switch-button-background').forEach(bg => {
            stripSwitchInline(bg);
            var btn = bg.querySelector('.switch-button-button');
            if (btn && !btn._fv3StyleObserver) {
                btn._fv3StyleObserver = new MutationObserver(function() {
                    if (btn.style.left) btn.style.left = '';
                    if (btn.style.top) btn.style.top = '';
                });
                btn._fv3StyleObserver.observe(btn, { attributes: true, attributeFilter: ['style'] });
            }
        });
    };
    stripAll();
    setTimeout(stripAll, 100);
    setTimeout(stripAll, 500);
    ['#apps', '#vms'].forEach(id => {
        const cb = document.querySelector('input' + id);
        if (cb) {
            const sw = cb.nextElementSibling;
            if (sw && sw.classList.contains('switch-button-background')) {
                sw.classList.add('fv3-styled-switch');
            }
        }
    });
});

window._fv3ToggleStyle = null;
window._fv3AppliedVars = [];
window.fv3LoadToggleStyle = window.fv3LoadToggleStyle || (() => {
    if (window._fv3ToggleStyle) { window.fv3ApplyToggleStyle(window._fv3ToggleStyle); return; }
    fetch('/plugins/folder.view3/server/read_css_config.php', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(config => {
            window._fv3ToggleStyle = config.toggle_style || 'default';
            window.fv3ApplyToggleStyle(window._fv3ToggleStyle);

            var path = location.pathname.toLowerCase();
            var currentPage = path.includes('/docker') ? 'docker' : path.includes('/vms') ? 'vm' : path.includes('/dashboard') ? 'dashboard' : path.includes('/folderview3') ? 'settings' : 'other';

            // Clear previously applied variables
            window._fv3AppliedVars.forEach(function(k) {
                document.documentElement.style.removeProperty('--' + k);
            });
            window._fv3AppliedVars = [];

            // Apply variables in priority order: global → page-scoped → preset (highest wins)
            var applyVars = function(vars) {
                if (vars && typeof vars === 'object' && !Array.isArray(vars)) {
                    Object.entries(vars).forEach(function(entry) {
                        document.documentElement.style.setProperty('--' + entry[0], entry[1]);
                        if (window._fv3AppliedVars.indexOf(entry[0]) === -1) window._fv3AppliedVars.push(entry[0]);
                    });
                }
            };

            // 1. Global scope variables
            applyVars(config.global);

            // 2. Page-scoped variables from variable editor (override globals)
            if (currentPage !== 'other') applyVars(config[currentPage]);

            // 3. Preset page values (highest priority override)
            var pagePresets = (!config.page_presets || Array.isArray(config.page_presets)) ? {} : config.page_presets;
            var presetName = pagePresets[currentPage];
            var pageValuesMap = (!config.page_values || Array.isArray(config.page_values)) ? {} : config.page_values;
            var pageValues = pageValuesMap[currentPage];
            if (presetName && presetName !== 'Default' && pageValues) {
                applyVars(pageValues);
                document.body.setAttribute('data-fv3-preset', presetName);
            } else {
                document.body.removeAttribute('data-fv3-preset');
            }
        })
        .catch(() => {});
});

if (window.folderEvents) {
    window.folderEvents.addEventListener('docker-post-folders-creation', () => window.fv3LoadToggleStyle());
    window.folderEvents.addEventListener('vm-post-folders-creation', () => window.fv3LoadToggleStyle());
}

if (typeof $ !== 'undefined' && typeof csrf_token !== 'undefined') {
    $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
        if (options.type?.toUpperCase() === 'POST' && options.url?.includes('/plugins/folder.view3/')) {
            if (typeof options.data === 'string') {
                options.data += (options.data ? '&' : '') + 'csrf_token=' + encodeURIComponent(csrf_token);
            } else if (options.data && typeof options.data === 'object') {
                options.data.csrf_token = csrf_token;
            }
        }
    });
}