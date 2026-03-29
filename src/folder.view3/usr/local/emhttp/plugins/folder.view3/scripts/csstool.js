/* CSS Tool — FolderView3 settings page CSS customization */
(function() {
    const API = '/plugins/folder.view3/server';
    let cssConfig = {};
    let cssDefaults = {};
    let currentScope = 'global';
    let dirty = false;

    const varMeta = {
        'folder-view3-graph-cpu': { type: 'color', group: 'colors', label: 'Graph CPU color', desc: 'CPU usage graph line color\nFormat: #hex', pages: ['docker'] },
        'folder-view3-graph-mem': { type: 'color', group: 'colors', label: 'Graph memory color', desc: 'Memory usage graph line color\nFormat: #hex', pages: ['docker'] },
        'fv3-accent-color': { type: 'text', group: 'colors', label: 'Accent color', desc: 'Active tabs, highlights, active toggle border\nFormat: #hex, rgba(), var(--name), color name' },
        'fv3-toggle-color': { type: 'color', group: 'colors', label: 'Toggle button color', desc: 'Folder chevron dropdown button color\nFormat: #hex' },
        'fv3-toggle-hover-color': { type: 'color', group: 'colors', label: 'Toggle hover color', desc: 'Chevron button color on hover\nFormat: #hex' },
        'fv3-separator-bg': { type: 'text', group: 'colors', label: 'Row separator', desc: 'Divider line between preview rows in expand mode\nFormat: rgba(r,g,b,a) or #hex', pages: ['docker', 'vm'] },
        'fv3-surface-tint': { type: 'text', group: 'colors', label: 'Surface tint', desc: 'Subtle background tint on section headers and panels\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-hover-bg': { type: 'text', group: 'colors', label: 'Hover background', desc: 'Background highlight when hovering rows and buttons\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-border': { type: 'text', group: 'colors', label: 'Border', desc: 'General border color used throughout the plugin\nFormat: 1px solid rgba(r,g,b,a) or 1px solid #hex' },
        'fv3-panel-border': { type: 'text', group: 'colors', label: 'Panel border', desc: 'Fullwidth/accordion expanded panel border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-panel-bg': { type: 'text', group: 'colors', label: 'Panel background', desc: 'Fullwidth/accordion expanded panel background\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-tab-active-bg': { type: 'text', group: 'colors', label: 'Active tab bg', desc: 'Dashboard expanded tab background\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-tab-active-border': { type: 'text', group: 'colors', label: 'Active tab border', desc: 'Dashboard expanded tab border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-scrollbar-color': { type: 'text', group: 'colors', label: 'Scrollbar color', desc: 'Scrollbar thumb in scroll-overflow folders\nFormat: rgba(r,g,b,a) or #hex', pages: ['docker', 'vm'] },
        'fv3-folder-preview-bg': { type: 'text', group: 'colors', label: 'Preview background', desc: 'Background of the folder preview area\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-folder-name-bg': { type: 'text', group: 'colors', label: 'Folder name bg', desc: 'Background behind the folder name text\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-row-bg': { type: 'text', group: 'colors', label: 'Row background', desc: 'Alternating folder row background color\nFormat: rgba(r,g,b,a), #hex, or transparent', pages: ['docker', 'vm'] },
        'fv3-inset-fill': { type: 'text', group: 'colors', label: 'Inset fill', desc: 'Inset layout panel fill color\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-border-color': { type: 'text', group: 'colors', label: 'Inset border', desc: 'Inset layout panel border color\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-showcase-fill': { type: 'text', group: 'colors', label: 'Inset showcase', desc: 'Inset showcase area fill\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-showcase-border': { type: 'text', group: 'colors', label: 'Inset showcase border', desc: 'Inset showcase area border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-border': { type: 'text', group: 'colors', label: 'Embossed border', desc: 'Embossed layout outer border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-accent': { type: 'text', group: 'colors', label: 'Embossed accent', desc: 'Embossed layout accent highlight\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-inner-border': { type: 'text', group: 'colors', label: 'Embossed inner', desc: 'Embossed layout inner panel border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-preview-icon-size': { type: 'dimension', group: 'dimensions', label: 'Preview icon size', desc: 'Size of container/VM icons in folder preview\nRange: 16px – 64px', min: 16, max: 64, unit: 'px' },
        'fv3-folder-icon-size': { type: 'dimension', group: 'dimensions', label: 'Folder icon size', desc: 'Size of the folder icon in the row\nRange: 24px – 96px', min: 24, max: 96, unit: 'px' },
        'fv3-appname-max-width': { type: 'dimension', group: 'dimensions', label: 'App name max width', desc: 'Maximum width before container names truncate\nRange: 60px – 300px', pages: ['docker', 'vm'], min: 60, max: 300, unit: 'px' }
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

    const toggleStyles = [
        { id: 'default', label: 'Unraid Default', desc: 'Standard Unraid toggle switch' },
        { id: 'flat', label: 'Flat', desc: 'Flat minimal with square knob' },
        { id: 'ios', label: 'iOS', desc: 'Rounded pill with circular knob' },
        { id: 'material', label: 'Material', desc: 'Thin track with floating circle' },
        { id: 'pill', label: 'Pill', desc: 'Wide rounded with sliding circle' }
    ];

    function renderTogglePicker() {
        var container = document.getElementById('fv3-toggle-picker');
        if (!container) return;
        container.innerHTML = '';
        var current = cssConfig.toggle_style || 'default';

        toggleStyles.forEach(function(style) {
            var card = document.createElement('div');
            card.className = 'fv3-toggle-option' + (style.id === current ? ' active' : '');
            card.title = style.desc;

            var preview = document.createElement('div');
            preview.className = 'fv3-toggle-option-preview';

            if (style.id === 'default') {
                preview.innerHTML =
                    '<div style="display:inline-flex;align-items:center;gap:4px;margin-right:8px">' +
                    '<div style="width:25px;height:11px;background:#555;border-radius:2px;position:relative"><div style="width:12px;height:11px;background:#999;border-radius:2px;position:absolute;left:-1px"></div></div>' +
                    '<span style="font-size:10px;opacity:0.5">Off</span></div>' +
                    '<div style="display:inline-flex;align-items:center;gap:4px">' +
                    '<div style="width:25px;height:11px;background:#486dba;border-radius:2px;position:relative"><div style="width:12px;height:11px;background:#e8e8e8;border-radius:2px;position:absolute;left:14px"></div></div>' +
                    '<span style="font-size:10px;opacity:0.5">On</span></div>';
            } else {
                var cls = 'fv3-toggle-preview fv3-toggle-preview-' + style.id;
                preview.innerHTML =
                    '<span class="' + cls + '"></span>' +
                    '<span class="' + cls + ' checked"></span>';
            }
            card.appendChild(preview);

            var label = document.createElement('div');
            label.className = 'fv3-toggle-option-label';
            label.textContent = style.label;
            card.appendChild(label);

            card.addEventListener('click', function() {
                cssConfig.toggle_style = style.id;
                dirty = true;
                applyToggleStyle(style.id);
                renderTogglePicker();
            });

            container.appendChild(card);
        });
    }

    function applyToggleStyle(style) {
        if (style === 'default') {
            document.querySelectorAll('.fv3-toggle').forEach(function(el) {
                el.classList.remove('fv3-toggle', 'fv3-toggle-ios', 'fv3-toggle-material', 'fv3-toggle-pill');
                el.classList.add('basic-switch');
                el.style.display = 'none';
            });
            if (typeof $ !== 'undefined' && $.fn.switchButton) {
                $('input.basic-switch').switchButton({ labels_placement: 'right', off_label: 'OFF', on_label: 'ON' });
            }
        } else {
            // Remove any switchButton wrappers first
            document.querySelectorAll('.switch-button-background').forEach(function(el) {
                var input = el.parentNode.querySelector('input[type="checkbox"]');
                if (input) {
                    input.style.display = '';
                    input.classList.remove('basic-switch');
                    input.classList.add('fv3-toggle');
                }
                el.remove();
            });
            document.querySelectorAll('.switch-button-label').forEach(function(el) { el.remove(); });
            document.querySelectorAll('div[style*="clear: left"]').forEach(function(el) {
                if (el.previousElementSibling && el.previousElementSibling.classList.contains('switch-button-label')) el.remove();
            });
            document.querySelectorAll('.fv3-toggle').forEach(function(el) {
                el.classList.remove('fv3-toggle-ios', 'fv3-toggle-material', 'fv3-toggle-pill');
                if (style && style !== 'flat') {
                    el.classList.add('fv3-toggle-' + style);
                }
            });
        }
    }

    function renderVariables() {
        const container = document.getElementById('fv3-var-list');
        if (!container) return;
        container.innerHTML = '';
        let lastGroup = '';

        Object.entries(varMeta).forEach(([varName, meta]) => {
            if (currentScope !== 'global' && meta.pages && !meta.pages.includes(currentScope)) return;
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

    function getAllPresets() {
        return presets.concat(cssConfig.custom_presets || []);
    }

    function renderPresetCard(grid, preset, isCustom) {
        var currentPreset = cssConfig.preset || 'Default';
        var card = document.createElement('div');
        card.className = 'fv3-preset-card' + (preset.name === currentPreset ? ' fv3-preset-active' : '');

        var header = document.createElement('div');
        header.className = 'fv3-preset-header';
        var name = document.createElement('div');
        name.className = 'fv3-preset-name';
        name.textContent = preset.name;
        header.appendChild(name);

        if (isCustom) {
            var del = document.createElement('button');
            del.className = 'fv3-preset-delete';
            del.innerHTML = '<i class="fa fa-trash"></i>';
            del.title = 'Delete preset';
            del.addEventListener('click', function(e) {
                e.stopPropagation();
                swal({ title: 'Delete "' + escapeAttr(preset.name) + '"?', type: 'warning', showCancelButton: true, confirmButtonText: 'Delete' }, function(ok) {
                    if (!ok) return;
                    cssConfig.custom_presets = (cssConfig.custom_presets || []).filter(function(p) { return p.name !== preset.name; });
                    if (cssConfig.preset === preset.name) cssConfig.preset = 'Default';
                    dirty = true;
                    renderPresets();
                });
            });
            header.appendChild(del);
        }
        card.appendChild(header);

        var swatches = document.createElement('div');
        swatches.className = 'fv3-preset-swatches';
        [
            preset.values['fv3-accent-color'] || cssDefaults['fv3-accent-color'] || '#f0a30a',
            preset.values['fv3-toggle-color'] || cssDefaults['fv3-toggle-color'] || '#ff8c2f',
            preset.values['folder-view3-graph-cpu'] || cssDefaults['folder-view3-graph-cpu'] || '#2b8da3',
            preset.values['folder-view3-graph-mem'] || cssDefaults['folder-view3-graph-mem'] || '#b56a28'
        ].forEach(function(c) {
            var swatch = document.createElement('div');
            swatch.className = 'fv3-preset-swatch';
            swatch.style.background = c;
            swatches.appendChild(swatch);
        });
        card.appendChild(swatches);

        card.addEventListener('click', function() {
            cssConfig.preset = preset.name;
            cssConfig.global = Object.assign({}, cssConfig.global || {}, preset.values);
            dirty = true;
            Object.entries(preset.values).forEach(function(entry) {
                document.documentElement.style.setProperty('--' + entry[0], entry[1]);
            });
            renderPresets();
            renderVariables();
        });

        grid.appendChild(card);
    }

    function renderPresets() {
        var grid = document.getElementById('fv3-preset-grid');
        if (!grid) return;
        grid.innerHTML = '';
        presets.forEach(function(p) { renderPresetCard(grid, p, false); });
        (cssConfig.custom_presets || []).forEach(function(p) { renderPresetCard(grid, p, true); });
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
        renderTogglePicker();
        applyToggleStyle(cssConfig.toggle_style || 'default');
        const customCss = document.getElementById('fv3-custom-css');
        if (customCss && cssConfig.custom_css) customCss.value = cssConfig.custom_css;
        const userNotes = document.getElementById('fv3-user-notes');
        if (userNotes && cssConfig.user_notes) userNotes.value = cssConfig.user_notes;
    }

    async function saveConfig() {
        const customCss = document.getElementById('fv3-custom-css');
        if (customCss) cssConfig.custom_css = customCss.value;
        const userNotes = document.getElementById('fv3-user-notes');
        if (userNotes) cssConfig.user_notes = userNotes.value;
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

    function savePreset() {
        var defaultName = (cssConfig.preset || 'Custom') + ' Copy';
        swal({
            title: 'Save Preset',
            text: 'Enter a name for your preset:',
            type: 'input',
            inputValue: defaultName,
            showCancelButton: true,
            confirmButtonText: 'Save'
        }, function(name) {
            if (!name) return;
            var values = {};
            Object.entries(cssConfig.global || {}).forEach(function(entry) {
                if (varMeta[entry[0]]) values[entry[0]] = entry[1];
            });
            if (!cssConfig.custom_presets) cssConfig.custom_presets = [];
            var existing = cssConfig.custom_presets.findIndex(function(p) { return p.name === name; });
            if (existing >= 0) {
                cssConfig.custom_presets[existing].values = values;
            } else {
                cssConfig.custom_presets.push({ name: name, values: values });
            }
            cssConfig.preset = name;
            dirty = true;
            renderPresets();
            swal({ title: 'Saved', text: 'Preset "' + escapeAttr(name) + '" saved. Click Save to persist.', type: 'success', timer: 2000 });
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
                    swal({ title: 'Delete theme?', text: 'Remove "' + escapeAttr(theme.name) + '" permanently?', type: 'warning', showCancelButton: true, confirmButtonText: 'Delete' }, async (ok) => {
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
        if (cssTextarea) {
            var liveTimer = null;
            cssTextarea.addEventListener('input', () => {
                dirty = true;
                if (urlWarning) urlWarning.style.display = /url\s*\(/i.test(cssTextarea.value) ? '' : 'none';
                clearTimeout(liveTimer);
                liveTimer = setTimeout(() => {
                    var matches = cssTextarea.value.match(/--([a-zA-Z0-9-]+)\s*:\s*([^;}\n]+)/g);
                    if (matches) {
                        matches.forEach(function(m) {
                            var parts = m.match(/--([a-zA-Z0-9-]+)\s*:\s*(.+)/);
                            if (parts && varMeta[parts[1]]) {
                                document.documentElement.style.setProperty('--' + parts[1], parts[2].trim());
                            }
                        });
                        renderVariables();
                    }
                }, 300);
            });
        }

        document.getElementById('fv3-css-save')?.addEventListener('click', saveConfig);
        document.getElementById('fv3-css-reset')?.addEventListener('click', resetConfig);
        document.getElementById('fv3-css-save-preset')?.addEventListener('click', savePreset);
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

        window.addEventListener('beforeunload', function(e) {
            if (!dirty) return;
            e.preventDefault();
            e.returnValue = '';
            dirty = false;
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
