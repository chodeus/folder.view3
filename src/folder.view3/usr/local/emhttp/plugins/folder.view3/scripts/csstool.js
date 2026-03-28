/* CSS Tool — FolderView3 settings page CSS customization */
(function() {
    const API = '/plugins/folder.view3/server';
    let cssConfig = {};
    let cssDefaults = {};
    let currentScope = 'global';
    let dirty = false;

    const varMeta = {
        'folder-view3-graph-cpu': { type: 'color', group: 'colors', label: 'Graph CPU color' },
        'folder-view3-graph-mem': { type: 'color', group: 'colors', label: 'Graph memory color' },
        'fv3-accent-color': { type: 'text', group: 'colors', label: 'Accent color' },
        'fv3-toggle-color': { type: 'color', group: 'colors', label: 'Toggle button color' },
        'fv3-toggle-hover-color': { type: 'color', group: 'colors', label: 'Toggle hover color' },
        'fv3-separator-bg': { type: 'text', group: 'colors', label: 'Row separator background' },
        'fv3-surface-tint': { type: 'text', group: 'colors', label: 'Surface tint' },
        'fv3-hover-bg': { type: 'text', group: 'colors', label: 'Hover background' },
        'fv3-border': { type: 'text', group: 'colors', label: 'Border' },
        'fv3-panel-border': { type: 'text', group: 'colors', label: 'Panel border' },
        'fv3-panel-bg': { type: 'text', group: 'colors', label: 'Panel background' },
        'fv3-tab-active-bg': { type: 'text', group: 'colors', label: 'Active tab background' },
        'fv3-tab-active-border': { type: 'text', group: 'colors', label: 'Active tab border' },
        'fv3-scrollbar-color': { type: 'text', group: 'colors', label: 'Scrollbar color' },
        'fv3-folder-preview-bg': { type: 'text', group: 'colors', label: 'Folder preview background' },
        'fv3-folder-name-bg': { type: 'text', group: 'colors', label: 'Folder name background' },
        'fv3-row-bg': { type: 'text', group: 'colors', label: 'Row background' },
        'fv3-inset-fill': { type: 'text', group: 'colors', label: 'Inset fill' },
        'fv3-inset-border-color': { type: 'text', group: 'colors', label: 'Inset border color' },
        'fv3-inset-showcase-fill': { type: 'text', group: 'colors', label: 'Inset showcase fill' },
        'fv3-inset-showcase-border': { type: 'text', group: 'colors', label: 'Inset showcase border' },
        'fv3-embossed-border': { type: 'text', group: 'colors', label: 'Embossed border' },
        'fv3-embossed-accent': { type: 'text', group: 'colors', label: 'Embossed accent' },
        'fv3-embossed-inner-border': { type: 'text', group: 'colors', label: 'Embossed inner border' },
        'fv3-preview-icon-size': { type: 'dimension', group: 'dimensions', label: 'Preview icon size', min: 16, max: 64, unit: 'px' },
        'fv3-folder-icon-size': { type: 'dimension', group: 'dimensions', label: 'Folder icon size', min: 24, max: 96, unit: 'px' },
        'fv3-appname-max-width': { type: 'dimension', group: 'dimensions', label: 'App name max width', min: 60, max: 300, unit: 'px' }
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
                const text = document.createElement('input');
                text.type = 'text';
                text.value = currentVal;
                text.placeholder = cssDefaults[varName] || '';
                text.style.width = '200px';
                text.addEventListener('input', () => setVal(varName, text.value));
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
                swal({ title: 'Imported', text: 'Config loaded. Click Save to persist.', type: 'info', timer: 2000 });
            } catch (err) {
                swal({ title: 'Error', text: 'Invalid config file', type: 'error' });
            }
        };
        reader.readAsText(file);
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
                card.innerHTML = `
                    <div class="fv3-theme-info">
                        <div class="fv3-theme-name">${escapeAttr(theme.name)}</div>
                        <div class="fv3-theme-status">${theme.enabled ? 'Active' : 'Disabled'}</div>
                    </div>
                    <div class="fv3-theme-actions">
                        ${theme.enabled
                            ? '<button class="fv3-theme-disable">Disable</button>'
                            : '<button class="fv3-theme-activate">Activate</button>'}
                        <button class="fv3-theme-update" title="Re-download from GitHub"><i class="fa fa-refresh"></i></button>
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
                    const repo = prompt('Confirm GitHub repo (owner/repo):', theme.name);
                    if (!repo) return;
                    const result = await postFormJson(API + '/import_theme.php', { repo });
                    if (result.error) { swal({ title: 'Error', text: result.error, type: 'error' }); }
                    else { swal({ title: 'Updated', text: `Downloaded ${result.files.length} file(s).`, type: 'success', timer: 2000 }); loadThemes(); }
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
        } catch (e) {
            container.innerHTML = '<p style="opacity:0.5">Failed to load themes.</p>';
        }
    }

    async function importTheme() {
        const input = document.getElementById('fv3-theme-repo');
        const repo = input?.value?.trim();
        if (!repo) { swal({ title: 'Error', text: 'Enter a GitHub repo (owner/repo)', type: 'error' }); return; }
        const btn = document.getElementById('fv3-theme-import-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }
        const result = await postFormJson(API + '/import_theme.php', { repo });
        if (btn) { btn.disabled = false; btn.textContent = 'Import from GitHub'; }
        if (result.error) {
            swal({ title: 'Error', text: result.error, type: 'error' });
        } else {
            if (input) input.value = '';
            swal({ title: 'Imported', text: `"${result.name}" — ${result.files.length} CSS file(s) downloaded.`, type: 'success', timer: 2500 });
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

        document.getElementById('fv3-css-save')?.addEventListener('click', saveConfig);
        document.getElementById('fv3-css-reset')?.addEventListener('click', resetConfig);
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
