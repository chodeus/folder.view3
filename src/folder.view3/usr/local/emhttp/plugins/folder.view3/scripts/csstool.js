/* CSS Tool — FolderView3 settings page CSS customization */
(function() {
    const API = '/plugins/folder.view3/server';
    let cssConfig = {};
    let cssDefaults = {};
    let currentScope = 'global';
    let dirty = false;

    const varMeta = {
        'folder-view3-graph-cpu': { type: 'color', group: 'colors', label: 'Graph CPU color', desc: 'CPU usage graph line color' },
        'folder-view3-graph-mem': { type: 'color', group: 'colors', label: 'Graph memory color', desc: 'Memory usage graph line color' },
        'fv3-accent-color': { type: 'text', group: 'colors', label: 'Accent color', desc: 'Active tabs, highlights, active toggle border' },
        'fv3-toggle-color': { type: 'color', group: 'colors', label: 'Toggle button color', desc: 'Folder chevron dropdown button color' },
        'fv3-toggle-hover-color': { type: 'color', group: 'colors', label: 'Toggle hover color', desc: 'Chevron button color on hover' },
        'fv3-separator-bg': { type: 'text', group: 'colors', label: 'Row separator', desc: 'Divider line between preview rows in expand mode' },
        'fv3-surface-tint': { type: 'text', group: 'colors', label: 'Surface tint', desc: 'Subtle background tint on section headers and panels' },
        'fv3-hover-bg': { type: 'text', group: 'colors', label: 'Hover background', desc: 'Background highlight when hovering rows and buttons' },
        'fv3-border': { type: 'text', group: 'colors', label: 'Border', desc: 'General border color used throughout the plugin' },
        'fv3-panel-border': { type: 'text', group: 'colors', label: 'Panel border', desc: 'Fullwidth/accordion expanded panel border' },
        'fv3-panel-bg': { type: 'text', group: 'colors', label: 'Panel background', desc: 'Fullwidth/accordion expanded panel background' },
        'fv3-tab-active-bg': { type: 'text', group: 'colors', label: 'Active tab bg', desc: 'Dashboard tab background when selected' },
        'fv3-tab-active-border': { type: 'text', group: 'colors', label: 'Active tab border', desc: 'Dashboard tab border when selected' },
        'fv3-scrollbar-color': { type: 'text', group: 'colors', label: 'Scrollbar color', desc: 'Scrollbar thumb in scroll-overflow folders' },
        'fv3-folder-preview-bg': { type: 'text', group: 'colors', label: 'Preview background', desc: 'Background of the folder preview area' },
        'fv3-folder-name-bg': { type: 'text', group: 'colors', label: 'Folder name bg', desc: 'Background behind the folder name text' },
        'fv3-row-bg': { type: 'text', group: 'colors', label: 'Row background', desc: 'Alternating folder row background color' },
        'fv3-inset-fill': { type: 'text', group: 'colors', label: 'Inset fill', desc: 'Inset layout panel fill color' },
        'fv3-inset-border-color': { type: 'text', group: 'colors', label: 'Inset border', desc: 'Inset layout panel border color' },
        'fv3-inset-showcase-fill': { type: 'text', group: 'colors', label: 'Inset showcase', desc: 'Inset showcase area fill' },
        'fv3-inset-showcase-border': { type: 'text', group: 'colors', label: 'Inset showcase border', desc: 'Inset showcase area border' },
        'fv3-embossed-border': { type: 'text', group: 'colors', label: 'Embossed border', desc: 'Embossed layout outer border' },
        'fv3-embossed-accent': { type: 'text', group: 'colors', label: 'Embossed accent', desc: 'Embossed layout accent highlight' },
        'fv3-embossed-inner-border': { type: 'text', group: 'colors', label: 'Embossed inner', desc: 'Embossed layout inner panel border' },
        'fv3-preview-icon-size': { type: 'dimension', group: 'dimensions', label: 'Preview icon size', desc: 'Size of container/VM icons in folder preview', min: 16, max: 64, unit: 'px' },
        'fv3-folder-icon-size': { type: 'dimension', group: 'dimensions', label: 'Folder icon size', desc: 'Size of the folder icon in the row', min: 24, max: 96, unit: 'px' },
        'fv3-appname-max-width': { type: 'dimension', group: 'dimensions', label: 'App name max width', desc: 'Maximum width before container names truncate', min: 60, max: 300, unit: 'px' }
    };

    const presets = [
        {
            name: 'Default',
            values: {}
        },
        {
            name: 'Compact',
            values: {
                'fv3-preview-icon-size': '24px',
                'fv3-folder-icon-size': '36px',
                'fv3-appname-max-width': '90px'
            }
        },
        {
            name: 'Blue Accent',
            values: {
                'fv3-accent-color': '#3b82f6',
                'fv3-toggle-color': '#3b82f6',
                'fv3-toggle-hover-color': '#60a5fa',
                'fv3-embossed-accent': '#3b82f6',
                'folder-view3-graph-cpu': '#3b82f6',
                'folder-view3-graph-mem': '#8b5cf6'
            }
        },
        {
            name: 'Muted',
            values: {
                'fv3-accent-color': '#9ca3af',
                'fv3-toggle-color': '#9ca3af',
                'fv3-toggle-hover-color': '#d1d5db',
                'fv3-embossed-accent': '#9ca3af',
                'folder-view3-graph-cpu': '#6b7280',
                'folder-view3-graph-mem': '#9ca3af',
                'fv3-separator-bg': 'rgba(128,128,128,0.1)',
                'fv3-panel-border': 'rgba(128,128,128,0.15)',
                'fv3-panel-bg': 'rgba(128,128,128,0.05)'
            }
        }
    ];

    function getVal(varName) {
        const scope = cssConfig[currentScope] || {};
        if (scope[varName] !== undefined) return scope[varName];
        const globalVars = cssConfig.global || {};
        if (globalVars[varName] !== undefined) return globalVars[varName];
        return cssDefaults[varName] || '';
    }

    function setVal(varName, value) {
        if (!cssConfig[currentScope]) cssConfig[currentScope] = {};
        cssConfig[currentScope][varName] = value;
        dirty = true;
        document.documentElement.style.setProperty('--' + varName, value);
    }

    function isColor(val) {
        return /^#[0-9a-fA-F]{3,8}$/.test(val);
    }

    function renderVariables() {
        const container = document.getElementById('fv3-var-list');
        if (!container) return;
        container.innerHTML = '';
        let lastGroup = '';

        Object.entries(varMeta).forEach(([varName, meta]) => {
            if (meta.group !== lastGroup) {
                lastGroup = meta.group;
                const heading = document.createElement('div');
                heading.className = 'fv3-var-group-heading';
                heading.textContent = meta.group.charAt(0).toUpperCase() + meta.group.slice(1);
                container.appendChild(heading);
            }

            const row = document.createElement('div');
            row.className = 'fv3-var-row';

            const label = document.createElement('div');
            label.className = 'fv3-var-label';
            label.innerHTML = meta.label + ' <code>--' + varName + '</code>';
            if (meta.desc) label.title = meta.desc;
            row.appendChild(label);

            const inputs = document.createElement('div');
            inputs.className = 'fv3-var-inputs';
            const currentVal = getVal(varName);

            if (meta.type === 'color') {
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.value = currentVal;
                const text = document.createElement('input');
                text.type = 'text';
                text.value = currentVal;
                text.placeholder = cssDefaults[varName] || '';
                picker.addEventListener('input', () => {
                    text.value = picker.value;
                    setVal(varName, picker.value);
                });
                text.addEventListener('input', () => {
                    if (isColor(text.value)) picker.value = text.value;
                    setVal(varName, text.value);
                });
                inputs.appendChild(picker);
                inputs.appendChild(text);
            } else if (meta.type === 'dimension') {
                const numVal = parseInt(currentVal) || meta.min;
                const range = document.createElement('input');
                range.type = 'range';
                range.min = meta.min;
                range.max = meta.max;
                range.value = numVal;
                const num = document.createElement('input');
                num.type = 'number';
                num.min = meta.min;
                num.max = meta.max;
                num.value = numVal;
                range.addEventListener('input', () => {
                    num.value = range.value;
                    setVal(varName, range.value + meta.unit);
                });
                num.addEventListener('input', () => {
                    range.value = num.value;
                    setVal(varName, num.value + meta.unit);
                });
                inputs.appendChild(range);
                inputs.appendChild(num);
            } else {
                if (meta.group === 'colors') {
                    const swatch = document.createElement('span');
                    swatch.className = 'fv3-var-swatch';
                    swatch.style.background = currentVal || cssDefaults[varName] || 'transparent';
                    inputs.appendChild(swatch);
                }
                const text = document.createElement('input');
                text.type = 'text';
                text.value = currentVal;
                text.placeholder = cssDefaults[varName] || '';
                text.style.width = '200px';
                text.addEventListener('input', () => {
                    setVal(varName, text.value);
                    var sw = inputs.querySelector('.fv3-var-swatch');
                    if (sw) sw.style.background = text.value || 'transparent';
                });
                inputs.appendChild(text);
            }

            row.appendChild(inputs);

            const resetBtn = document.createElement('button');
            resetBtn.className = 'fv3-var-reset';
            resetBtn.textContent = 'Reset';
            resetBtn.addEventListener('click', () => {
                if (cssConfig[currentScope]) delete cssConfig[currentScope][varName];
                document.documentElement.style.removeProperty('--' + varName);
                dirty = true;
                renderVariables();
            });
            row.appendChild(resetBtn);

            container.appendChild(row);
        });
    }

    function renderPresets() {
        const grid = document.getElementById('fv3-preset-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const currentPreset = cssConfig.preset || 'Default';

        presets.forEach(preset => {
            const card = document.createElement('div');
            card.className = 'fv3-preset-card' + (preset.name === currentPreset ? ' fv3-preset-active' : '');

            const name = document.createElement('div');
            name.className = 'fv3-preset-name';
            name.textContent = preset.name;
            card.appendChild(name);

            const swatches = document.createElement('div');
            swatches.className = 'fv3-preset-swatches';
            const colors = [
                preset.values['fv3-accent-color'] || cssDefaults['fv3-accent-color'] || '#f0a30a',
                preset.values['fv3-toggle-color'] || cssDefaults['fv3-toggle-color'] || '#ff8c2f',
                preset.values['folder-view3-graph-cpu'] || cssDefaults['folder-view3-graph-cpu'] || '#2b8da3',
                preset.values['folder-view3-graph-mem'] || cssDefaults['folder-view3-graph-mem'] || '#b56a28'
            ];
            colors.forEach(c => {
                const swatch = document.createElement('div');
                swatch.className = 'fv3-preset-swatch';
                swatch.style.background = c;
                swatches.appendChild(swatch);
            });
            card.appendChild(swatches);

            card.addEventListener('click', () => {
                cssConfig.preset = preset.name;
                cssConfig.global = { ...(cssConfig.global || {}), ...preset.values };
                dirty = true;
                Object.entries(preset.values).forEach(([k, v]) => {
                    document.documentElement.style.setProperty('--' + k, v);
                });
                renderPresets();
                renderVariables();
            });

            grid.appendChild(card);
        });
    }

    async function loadConfig() {
        try {
            const [configResp, defaultsResp] = await Promise.all([
                fetch(API + '/read_css_config.php'),
                fetch(API + '/read_css_defaults.php')
            ]);
            cssConfig = await configResp.json();
            cssDefaults = await defaultsResp.json();
        } catch (e) {
            console.error('[FV3] CSS Tool: failed to load config', e);
            cssConfig = {};
            cssDefaults = {};
        }
        renderVariables();
        renderPresets();
        const customCss = document.getElementById('fv3-custom-css');
        if (customCss && cssConfig.custom_css) customCss.value = cssConfig.custom_css;
    }

    async function saveConfig() {
        const customCss = document.getElementById('fv3-custom-css');
        if (customCss) cssConfig.custom_css = customCss.value;
        try {
            const resp = await fetch(API + '/update_css_config.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'config=' + encodeURIComponent(JSON.stringify(cssConfig)) +
                      '&csrf_token=' + encodeURIComponent(document.querySelector('input[name="csrf_token"]')?.value ||
                      (typeof csrf_token !== 'undefined' ? csrf_token : ''))
            });
            if (resp.ok) {
                dirty = false;
                swal({ title: 'Saved', text: 'CSS configuration saved.', type: 'success', timer: 1500 });
            } else {
                const text = await resp.text();
                swal({ title: 'Error', text: text || 'Save failed', type: 'error' });
            }
        } catch (e) {
            swal({ title: 'Error', text: 'Network error', type: 'error' });
        }
    }

    function resetConfig() {
        swal({
            title: 'Reset to Defaults?',
            text: 'This will clear all CSS customizations.',
            type: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Reset'
        }, (confirmed) => {
            if (!confirmed) return;
            cssConfig = {};
            Object.keys(cssDefaults).forEach(k => document.documentElement.style.removeProperty('--' + k));
            const customCss = document.getElementById('fv3-custom-css');
            if (customCss) customCss.value = '';
            dirty = true;
            renderVariables();
            renderPresets();
            saveConfig();
        });
    }

    function exportConfig() {
        const blob = new Blob([JSON.stringify(cssConfig, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fv3-css-config.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function exportPreset() {
        var defaultName = (cssConfig.preset || 'Custom') + ' Export';
        swal({
            title: 'Export Preset',
            text: 'Enter a name for your preset:',
            type: 'input',
            inputValue: defaultName,
            showCancelButton: true,
            confirmButtonText: 'Export'
        }, function(name) {
            if (!name) return;
            var presetData = { name: name, values: {} };
            Object.entries(cssConfig.global || {}).forEach(function(entry) {
                if (varMeta[entry[0]]) presetData.values[entry[0]] = entry[1];
            });
            var blob = new Blob([JSON.stringify(presetData, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'fv3-preset-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }

    function importConfig(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (typeof imported !== 'object' || imported === null) throw new Error('Invalid');
                cssConfig = imported;
                dirty = true;
                renderVariables();
                renderPresets();
                const customCss = document.getElementById('fv3-custom-css');
                if (customCss && cssConfig.custom_css) customCss.value = cssConfig.custom_css;
                Object.entries(cssConfig.global || {}).forEach(([k, v]) => {
                    document.documentElement.style.setProperty('--' + k, v);
                });
                const hasUrl = imported.custom_css && /url\s*\(/i.test(imported.custom_css);
                swal({ title: 'Imported', text: 'Config loaded. Click Save to persist.' + (hasUrl ? '\n\nNote: url() references will be stripped on save for security.' : ''), type: hasUrl ? 'warning' : 'info', timer: hasUrl ? 0 : 2000 });
            } catch (err) {
                swal({ title: 'Error', text: 'Invalid config file', type: 'error' });
            }
        };
        reader.readAsText(file);
    }

    async function checkThemeUpdates(themes, container) {
        for (const theme of themes.filter(t => t.isDir && t.source?.repo && t.source?.files)) {
            const checkEl = container.querySelector('.fv3-theme-card .fv3-update-check[data-theme="' + theme.name + '"]');
            if (!checkEl) continue;
            try {
                const apiBase = 'https://api.github.com/repos/' + theme.source.repo + '/contents/';
                const subPath = theme.source.path || '';
                const fetchUrl = subPath ? apiBase + encodeURIComponent(subPath) : apiBase;
                const resp = await fetch(fetchUrl, { headers: { 'User-Agent': 'FolderView3' } });
                if (!resp.ok) { checkEl.innerHTML = '<span style="opacity:0.4">check failed</span>'; continue; }
                const files = await resp.json();
                const remoteShas = {};
                files.filter(f => f.type === 'file' && /\.css$/i.test(f.name)).forEach(f => {
                    remoteShas[f.name] = f.sha;
                });
                if (!subPath) {
                    const dirs = files.filter(f => f.type === 'dir');
                    for (const dir of dirs) {
                        try {
                            const subResp = await fetch(apiBase + encodeURIComponent(dir.name), { headers: { 'User-Agent': 'FolderView3' } });
                            if (!subResp.ok) continue;
                            const subFiles = await subResp.json();
                            subFiles.filter(f => f.type === 'file' && /\.css$/i.test(f.name)).forEach(f => { remoteShas[dir.name + '/' + f.name] = f.sha; });
                        } catch (e) {}
                    }
                }
                const localShas = theme.source.files || {};
                let hasUpdate = false;
                for (const [name, sha] of Object.entries(remoteShas)) {
                    if (!localShas[name] || localShas[name] !== sha) { hasUpdate = true; break; }
                }
                if (hasUpdate) {
                    checkEl.innerHTML = '<span class="fv3-update-available"><i class="fa fa-cloud-download" style="color:#3b82f6"></i> <span data-i18n="apply-update" style="color:#3b82f6">update ready</span></span>';
                    const card = checkEl.closest('.fv3-theme-card');
                    const updateBtn = card?.querySelector('.fv3-theme-update');
                    if (updateBtn) updateBtn.style.display = '';
                } else {
                    checkEl.innerHTML = '<span class="fv3-update-current"><i class="fa fa-check" style="color:#4ecca3"></i> <span data-i18n="up-to-date" style="color:#4ecca3">up-to-date</span></span>';
                }
            } catch (e) {
                checkEl.innerHTML = '<span style="opacity:0.4">offline</span>';
            }
        }
    }

    async function loadThemes() {
        const container = document.getElementById('fv3-theme-list');
        if (!container) return;
        container.innerHTML = '';
        try {
            const resp = await fetch(API + '/list_themes.php');
            const themes = await resp.json();
            const hasActive = themes.some(t => t.enabled && t.isDir);

            const defaultCard = document.createElement('div');
            defaultCard.className = 'fv3-theme-card' + (!hasActive ? '' : ' fv3-theme-disabled');
            defaultCard.innerHTML = `
                <div class="fv3-theme-info">
                    <div class="fv3-theme-name">Default (Plugin CSS only)</div>
                    <div class="fv3-theme-status">${!hasActive ? 'Active' : 'Click to disable all themes'}</div>
                </div>
                <div class="fv3-theme-actions">
                    ${hasActive ? '<button class="fv3-theme-activate">Activate</button>' : ''}
                </div>`;
            defaultCard.querySelector('.fv3-theme-activate')?.addEventListener('click', async () => {
                for (const t of themes.filter(t => t.enabled && t.isDir)) {
                    await postForm(API + '/toggle_theme.php', { entry: t.entry, enable: 'false' });
                }
                loadThemes();
            });
            container.appendChild(defaultCard);

            themes.filter(t => t.isDir).forEach(theme => {
                const card = document.createElement('div');
                card.className = 'fv3-theme-card' + (theme.enabled ? '' : ' fv3-theme-disabled');
                const repo = theme.source?.repo || '';
                card.innerHTML = `
                    <div class="fv3-theme-info">
                        <div class="fv3-theme-name">${escapeAttr(theme.name)}</div>
                        <div class="fv3-theme-status">
                            ${theme.enabled ? 'Active' : 'Disabled'}${repo ? ' — ' + escapeAttr(repo) : ''}
                        </div>
                        <div class="fv3-theme-update-status">
                            ${repo ? '<span class="fv3-update-check" data-theme="' + escapeAttr(theme.name) + '"><i class="fa fa-circle-o-notch fa-spin" style="opacity:0.4"></i></span>' : ''}
                        </div>
                    </div>
                    <div class="fv3-theme-actions">
                        ${theme.enabled
                            ? '<button class="fv3-theme-disable">Disable</button>'
                            : '<button class="fv3-theme-activate">Activate</button>'}
                        <button class="fv3-theme-update" title="Update from GitHub" style="display:none"><i class="fa fa-cloud-download"></i> <span data-i18n="apply-update">apply update</span></button>
                        <button class="fv3-theme-delete" title="Delete"><i class="fa fa-trash"></i></button>
                    </div>`;
                card.querySelector('.fv3-theme-activate')?.addEventListener('click', async () => {
                    await postForm(API + '/toggle_theme.php', { entry: theme.entry, enable: 'true' });
                    loadThemes();
                });
                card.querySelector('.fv3-theme-disable')?.addEventListener('click', async () => {
                    await postForm(API + '/toggle_theme.php', { entry: theme.entry, enable: 'false' });
                    loadThemes();
                });
                card.querySelector('.fv3-theme-update')?.addEventListener('click', async () => {
                    const repo = theme.source?.repo || '';
                    const path = theme.source?.path || '';
                    if (!repo) { swal({ title: 'Error', text: 'No source repo recorded. Re-import manually.', type: 'error' }); return; }
                    const updateBtn = card.querySelector('.fv3-theme-update');
                    if (updateBtn) updateBtn.disabled = true;
                    const result = await postFormJson(API + '/import_theme.php', { repo, path });
                    if (updateBtn) updateBtn.disabled = false;
                    if (result.error) { swal({ title: 'Error', text: result.error, type: 'error' }); }
                    else { swal({ title: 'Updated', text: 'Downloaded ' + result.files.length + ' file(s).', type: 'success', timer: 2000 }); loadThemes(); }
                });
                card.querySelector('.fv3-theme-delete')?.addEventListener('click', () => {
                    swal({ title: 'Delete theme?', text: `Remove "${theme.name}" permanently?`, type: 'warning', showCancelButton: true, confirmButtonText: 'Delete' }, async (ok) => {
                        if (!ok) return;
                        await postForm(API + '/delete_theme.php', { entry: theme.entry });
                        loadThemes();
                    });
                });
                container.appendChild(card);
            });
            checkThemeUpdates(themes, container);
        } catch (e) {
            container.innerHTML = '<p style="opacity:0.5">Failed to load themes.</p>';
        }
    }

    async function importTheme() {
        const input = document.getElementById('fv3-theme-repo');
        const repo = input?.value?.trim();
        if (!repo) { swal({ title: 'Error', text: 'Enter a GitHub repo (owner/repo)', type: 'error' }); return; }
        const btn = document.getElementById('fv3-theme-import-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Checking repo...'; }
        try {
            const resp = await fetch('https://api.github.com/repos/' + repo + '/contents/', { headers: { 'User-Agent': 'FolderView3' } });
            if (!resp.ok) { swal({ title: 'Error', text: 'Could not reach repo. Check the URL.', type: 'error' }); return; }
            const contents = await resp.json();
            const dirs = contents.filter(f => f.type === 'dir');
            const rootCss = contents.filter(f => f.type === 'file' && /\.css$/i.test(f.name));
            if (dirs.length > 0 && rootCss.length === 0) {
                if (btn) { btn.disabled = false; btn.textContent = 'Import from GitHub'; }
                const dirNames = dirs.map(d => d.name);
                showDirPicker(repo, dirNames);
                return;
            }
            await doImport(repo, '');
        } catch (e) {
            swal({ title: 'Error', text: 'Failed to fetch repo: ' + e.message, type: 'error' });
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Import from GitHub'; }
        }
    }

    function showDirPicker(repo, dirNames) {
        const existing = document.getElementById('fv3-dir-picker');
        if (existing) existing.remove();
        const picker = document.createElement('div');
        picker.id = 'fv3-dir-picker';
        picker.className = 'fv3-dir-picker';
        picker.innerHTML = '<div class="fv3-dir-picker-title">This repo has multiple directories. Select which to import:</div>';
        dirNames.forEach(name => {
            const label = document.createElement('label');
            label.className = 'fv3-dir-picker-option';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = name;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + name));
            picker.appendChild(label);
        });
        const actions = document.createElement('div');
        actions.className = 'fv3-dir-picker-actions';
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import Selected';
        importBtn.addEventListener('click', async () => {
            const selected = Array.from(picker.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
            if (selected.length === 0) { swal({ title: 'Error', text: 'Select at least one directory.', type: 'error' }); return; }
            picker.remove();
            for (const path of selected) {
                await doImport(repo, path);
            }
        });
        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.style.opacity = '0.6';
        cancel.addEventListener('click', () => picker.remove());
        actions.appendChild(importBtn);
        actions.appendChild(cancel);
        picker.appendChild(actions);
        document.getElementById('fv3-tier-themes')?.appendChild(picker);
    }

    async function doImport(repo, path) {
        const input = document.getElementById('fv3-theme-repo');
        const btn = document.getElementById('fv3-theme-import-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }
        const result = await postFormJson(API + '/import_theme.php', { repo, path });
        if (btn) { btn.disabled = false; btn.textContent = 'Import from GitHub'; }
        if (result.error) {
            swal({ title: 'Error', text: result.error, type: 'error' });
        } else {
            if (input) input.value = '';
            let msg = '"' + result.name + '" \u2014 ' + result.files.length + ' CSS file(s) downloaded.';
            let type = 'success';
            let timer = 2500;
            if (result.warnings && result.warnings.length) {
                msg += '\n\nSecurity notice \u2014 the following were found in the imported CSS:\n\n';
                result.warnings.forEach(function(w) {
                    msg += w.file + ':' + w.line + ' [' + w.type + ']\n  ' + w.code + '\n\n';
                });
                msg += 'These are allowed but please verify they are expected. If unsure, delete the theme.';
                type = 'warning';
                timer = 0;
            }
            swal({ title: type === 'warning' ? 'Imported with Warnings' : 'Imported', text: msg, type: type, timer: timer });
            loadThemes();
        }
    }

    function escapeAttr(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

    async function postForm(url, data) {
        const csrfToken = document.querySelector('input[name="csrf_token"]')?.value || (typeof csrf_token !== 'undefined' ? csrf_token : '');
        const body = Object.entries({ ...data, csrf_token: csrfToken }).map(([k,v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
        return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    }

    async function postFormJson(url, data) {
        try {
            const resp = await postForm(url, data);
            return await resp.json();
        } catch (e) { return { error: 'Network error' }; }
    }

    function init() {
        document.querySelectorAll('.fv3-tier-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.fv3-tier-btn').forEach(b => b.classList.remove('fv3-tier-active'));
                btn.classList.add('fv3-tier-active');
                document.querySelectorAll('.fv3-tier-panel').forEach(p => p.style.display = 'none');
                const panel = document.getElementById('fv3-tier-' + btn.dataset.tier);
                if (panel) panel.style.display = '';
            });
        });

        document.querySelectorAll('.fv3-subtab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.fv3-subtab').forEach(t => t.classList.remove('fv3-subtab-active'));
                tab.classList.add('fv3-subtab-active');
                currentScope = tab.dataset.scope;
                renderVariables();
            });
        });

        const cssTextarea = document.getElementById('fv3-custom-css');
        const urlWarning = document.getElementById('fv3-css-url-warning');
        if (cssTextarea && urlWarning) {
            cssTextarea.addEventListener('input', () => {
                urlWarning.style.display = /url\s*\(/i.test(cssTextarea.value) ? '' : 'none';
            });
        }

        document.getElementById('fv3-css-save')?.addEventListener('click', saveConfig);
        document.getElementById('fv3-css-reset')?.addEventListener('click', resetConfig);
        document.getElementById('fv3-css-export-preset')?.addEventListener('click', exportPreset);
        document.getElementById('fv3-css-export')?.addEventListener('click', exportConfig);
        document.getElementById('fv3-css-import-btn')?.addEventListener('click', () => {
            document.getElementById('fv3-css-import')?.click();
        });
        document.getElementById('fv3-css-import')?.addEventListener('change', (e) => {
            if (e.target.files[0]) importConfig(e.target.files[0]);
            e.target.value = '';
        });

        document.getElementById('fv3-theme-import-btn')?.addEventListener('click', importTheme);
        document.getElementById('fv3-theme-repo')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); importTheme(); } });

        window.addEventListener('beforeunload', (e) => {
            if (dirty) { e.preventDefault(); e.returnValue = ''; }
        });

        loadConfig();
        loadThemes();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
