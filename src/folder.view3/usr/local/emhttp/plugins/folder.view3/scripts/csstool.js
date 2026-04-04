/* CSS Tool — FolderView3 settings page CSS customization */
(function() {
    const API = '/plugins/folder.view3/server';
    let cssConfig = {};
    let cssDefaults = {};
    let currentScope = 'global';
    let dirty = false;
    let fv3ThemeName = null; // 'azure' | 'black' | 'gray' | 'white' | 'dark' | 'light'
    window.fv3IsCssDirty = () => dirty;
    window.fv3ResetCssDirty = () => { dirty = false; loadConfig(); };

    const varMeta = {
        /* ===== Global — shared across all pages ===== */
        'fv3-accent-color': { type: 'text', group: 'colors', label: 'Accent color', desc: 'Active tabs, highlights, active toggle border\nFormat: #hex, rgba(), var(--name), color name' },
        'fv3-surface-tint': { type: 'text', group: 'colors', label: 'Surface tint', desc: 'Subtle background tint on section headers and panels\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-hover-bg': { type: 'text', group: 'colors', label: 'Hover background', desc: 'Background highlight when hovering rows and buttons\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-border': { type: 'text', group: 'colors', label: 'Border', desc: 'General border color used throughout the plugin\nFormat: 1px solid rgba(r,g,b,a) or 1px solid #hex' },
        'fv3-folder-name-bg': { type: 'text', group: 'colors', label: 'Folder name bg', desc: 'Background behind the folder name text\nFormat: rgba(r,g,b,a) or #hex' },
        'fv3-folder-name-color': { type: 'text', group: 'colors', label: 'Folder name color', desc: 'Folder name text color in table rows and dashboard\nFormat: #hex, rgba(), inherit' },
        'fv3-appname-color': { type: 'text', group: 'colors', label: 'App name color', desc: 'Container/VM name text color in folder previews\nFormat: #hex, rgba(), inherit' },
        'fv3-folder-icon-size': { type: 'dimension', group: 'dimensions', label: 'Folder icon size', desc: 'Size of the folder icon in the row\nRange: 24px – 96px', min: 24, max: 96, unit: 'px' },
        'fv3-folder-name-size': { type: 'text', group: 'dimensions', label: 'Folder name size', desc: 'Folder name font size\nFormat: 1.4rem, 14px, inherit' },
        'fv3-folder-name-weight': { type: 'text', group: 'dimensions', label: 'Folder name weight', desc: 'Folder name font weight\nFormat: bold, 600, normal, inherit' },

        /* ===== Docker & VM — table row styling ===== */
        'fv3-toggle-color': { type: 'color', group: 'controls', label: 'Toggle button color', desc: 'Folder chevron dropdown button color\nFormat: #hex', pages: ['docker', 'vm'] },
        'fv3-toggle-hover-color': { type: 'color', group: 'controls', label: 'Toggle hover color', desc: 'Chevron button color on hover\nFormat: #hex', pages: ['docker', 'vm'] },
        'fv3-chevron-color': { type: 'text', group: 'controls', label: 'Chevron color', desc: 'Folder expand/collapse chevron color\nFormat: #hex, rgba(), inherit', pages: ['docker', 'vm'] },
        'fv3-chevron-size': { type: 'dimension', group: 'controls', label: 'Chevron button size', desc: 'Font size of the folder expand/collapse chevron\nRange: 8px – 24px', pages: ['docker', 'vm'], min: 8, max: 24, unit: 'px' },
        'fv3-folder-row-border-width': { type: 'text', group: 'rows', label: 'Folder row border width', desc: 'Border widths on folder name cell (top right bottom left)\nFormat: 1px 4px 1px 4px or 0', pages: ['docker', 'vm'] },
        'fv3-folder-row-border-color': { type: 'text', group: 'rows', label: 'Folder row border color', desc: 'Border color on folder name cell\nFormat: #hex, rgba()', pages: ['docker', 'vm'] },
        'fv3-folder-row-radius': { type: 'text', group: 'rows', label: 'Folder row radius', desc: 'Border-radius on folder name and preview cells\nFormat: 4px, 0', pages: ['docker', 'vm'] },
        'fv3-folder-row-padding': { type: 'text', group: 'rows', label: 'Folder row padding', desc: 'Padding inside folder name cell\nFormat: 8px 6px', pages: ['docker', 'vm'] },
        'fv3-preview-row-border-width': { type: 'text', group: 'rows', label: 'Preview row border width', desc: 'Border widths on preview strip (top right bottom left)\nFormat: 1px 1px 1px 4px or 0', pages: ['docker', 'vm'] },
        'fv3-preview-row-border-color': { type: 'text', group: 'rows', label: 'Preview row border color', desc: 'Border color on preview strip\nFormat: #hex, rgba()', pages: ['docker', 'vm'] },
        'fv3-row-bg': { type: 'text', group: 'rows', label: 'Row background', desc: 'Alternating folder row background color\nFormat: rgba(r,g,b,a), #hex, or transparent', pages: ['docker', 'vm'] },
        'fv3-row-alt-bg': { type: 'text', group: 'rows', label: 'Row alt background', desc: 'Alternating row background for even rows\nFormat: rgba(r,g,b,a), #hex, or transparent', pages: ['docker', 'vm'] },
        'fv3-folder-name-min-width': { type: 'dimension', group: 'dimensions', label: 'Folder name min width', desc: 'Minimum width of folder name cell\nRange: 100px – 400px', pages: ['docker', 'vm'], min: 100, max: 400, unit: 'px' },
        'fv3-folder-preview-bg': { type: 'text', group: 'preview', label: 'Preview background', desc: 'Background of the folder preview area\nFormat: rgba(r,g,b,a) or #hex', pages: ['docker', 'vm'] },
        'fv3-preview-icon-size': { type: 'dimension', group: 'preview', label: 'Preview icon size', desc: 'Size of container/VM icons in folder preview\nRange: 16px – 64px', pages: ['docker', 'vm'], min: 16, max: 64, unit: 'px' },
        'fv3-appname-max-width': { type: 'dimension', group: 'preview', label: 'App name max width', desc: 'Maximum width before container names truncate\nRange: 60px – 300px', pages: ['docker', 'vm'], min: 60, max: 300, unit: 'px' },
        'fv3-appname-size': { type: 'text', group: 'preview', label: 'App name size', desc: 'Container/VM name font size in folder previews\nFormat: 1.2rem, 12px, inherit', pages: ['docker', 'vm'], noSwatch: true },
        'fv3-preview-border-color': { type: 'text', group: 'preview', label: 'Preview border', desc: 'Default preview area border color (overridden by per-folder setting)\nFormat: #hex, rgba(), currentColor', pages: ['docker', 'vm'] },
        'fv3-vertical-bars-color': { type: 'text', group: 'preview', label: 'Vertical bars', desc: 'Default vertical divider bar color (overridden by per-folder setting)\nFormat: #hex, rgba(), currentColor', pages: ['docker', 'vm'] },
        'fv3-separator-color': { type: 'text', group: 'preview', label: 'Separator color', desc: 'Default row separator color in expand mode (overridden by per-folder setting)\nFormat: #hex, rgba()', pages: ['docker', 'vm'] },
        'fv3-separator-bg': { type: 'text', group: 'preview', label: 'Row separator bg', desc: 'Row separator background in expand mode (legacy)\nFormat: rgba(r,g,b,a) or #hex', pages: ['docker', 'vm'] },
        'fv3-scrollbar-color': { type: 'text', group: 'preview', label: 'Scrollbar color', desc: 'Scrollbar thumb in scroll-overflow folders\nFormat: rgba(r,g,b,a) or #hex', pages: ['docker', 'vm'] },
        'folder-view3-graph-cpu': { type: 'color', group: 'graphs', label: 'Graph CPU color', desc: 'CPU usage graph line color\nFormat: #hex', pages: ['docker'] },
        'folder-view3-graph-mem': { type: 'color', group: 'graphs', label: 'Graph memory color', desc: 'Memory usage graph line color\nFormat: #hex', pages: ['docker'] },

        /* ===== Dashboard — panel and layout styling ===== */
        'fv3-panel-border': { type: 'text', group: 'panels', label: 'Panel border', desc: 'Fullwidth/accordion expanded panel border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-panel-bg': { type: 'text', group: 'panels', label: 'Panel background', desc: 'Fullwidth/accordion expanded panel background\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-tab-active-bg': { type: 'text', group: 'panels', label: 'Active tab bg', desc: 'Dashboard expanded tab background\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-tab-active-border': { type: 'text', group: 'panels', label: 'Active tab border', desc: 'Dashboard expanded tab border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-showcase-bg': { type: 'text', group: 'panels', label: 'Showcase background', desc: 'Background of non-empty showcase area\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-bg': { type: 'text', group: 'inset', label: 'Inset panel bg', desc: 'Inset layout outer panel background\nFormat: rgba(r,g,b,a), #hex, or transparent', pages: ['dashboard'] },
        'fv3-inset-fill': { type: 'text', group: 'inset', label: 'Inset L-shape fill', desc: 'Inset layout SVG L-shape fill color\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-border-color': { type: 'text', group: 'inset', label: 'Inset border', desc: 'Inset layout panel border color\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-showcase-fill': { type: 'text', group: 'inset', label: 'Inset showcase fill', desc: 'Inset showcase area fill\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-inset-showcase-border': { type: 'text', group: 'inset', label: 'Inset showcase border', desc: 'Inset showcase area border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-border': { type: 'text', group: 'embossed', label: 'Embossed border', desc: 'Embossed layout outer border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-accent': { type: 'text', group: 'embossed', label: 'Embossed accent', desc: 'Embossed layout accent highlight\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-bg': { type: 'text', group: 'embossed', label: 'Embossed background', desc: 'Embossed layout outer panel background\nFormat: rgba(r,g,b,a), #hex, or transparent', pages: ['dashboard'] },
        'fv3-embossed-inner-border': { type: 'text', group: 'embossed', label: 'Embossed inner border', desc: 'Embossed layout inner panel border\nFormat: rgba(r,g,b,a) or #hex', pages: ['dashboard'] },
        'fv3-embossed-inner-bg': { type: 'text', group: 'embossed', label: 'Embossed inner bg', desc: 'Embossed layout inner panel background\nFormat: rgba(r,g,b,a), #hex, or transparent', pages: ['dashboard'] }
    };

    const presets = [
        {
            name: 'Default',
            values: {}
        },
        {
            name: 'Orange Accent',
            values: {
                'fv3-accent-color': '#f97316',
                'fv3-appname-color': '#fb923c',
                'fv3-toggle-color': '#f97316',
                'fv3-toggle-hover-color': '#fb923c',
                'fv3-embossed-accent': '#f97316',
                'fv3-chevron-color': '#f97316',
                'fv3-preview-border-color': '#f97316',
                'fv3-vertical-bars-color': 'rgba(249,115,22,0.4)',
                'fv3-separator-color': 'rgba(249,115,22,0.3)',
                'folder-view3-graph-cpu': '#f97316',
                'folder-view3-graph-mem': '#eab308',
                'fv3-folder-name-weight': 'bold',
                'fv3-folder-row-border-width': '1px 4px 1px 4px',
                'fv3-folder-row-border-color': 'rgba(249,115,22,0.4)',
                'fv3-folder-row-radius': '4px',
                'fv3-folder-row-padding': '8px 6px',
                'fv3-preview-row-border-width': '1px 1px 1px 4px',
                'fv3-preview-row-border-color': 'rgba(249,115,22,0.3)'
            }
        },
        {
            name: 'Blue Accent',
            values: {
                'fv3-accent-color': '#3b82f6',
                'fv3-appname-color': '#60a5fa',
                'fv3-toggle-color': '#3b82f6',
                'fv3-toggle-hover-color': '#60a5fa',
                'fv3-embossed-accent': '#3b82f6',
                'fv3-chevron-color': '#3b82f6',
                'fv3-preview-border-color': '#3b82f6',
                'fv3-vertical-bars-color': 'rgba(59,130,246,0.4)',
                'fv3-separator-color': 'rgba(59,130,246,0.3)',
                'folder-view3-graph-cpu': '#3b82f6',
                'folder-view3-graph-mem': '#8b5cf6',
                'fv3-folder-name-weight': 'bold',
                'fv3-folder-row-border-width': '1px 4px 1px 4px',
                'fv3-folder-row-border-color': 'rgba(59,130,246,0.4)',
                'fv3-folder-row-radius': '4px',
                'fv3-folder-row-padding': '8px 6px',
                'fv3-preview-row-border-width': '1px 1px 1px 4px',
                'fv3-preview-row-border-color': 'rgba(59,130,246,0.3)'
            }
        },
        {
            name: 'Green Accent',
            values: {
                'fv3-accent-color': '#22c55e',
                'fv3-appname-color': '#4ade80',
                'fv3-toggle-color': '#22c55e',
                'fv3-toggle-hover-color': '#4ade80',
                'fv3-embossed-accent': '#22c55e',
                'fv3-chevron-color': '#22c55e',
                'fv3-preview-border-color': '#22c55e',
                'fv3-vertical-bars-color': 'rgba(34,197,94,0.4)',
                'fv3-separator-color': 'rgba(34,197,94,0.3)',
                'folder-view3-graph-cpu': '#22c55e',
                'folder-view3-graph-mem': '#06b6d4',
                'fv3-folder-name-weight': 'bold',
                'fv3-folder-row-border-width': '1px 4px 1px 4px',
                'fv3-folder-row-border-color': 'rgba(34,197,94,0.4)',
                'fv3-folder-row-radius': '4px',
                'fv3-folder-row-padding': '8px 6px',
                'fv3-preview-row-border-width': '1px 1px 1px 4px',
                'fv3-preview-row-border-color': 'rgba(34,197,94,0.3)'
            }
        },
        {
            name: 'Muted',
            values: {
                'fv3-accent-color': '#9ca3af',
                'fv3-appname-color': '#d1d5db',
                'fv3-toggle-color': '#9ca3af',
                'fv3-toggle-hover-color': '#d1d5db',
                'fv3-embossed-accent': '#9ca3af',
                'fv3-chevron-color': '#9ca3af',
                'fv3-preview-border-color': '#9ca3af',
                'fv3-vertical-bars-color': 'rgba(156,163,175,0.3)',
                'fv3-separator-color': 'rgba(156,163,175,0.2)',
                'fv3-separator-bg': 'rgba(128,128,128,0.1)',
                'fv3-panel-border': 'rgba(128,128,128,0.15)',
                'fv3-panel-bg': 'rgba(128,128,128,0.05)',
                'folder-view3-graph-cpu': '#6b7280',
                'folder-view3-graph-mem': '#9ca3af',
                'fv3-folder-name-weight': 'bold',
                'fv3-folder-row-border-width': '1px 4px 1px 4px',
                'fv3-folder-row-border-color': 'rgba(156,163,175,0.3)',
                'fv3-folder-row-radius': '4px',
                'fv3-folder-row-padding': '8px 6px',
                'fv3-preview-row-border-width': '1px 1px 1px 4px',
                'fv3-preview-row-border-color': 'rgba(156,163,175,0.2)'
            }
        }
    ];

    function customCssKey(scope) {
        return scope === 'global' ? 'custom_css' : 'custom_css_' + scope;
    }

    function updateCssLabel() {
        var label = document.getElementById('fv3-css-scope-label');
        if (!label) return;
        var names = { global: 'Global (all pages)', dashboard: 'Dashboard only', docker: 'Docker only', vm: 'VM only' };
        label.textContent = names[currentScope] || currentScope;
    }

    function getVal(varName) {
        const scope = cssConfig[currentScope] || {};
        if (scope[varName] !== undefined) return scope[varName];
        const globalVars = cssConfig.global || {};
        if (globalVars[varName] !== undefined) return globalVars[varName];
        if (_selectedPreset && _selectedPreset !== 'Default') {
            var allP = presets.concat(cssConfig.custom_presets || []);
            var sel = allP.find(function(p) { return p.name === _selectedPreset; });
            if (sel && sel.values[varName] !== undefined) return sel.values[varName];
        }
        return cssDefaults[varName] || '';
    }

    function setVal(varName, value) {
        if (!cssConfig[currentScope] || Array.isArray(cssConfig[currentScope])) cssConfig[currentScope] = {};
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
        { id: 'rounded', label: 'Pill Small', desc: 'Small rounded pill with circular knob' },
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
            var label = document.createElement('div');
            label.className = 'fv3-toggle-option-label';
            label.textContent = style.label;
            card.appendChild(label);
            card.appendChild(preview);

            card.addEventListener('click', function() {
                cssConfig.toggle_style = style.id;
                dirty = true;
                applyToggleStyle(style.id);
                renderTogglePicker();
                saveConfig(true);
            });

            container.appendChild(card);
        });
    }

    function applyToggleStyle(style) {
        if (style === 'default') {
            document.querySelectorAll('.fv3-toggle').forEach(function(el) {
                el.classList.remove('fv3-toggle', 'fv3-toggle-rounded', 'fv3-toggle-material', 'fv3-toggle-pill');
                el.classList.add('basic-switch');
                el.style.display = 'none';
            });
            if (typeof $ !== 'undefined' && $.fn.switchButton) {
                $('input.basic-switch').switchButton({ labels_placement: 'right', off_label: 'OFF', on_label: 'ON' });
                $('input.basic-switch').each(function() {
                    var bg = $(this).next('.switch-button-background');
                    if (bg.length) bg.toggleClass('checked', this.checked);
                });
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
                el.classList.remove('fv3-toggle-rounded', 'fv3-toggle-material', 'fv3-toggle-pill');
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
            if (currentScope === 'global' && meta.pages) return;
            if (currentScope !== 'global' && (!meta.pages || !meta.pages.includes(currentScope))) return;
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

            if (meta.type === 'color' || (meta.type === 'text' && meta.group !== 'dimensions' && !meta.noSwatch)) {
                const swatch = document.createElement('span');
                swatch.className = 'fv3-var-swatch';
                swatch.style.background = currentVal || cssDefaults[varName] || 'transparent';
                const picker = document.createElement('input');
                picker.type = 'color';
                picker.className = 'fv3-var-picker-hidden';
                picker.id = 'fv3-var-picker-' + varName;
                picker.name = 'fv3-var-picker-' + varName;
                picker.value = isColor(currentVal) ? currentVal : '#000000';
                swatch.addEventListener('click', () => picker.click());
                const text = document.createElement('input');
                text.type = 'text';
                text.id = 'fv3-var-text-' + varName;
                text.name = 'fv3-var-text-' + varName;
                text.value = currentVal;
                text.placeholder = cssDefaults[varName] || '';
                picker.addEventListener('input', () => {
                    text.value = picker.value;
                    swatch.style.background = picker.value;
                    setVal(varName, picker.value);
                });
                text.addEventListener('input', () => {
                    if (isColor(text.value)) { picker.value = text.value; }
                    swatch.style.background = text.value || 'transparent';
                    setVal(varName, text.value);
                });
                inputs.appendChild(swatch);
                inputs.appendChild(picker);
                inputs.appendChild(text);
            } else if (meta.type === 'dimension') {
                const numVal = parseInt(currentVal) || meta.min;
                const range = document.createElement('input');
                range.type = 'range';
                range.id = 'fv3-var-range-' + varName;
                range.name = 'fv3-var-range-' + varName;
                range.min = meta.min;
                range.max = meta.max;
                range.value = numVal;
                const num = document.createElement('input');
                num.type = 'number';
                num.id = 'fv3-var-num-' + varName;
                num.name = 'fv3-var-num-' + varName;
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
                text.id = 'fv3-var-text-' + varName;
                text.name = 'fv3-var-text-' + varName;
                text.value = currentVal;
                text.placeholder = cssDefaults[varName] || '';
                text.addEventListener('input', () => {
                    setVal(varName, text.value);
                });
                inputs.appendChild(text);
            }

            row.appendChild(inputs);

            const resetBtn = document.createElement('button');
            resetBtn.className = 'fv3-var-reset';
            resetBtn.textContent = 'Reset';
            resetBtn.addEventListener('click', () => {
                if (cssConfig[currentScope] && !Array.isArray(cssConfig[currentScope])) delete cssConfig[currentScope][varName];
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

    var _selectedPreset = null;

    function getPagePresets() {
        return cssConfig.page_presets || {};
    }

    function assignPresetToPage(presetName, page) {
        if (!cssConfig.page_presets || Array.isArray(cssConfig.page_presets)) cssConfig.page_presets = {};
        if (!cssConfig.page_values || Array.isArray(cssConfig.page_values)) cssConfig.page_values = {};
        var allPresets = presets.concat(cssConfig.custom_presets || []);
        var preset = allPresets.find(function(p) { return p.name === presetName; });
        cssConfig.page_presets[page] = presetName;
        cssConfig.page_values[page] = preset ? Object.assign({}, preset.values) : {};
        dirty = true;
    }

    function removePresetFromPage(page) {
        if (!cssConfig.page_presets || Array.isArray(cssConfig.page_presets)) cssConfig.page_presets = {};
        if (!cssConfig.page_values || Array.isArray(cssConfig.page_values)) cssConfig.page_values = {};
        cssConfig.page_presets[page] = null;
        delete cssConfig.page_values[page];
        dirty = true;
    }

    function previewPresetOnSettings(presetName) {
        // Clear all tracked vars AND all varMeta keys (covers vars set by customEvents.js on page load)
        (window._fv3AppliedVars || []).forEach(function(k) {
            document.documentElement.style.removeProperty('--' + k);
        });
        Object.keys(varMeta).forEach(function(k) {
            document.documentElement.style.removeProperty('--' + k);
        });
        window._fv3AppliedVars = [];

        // Re-apply global variable overrides first
        if (cssConfig.global && typeof cssConfig.global === 'object') {
            Object.entries(cssConfig.global).forEach(function(entry) {
                document.documentElement.style.setProperty('--' + entry[0], entry[1]);
                window._fv3AppliedVars.push(entry[0]);
            });
        }

        // Apply preset values on top (overrides globals)
        var allPresets = presets.concat(cssConfig.custom_presets || []);
        var preset = allPresets.find(function(p) { return p.name === presetName; });
        if (preset && presetName !== 'Default') {
            Object.entries(preset.values).forEach(function(entry) {
                document.documentElement.style.setProperty('--' + entry[0], entry[1]);
                if (window._fv3AppliedVars.indexOf(entry[0]) === -1) window._fv3AppliedVars.push(entry[0]);
            });
            document.body.setAttribute('data-fv3-preset', presetName);
        } else {
            document.body.removeAttribute('data-fv3-preset');
        }
    }

    function resolveSwatchColor(val, presetValues, fallback) {
        if (!val) return fallback;
        // Resolve var(--fv3-*) by looking up in preset's own values
        var varMatch = val.match(/^var\(--([^,)]+)(?:,\s*([^)]+))?\)\s*$/);
        if (varMatch) {
            var varName = varMatch[1];
            var varFallback = varMatch[2] ? varMatch[2].trim() : fallback;
            return resolveSwatchColor(presetValues[varName] || varFallback, presetValues, fallback);
        }
        // Make rgba opaque for swatch display (semi-transparent colors look washed out)
        var rgbaMatch = val.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,[\s\d.]+)?\)$/);
        if (rgbaMatch) return 'rgb(' + rgbaMatch[1] + ',' + rgbaMatch[2] + ',' + rgbaMatch[3] + ')';
        return val;
    }

    function getPresetRelevantPages(preset) {
        var pages = {};
        Object.keys(preset.values).forEach(function(varName) {
            var meta = varMeta[varName];
            if (!meta) return;
            if (!meta.pages) {
                pages.dashboard = true;
                pages.docker = true;
                pages.vm = true;
            } else {
                meta.pages.forEach(function(p) { pages[p] = true; });
            }
        });
        if (Object.keys(pages).length > 0) pages.settings = true;
        return pages;
    }

    function renderPresetCard(grid, preset, isCustom) {
        var isSelected = _selectedPreset === preset.name;
        var pagePresets = getPagePresets();
        var assignedPages = [];
        ['dashboard', 'docker', 'vm', 'settings'].forEach(function(p) {
            if (pagePresets[p] === preset.name) assignedPages.push(p);
        });

        var card = document.createElement('div');
        card.className = 'fv3-preset-card' + (isSelected ? ' fv3-preset-active' : '') + (assignedPages.length > 0 ? ' fv3-preset-assigned' : '');

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
                    ['dashboard', 'docker', 'vm', 'settings'].forEach(function(pg) {
                        if (pagePresets[pg] === preset.name) removePresetFromPage(pg);
                    });
                    if (_selectedPreset === preset.name) _selectedPreset = null;
                    dirty = true;
                    renderPresets();
                });
            });
            header.appendChild(del);
        }
        card.appendChild(header);

        var swatches = document.createElement('div');
        swatches.className = 'fv3-preset-swatches';
        var themeAccent = getComputedStyle(document.documentElement).getPropertyValue('--color-orange').trim() || '#f0a30a';
        var themeGraphCpu = getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu').trim() || '#2b8da3';
        var themeGraphMem = getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem').trim() || '#5d6db6';
        var pv = preset.values;
        var swatchColors = [
            resolveSwatchColor(pv['fv3-accent-color'] || cssDefaults['fv3-accent-color'], pv, themeAccent),
            resolveSwatchColor(pv['folder-view3-graph-cpu'] || cssDefaults['folder-view3-graph-cpu'], pv, themeGraphCpu),
            resolveSwatchColor(pv['folder-view3-graph-mem'] || cssDefaults['folder-view3-graph-mem'], pv, themeGraphMem),
            resolveSwatchColor(pv['fv3-toggle-hover-color'] || cssDefaults['fv3-toggle-hover-color'], pv, themeAccent)
        ];
        // Deduplicate — skip swatch if identical to a prior one
        var seen = [];
        swatchColors.forEach(function(c) {
            if (seen.indexOf(c) === -1) seen.push(c);
        });
        seen.forEach(function(c) {
            var swatch = document.createElement('div');
            swatch.className = 'fv3-preset-swatch';
            swatch.style.background = c;
            swatches.appendChild(swatch);
        });
        card.appendChild(swatches);

        if (assignedPages.length > 0 && preset.name !== 'Default') {
            var badges = document.createElement('div');
            badges.className = 'fv3-preset-badges';
            assignedPages.forEach(function(p) {
                var badge = document.createElement('span');
                badge.className = 'fv3-preset-badge';
                var pageLabels = { dashboard: 'Dashboard', docker: 'Docker', vm: 'VM', settings: 'Settings' };
                badge.textContent = pageLabels[p] || p;
                badges.appendChild(badge);
            });
            card.appendChild(badges);
        }

        if (isSelected && preset.name !== 'Default') {
            var relevantPages = getPresetRelevantPages(preset);
            var scopeRow = document.createElement('div');
            scopeRow.className = 'fv3-preset-scope';
            [['dashboard', 'Dashboard'], ['docker', 'Docker'], ['vm', 'VM'], ['settings', 'Settings']].forEach(function(p) {
                if (!relevantPages[p[0]]) return;
                var label = document.createElement('label');
                label.className = 'fv3-preset-scope-label';
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = pagePresets[p[0]] === preset.name;
                cb.addEventListener('change', function(e) {
                    e.stopPropagation();
                    var page = p[0];
                    if (this.checked) {
                        var currentOwner = pagePresets[page];
                        if (currentOwner && currentOwner !== preset.name && currentOwner !== 'Default') {
                            var self = this;
                            var pgLabels = { dashboard: 'Dashboard', docker: 'Docker', vm: 'VM', settings: 'Settings' };
                            swal({ title: (pgLabels[page] || page) + ' is using ' + currentOwner, text: 'Switch to ' + preset.name + '?', type: 'warning', showCancelButton: true, confirmButtonText: 'Switch' }, function(ok) {
                                if (ok) {
                                    assignPresetToPage(preset.name, page);
                                    saveConfig(true);
                                    renderPresets();
                                } else {
                                    self.checked = false;
                                }
                            });
                            return;
                        }
                        assignPresetToPage(preset.name, page);
                    } else {
                        removePresetFromPage(page);
                    }
                    if (page === 'settings') {
                        previewPresetOnSettings(this.checked ? preset.name : 'Default');
                    }
                    saveConfig(true);
                    renderPresets();
                });
                label.appendChild(cb);
                label.appendChild(document.createTextNode(' ' + p[1]));
                scopeRow.appendChild(label);
            });
            card.appendChild(scopeRow);
        }

        card.addEventListener('click', function(e) {
            if (e.target.tagName === 'INPUT') return;
            if (preset.name === 'Default') {
                var hasGlobal = cssConfig.global && Object.keys(cssConfig.global).length > 0;
                var hasScoped = ['dashboard', 'docker', 'vm'].some(function(s) { return cssConfig[s] && Object.keys(cssConfig[s]).length > 0; });
                var hasPages = ['dashboard', 'docker', 'vm', 'settings'].some(function(pg) { return cssConfig.page_presets && cssConfig.page_presets[pg]; });
                if (hasGlobal || hasScoped || hasPages) {
                    swal({ title: 'Reset to Default?', text: 'This will clear all variable overrides and page preset assignments.', type: 'warning', showCancelButton: true, confirmButtonText: 'Reset' }, function(ok) {
                        if (!ok) return;
                        ['dashboard', 'docker', 'vm', 'settings'].forEach(function(pg) { removePresetFromPage(pg); });
                        cssConfig.global = {};
                        cssConfig.dashboard = {};
                        cssConfig.docker = {};
                        cssConfig.vm = {};
                        dirty = true;
                        _selectedPreset = null;
                        previewPresetOnSettings('Default');
                        renderPresets();
                        renderVariables();
                    });
                } else {
                    _selectedPreset = null;
                    previewPresetOnSettings('Default');
                    renderPresets();
                    renderVariables();
                }
                return;
            }
            _selectedPreset = preset.name;
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

    async function detectUnraidTheme() {
        const darkFromDom = document.documentElement.classList.contains('dark');
        fv3ThemeName = darkFromDom ? 'dark' : 'light';
        window.fv3UnraidTheme = fv3ThemeName;
        try {
            const resp = await fetch('/graphql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': typeof csrf_token !== 'undefined' ? csrf_token : '' },
                credentials: 'same-origin',
                body: JSON.stringify({ query: '{ display { theme } }' })
            });
            if (resp.ok) {
                const json = await resp.json();
                if (json.data && json.data.display && json.data.display.theme) {
                    fv3ThemeName = json.data.display.theme;
                    window.fv3UnraidTheme = fv3ThemeName;
                }
            }
        } catch (e) {}
    }

    function isCssDarkTheme() {
        if (fv3ThemeName === 'black' || fv3ThemeName === 'gray' || fv3ThemeName === 'dark') return true;
        if (fv3ThemeName === 'azure' || fv3ThemeName === 'white' || fv3ThemeName === 'light') return false;
        return document.documentElement.classList.contains('dark');
    }

    async function loadConfig() {
        try {
            const [configResp, defaultsResp] = await Promise.all([
                fetch(API + '/read_css_config.php'),
                fetch(API + '/read_css_defaults.php'),
                detectUnraidTheme()
            ]);
            cssConfig = await configResp.json();
            cssDefaults = await defaultsResp.json();
        } catch (e) {
            console.error('[FV3] CSS Tool: failed to load config', e);
            cssConfig = {};
            cssDefaults = {};
        }
        Object.keys(varMeta).forEach(k => document.documentElement.style.removeProperty('--' + k));

        // Apply global scope variables first
        if (cssConfig.global && typeof cssConfig.global === 'object') {
            Object.entries(cssConfig.global).forEach(function(entry) {
                document.documentElement.style.setProperty('--' + entry[0], entry[1]);
            });
        }

        // Apply settings page preset (overrides globals)
        var settingsPreset = cssConfig.page_presets && cssConfig.page_presets.settings;
        _selectedPreset = settingsPreset || null;
        if (settingsPreset && settingsPreset !== 'Default') {
            var vals = cssConfig.page_values && cssConfig.page_values.settings;
            if (vals) {
                Object.entries(vals).forEach(function(entry) {
                    document.documentElement.style.setProperty('--' + entry[0], entry[1]);
                });
            }
            document.body.setAttribute('data-fv3-preset', settingsPreset);
        } else {
            document.body.removeAttribute('data-fv3-preset');
        }
        // Normalize scope objects (PHP encodes empty {} as [])
        ['global', 'dashboard', 'docker', 'vm'].forEach(function(k) {
            if (!cssConfig[k] || Array.isArray(cssConfig[k])) cssConfig[k] = {};
        });
        renderVariables();
        renderPresets();
        renderTogglePicker();
        applyToggleStyle(cssConfig.toggle_style || 'default');
        const customCss = document.getElementById('fv3-custom-css');
        if (customCss) customCss.value = cssConfig[customCssKey(currentScope)] || '';
        updateCssLabel();
        const userNotes = document.getElementById('fv3-user-notes');
        if (userNotes && cssConfig.user_notes) userNotes.value = cssConfig.user_notes;
    }

    async function saveConfig(silent) {
        const customCss = document.getElementById('fv3-custom-css');
        if (customCss) cssConfig[customCssKey(currentScope)] = customCss.value;
        const userNotes = document.getElementById('fv3-user-notes');
        if (userNotes) cssConfig.user_notes = userNotes.value;
        // Normalize scope objects before save (PHP encodes empty {} as [])
        ['global', 'dashboard', 'docker', 'vm'].forEach(function(k) {
            if (Array.isArray(cssConfig[k])) {
                var obj = {};
                Object.keys(cssConfig[k]).forEach(function(p) { obj[p] = cssConfig[k][p]; });
                cssConfig[k] = obj;
            }
        });
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
                if (!silent) swal({ title: 'Saved', text: 'CSS configuration saved.', type: 'success', timer: 1500 });
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
        var defaultName = (_selectedPreset || 'Custom') + ' Copy';
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
            var allP = presets.concat(cssConfig.custom_presets || []);
            var selPreset = allP.find(function(p) { return p.name === _selectedPreset; });
            if (selPreset) Object.assign(values, selPreset.values);
            Object.entries(cssConfig.global || {}).forEach(function(entry) {
                if (varMeta[entry[0]]) values[entry[0]] = entry[1];
            });
            ['dashboard', 'docker', 'vm'].forEach(function(scope) {
                Object.entries(cssConfig[scope] || {}).forEach(function(entry) {
                    if (varMeta[entry[0]]) values[entry[0]] = entry[1];
                });
            });
            if (!cssConfig.custom_presets) cssConfig.custom_presets = [];
            var existing = cssConfig.custom_presets.findIndex(function(p) { return p.name === name; });
            if (existing >= 0) {
                cssConfig.custom_presets[existing].values = values;
            } else {
                cssConfig.custom_presets.push({ name: name, values: values });
            }
            _selectedPreset = name;
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
                if (customCss) customCss.value = cssConfig[customCssKey(currentScope)] || '';
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
            const checkBtn = checkEl.closest('.fv3-theme-card')?.querySelector('.fv3-theme-check-update');
            if (checkBtn) { checkBtn.disabled = true; checkBtn.innerHTML = '<i class="fa fa-circle-o-notch fa-spin"></i>'; }
            try {
                const apiBase = 'https://api.github.com/repos/' + theme.source.repo + '/contents/';
                const subPath = theme.source.path || '';
                const branchRef = theme.source.branch ? '?ref=' + encodeURIComponent(theme.source.branch) : '';
                const encodedPath = subPath ? subPath.split('/').map(encodeURIComponent).join('/') : '';
                const fetchUrl = (encodedPath ? apiBase + encodedPath : apiBase) + branchRef;
                const resp = await fetch(fetchUrl, { headers: { 'User-Agent': 'FolderView3' } });
                if (!resp.ok) { console.warn('[FV3] Update check failed for', theme.name, resp.status); checkEl.innerHTML = '<span style="opacity:0.4">check failed (' + resp.status + ')</span>'; continue; }
                const files = await resp.json();
                const remoteShas = {};
                files.filter(f => f.type === 'file' && /\.css$/i.test(f.name)).forEach(f => {
                    remoteShas[f.name] = f.sha;
                });
                if (!subPath) {
                    const dirs = files.filter(f => f.type === 'dir');
                    for (const dir of dirs) {
                        try {
                            const subResp = await fetch(apiBase + encodeURIComponent(dir.name) + branchRef, { headers: { 'User-Agent': 'FolderView3' } });
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
                if (!window._fv3ThemeUpdateCache) window._fv3ThemeUpdateCache = {};
                window._fv3ThemeUpdateCache[theme.name] = hasUpdate ? 'update' : 'current';
                try { localStorage.setItem('fv3_theme_update_cache', JSON.stringify(window._fv3ThemeUpdateCache)); } catch(e) {}
                if (hasUpdate) {
                    checkEl.innerHTML = '<span class="fv3-update-available"><i class="fa fa-cloud-download" style="color:#3b82f6"></i> <span data-i18n="apply-update" style="color:#3b82f6">update ready</span></span>';
                    const card = checkEl.closest('.fv3-theme-card');
                    const updateBtn = card?.querySelector('.fv3-theme-update');
                    if (updateBtn) updateBtn.style.display = '';
                } else {
                    checkEl.innerHTML = '<span class="fv3-update-current"><i class="fa fa-check" style="color:#4ecca3"></i> <span data-i18n="up-to-date" style="color:#4ecca3">up-to-date</span></span>';
                }
            } catch (e) {
                console.warn('[FV3] Update check error for', theme.name, e);
                checkEl.innerHTML = '<span style="opacity:0.4">offline</span>';
            }
            if (checkBtn) { checkBtn.disabled = false; checkBtn.innerHTML = '<i class="fa fa-refresh"></i>'; }
        }
    }

    async function loadThemes() {
        const container = document.getElementById('fv3-theme-list');
        if (!container) return;
        container.innerHTML = '';
        try {
            const resp = await fetch(API + '/list_themes.php');
            const themes = await resp.json();
            const hasActive = themes.some(t => t.enabled && t.isDir && t.source);

            const defaultCard = document.createElement('div');
            defaultCard.className = 'fv3-theme-card' + (!hasActive ? '' : ' fv3-theme-disabled');
            defaultCard.innerHTML = `
                <div class="fv3-theme-info">
                    <div class="fv3-theme-name">Default (Plugin CSS only)</div>
                    <div class="fv3-theme-status">${!hasActive ? 'Active' : 'Click to disable all themes'}</div>
                </div>
                <div class="fv3-theme-actions">
                    ${hasActive ? '<button class="fv3-theme-activate">Enable</button>' : ''}
                </div>`;
            defaultCard.querySelector('.fv3-theme-activate')?.addEventListener('click', async () => {
                for (const t of themes.filter(t => t.enabled && t.isDir && t.source)) {
                    await postForm(API + '/toggle_theme.php', { entry: t.entry, enable: 'false' });
                }
                loadThemes();
            });
            container.appendChild(defaultCard);

            window._fv3ThemeRegistry = {};
            themes.filter(t => t.isDir && t.source).forEach(theme => {
                window._fv3ThemeRegistry[theme.name] = theme;
                const card = document.createElement('div');
                card.className = 'fv3-theme-card' + (theme.enabled ? '' : ' fv3-theme-disabled');
                const repo = theme.source?.repo || '';
                const branch = theme.source?.branch || '';
                const sourcePath = theme.source?.path || '';
                const repoDisplay = repo ? escapeAttr(repo) + (branch ? ' (' + escapeAttr(branch) + ')' : '') : '';
                const owner = repo ? escapeAttr(repo.split('/')[0]) : '';
                const displayName = owner && sourcePath ? owner + ' / ' + escapeAttr(sourcePath)
                    : owner ? escapeAttr(repo) : escapeAttr(theme.name);
                card.dataset.entry = theme.entry;
                card.dataset.themeName = theme.name;
                card.innerHTML = `
                    <input type="checkbox" class="fv3-theme-select" title="Select for bulk delete">
                    <div class="fv3-theme-info">
                        <div class="fv3-theme-name">${displayName}</div>
                        <div class="fv3-theme-status">
                            ${theme.enabled ? '<span class="fv3-theme-active-label">Active</span>' : 'Disabled'}${repoDisplay ? ' — ' + repoDisplay : ''}
                        </div>
                        <div class="fv3-theme-update-status">
                            ${repo ? '<span class="fv3-update-check" data-theme="' + escapeAttr(theme.name) + '"></span>' : ''}
                        </div>
                    </div>
                    <div class="fv3-theme-actions">
                        ${theme.enabled
                            ? '<button class="fv3-theme-disable">Disable</button>'
                            : '<button class="fv3-theme-activate">Enable</button>'}
                        ${repo ? '<button class="fv3-theme-check-update" title="Check for updates"><i class="fa fa-refresh"></i></button>' : ''}
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
                    const branch = theme.source?.branch || '';
                    if (!repo) { swal({ title: 'Error', text: 'No source repo recorded. Re-import manually.', type: 'error' }); return; }
                    var progress = showProgressDialog('Updating Theme');
                    progress.status('In Progress');
                    progress.section('Updating: ' + theme.name);
                    const data = { repo, path };
                    if (branch) data.branch = branch;
                    try {
                        const result = await postFormJson(API + '/import_theme.php', data);
                        if (result.error) {
                            progress.log('Failed: ' + result.error, 'error');
                        } else {
                            result.files.forEach(function(f) { progress.log(f, 'file'); });
                            progress.log(result.files.length + ' file(s) updated', 'success');
                            if (window._fv3ThemeUpdateCache) { delete window._fv3ThemeUpdateCache[theme.name]; try { localStorage.setItem('fv3_theme_update_cache', JSON.stringify(window._fv3ThemeUpdateCache)); } catch(e) {} }
                        }
                    } catch (e) {
                        progress.log('Error: ' + e.message, 'error');
                    }
                    progress.status('Complete');
                    await progress.done();
                    loadThemes();
                });
                card.querySelector('.fv3-theme-check-update')?.addEventListener('click', async () => {
                    await checkThemeUpdates([theme], container);
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
            const githubThemes = themes.filter(t => t.isDir && t.source?.repo);
            if (githubThemes.length > 0) {
                const btnBar = document.createElement('div');
                btnBar.className = 'fv3-theme-button-bar';
                btnBar.innerHTML = '<button class="fv3-theme-check-all"><span data-i18n="check-for-updates">Check for Updates</span></button><button class="fv3-theme-update-all"><span data-i18n="update-all">Update All</span></button>';
                btnBar.querySelector('.fv3-theme-check-all').addEventListener('click', () => {
                    runThemeUpdateCheck();
                });
                btnBar.querySelector('.fv3-theme-update-all').addEventListener('click', async () => {
                    const updatable = githubThemes.filter(t => window._fv3ThemeUpdateCache && window._fv3ThemeUpdateCache[t.name] === 'update');
                    if (!updatable.length) { swal({ title: 'No updates', text: 'All themes are up-to-date. Run a check first.', type: 'info', timer: 2000 }); return; }
                    var progress = showProgressDialog('Updating Themes');
                    var updated = 0;
                    progress.status('In Progress');
                    for (var i = 0; i < updatable.length; i++) {
                        var t = updatable[i];
                        progress.section('Updating: ' + t.name + ' (' + (i + 1) + '/' + updatable.length + ')');
                        var data = { repo: t.source.repo, path: t.source.path || '' };
                        if (t.source.branch) data.branch = t.source.branch;
                        try {
                            var result = await postFormJson(API + '/import_theme.php', data);
                            if (result.error) {
                                progress.log('Failed: ' + result.error, 'error');
                            } else {
                                result.files.forEach(function(f) { progress.log(f, 'file'); });
                                progress.log(result.files.length + ' file(s) updated', 'success');
                                updated++;
                                if (window._fv3ThemeUpdateCache) { delete window._fv3ThemeUpdateCache[t.name]; }
                            }
                        } catch (e) {
                            progress.log('Error: ' + e.message, 'error');
                        }
                    }
                    try { localStorage.setItem('fv3_theme_update_cache', JSON.stringify(window._fv3ThemeUpdateCache || {})); } catch(e) {}
                    progress.status('Complete');
                    progress.section('Summary');
                    progress.log(updated + ' of ' + updatable.length + ' theme(s) updated');
                    await progress.done();
                    loadThemes();
                });
                container.appendChild(btnBar);
            }
            const manualThemes = themes.filter(t => !t.isDir || (t.isDir && !t.source));
            if (manualThemes.length > 0) {
                const heading = document.createElement('div');
                heading.className = 'fv3-var-group-heading';
                heading.style.marginTop = '1.5rem';
                heading.textContent = 'Manually installed';
                container.appendChild(heading);
                manualThemes.forEach(theme => {
                    const card = document.createElement('div');
                    card.className = 'fv3-theme-card' + (theme.enabled ? '' : ' fv3-theme-disabled');
                    card.dataset.entry = theme.entry;
                    card.dataset.themeName = theme.name;
                    card.innerHTML = `
                        <input type="checkbox" class="fv3-theme-select" title="Select for bulk delete">
                        <div class="fv3-theme-info">
                            <div class="fv3-theme-name">${escapeAttr(theme.name)}</div>
                            <div class="fv3-theme-status">${theme.enabled ? '<span class="fv3-theme-active-label">Active</span>' : 'Disabled'} — ${escapeAttr(theme.entry)}</div>
                        </div>
                        <div class="fv3-theme-actions">
                            ${theme.enabled
                                ? '<button class="fv3-theme-disable">Disable</button>'
                                : '<button class="fv3-theme-activate">Enable</button>'}
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
                    card.querySelector('.fv3-theme-delete')?.addEventListener('click', () => {
                        swal({ title: 'Delete theme?', text: 'Remove "' + escapeAttr(theme.name) + '" permanently?', type: 'warning', showCancelButton: true, confirmButtonText: 'Delete' }, async (ok) => {
                            if (!ok) return;
                            await postForm(API + '/delete_theme.php', { entry: theme.entry });
                            loadThemes();
                        });
                    });
                    container.appendChild(card);
                });
            }
            const allDeletableThemes = themes.filter(t => t.isDir);
            if (allDeletableThemes.length > 0) {
                const deleteBar = document.createElement('div');
                deleteBar.className = 'fv3-theme-button-bar';
                deleteBar.innerHTML = '<button class="fv3-theme-delete-selected" disabled><i class="fa fa-trash"></i> Delete Selected</button>';
                container.addEventListener('change', (e) => {
                    if (e.target.classList.contains('fv3-theme-select')) {
                        const checked = container.querySelectorAll('.fv3-theme-select:checked').length;
                        deleteBar.querySelector('.fv3-theme-delete-selected').disabled = !checked;
                    }
                });
                deleteBar.querySelector('.fv3-theme-delete-selected').addEventListener('click', () => {
                    const selected = container.querySelectorAll('.fv3-theme-select:checked');
                    if (!selected.length) return;
                    const names = Array.from(selected).map(cb => cb.closest('.fv3-theme-card').dataset.themeName);
                    swal({ title: 'Delete ' + selected.length + ' theme(s)?', text: names.join(', '), type: 'warning', showCancelButton: true, confirmButtonText: 'Delete' }, async (ok) => {
                        if (!ok) return;
                        for (const cb of selected) {
                            const entry = cb.closest('.fv3-theme-card').dataset.entry;
                            await postForm(API + '/delete_theme.php', { entry });
                        }
                        loadThemes();
                    });
                });
                container.appendChild(deleteBar);
            }
            if (!window._fv3ThemeUpdateCache) {
                try { window._fv3ThemeUpdateCache = JSON.parse(localStorage.getItem('fv3_theme_update_cache')) || null; } catch(e) {}
            }
            if (window._fv3ThemeUpdateCache) {
                container.querySelectorAll('.fv3-update-check[data-theme]').forEach(el => {
                    var status = window._fv3ThemeUpdateCache[el.dataset.theme];
                    if (status === 'update') {
                        el.innerHTML = '<span class="fv3-update-available"><i class="fa fa-cloud-download" style="color:#3b82f6"></i> <span data-i18n="apply-update" style="color:#3b82f6">update ready</span></span>';
                        var updateBtn = el.closest('.fv3-theme-card')?.querySelector('.fv3-theme-update');
                        if (updateBtn) updateBtn.style.display = '';
                    } else if (status === 'current') {
                        el.innerHTML = '<span class="fv3-update-current"><i class="fa fa-check" style="color:#4ecca3"></i> <span data-i18n="up-to-date" style="color:#4ecca3">up-to-date</span></span>';
                    }
                });
            }
        } catch (e) {
            container.innerHTML = '<p style="opacity:0.5">Failed to load themes.</p>';
        }
    }

    function runThemeUpdateCheck() {
        const container = document.getElementById('fv3-theme-list');
        if (!container) return;
        const themeCards = container.querySelectorAll('.fv3-theme-card .fv3-update-check[data-theme]');
        if (!themeCards.length) return;
        const themes = Array.from(themeCards).map(el => {
            return window._fv3ThemeRegistry && window._fv3ThemeRegistry[el.dataset.theme];
        }).filter(Boolean);
        if (themes.length) {
            checkThemeUpdates(themes, container);
            try { localStorage.setItem('fv3_last_theme_check', Date.now()); } catch (e) {}
        }
    }

    // Auto-check on page load if 1+ hour since last check
    function maybeAutoCheckThemes() {
        try {
            const last = parseInt(localStorage.getItem('fv3_last_theme_check')) || 0;
            if (Date.now() - last < 60 * 60 * 1000) return;
        } catch (e) {}
        runThemeUpdateCheck();
    }

    // Schedule hourly update checks for long-lived sessions
    (function scheduleThemeUpdateChecks() {
        if (window._fv3ThemeCheckInterval) return;
        window._fv3ThemeCheckInterval = setInterval(runThemeUpdateCheck, 60 * 60 * 1000);
    })();

    function parseRepoInput(raw) {
        var val = raw.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
        var branch = '';
        var treeMatch = val.match(/^([^\/]+\/[^\/]+)\/tree\/(.+)$/);
        if (treeMatch) { return { repo: treeMatch[1], branch: treeMatch[2] }; }
        var colonMatch = val.match(/^([^\/]+\/[^\/]+):(.+)$/);
        if (colonMatch) { return { repo: colonMatch[1], branch: colonMatch[2] }; }
        return { repo: val, branch: '' };
    }

    async function importTheme() {
        const input = document.getElementById('fv3-theme-repo');
        const rawInput = input?.value?.trim();
        if (!rawInput) { swal({ title: 'Error', text: 'Enter a GitHub repo (owner/repo or owner/repo:branch)', type: 'error' }); return; }
        const parsed = parseRepoInput(rawInput);
        const repo = parsed.repo;
        const branch = parsed.branch;
        const btn = document.getElementById('fv3-theme-import-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Checking repo...'; }
        try {
            var apiUrl = 'https://api.github.com/repos/' + repo + '/contents/';
            if (branch) apiUrl += '?ref=' + encodeURIComponent(branch);
            const resp = await fetch(apiUrl, { headers: { 'User-Agent': 'FolderView3' } });
            if (!resp.ok) { swal({ title: 'Error', text: 'Could not reach repo. Check the URL.', type: 'error' }); return; }
            const contents = await resp.json();
            const dirs = contents.filter(f => f.type === 'dir');
            const rootCss = contents.filter(f => f.type === 'file' && /\.css$/i.test(f.name));
            if (dirs.length > 0 && rootCss.length === 0) {
                if (btn) { btn.disabled = false; btn.textContent = 'Import from GitHub'; }
                const dirNames = dirs.map(d => d.name);
                showDirPicker(repo, dirNames, branch);
                return;
            }
            await doImport(repo, '', branch);
        } catch (e) {
            swal({ title: 'Error', text: 'Failed to fetch repo: ' + e.message, type: 'error' });
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Import from GitHub'; }
        }
    }

    function showDirPicker(repo, dirNames, branch) {
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
            if (selected.length > 1) {
                await doBatchImport(repo, selected, branch);
            } else {
                await doImport(repo, selected[0], branch);
            }
        });
        const cancel = document.createElement('button');
        cancel.textContent = 'Cancel';
        cancel.style.opacity = '0.6';
        cancel.addEventListener('click', () => picker.remove());
        actions.appendChild(importBtn);
        actions.appendChild(cancel);
        picker.appendChild(actions);
        const importRow = document.querySelector('.fv3-theme-import');
        if (importRow) {
            importRow.after(picker);
        } else {
            document.getElementById('fv3-tier-themes')?.appendChild(picker);
        }
    }

    async function doImport(repo, path, branch) {
        var label = path || repo;
        var progress = showProgressDialog('Importing Theme');
        var input = document.getElementById('fv3-theme-repo');

        progress.section('Downloading: ' + label);
        progress.status('In Progress');
        var data = { repo: repo, path: path || '' };
        if (branch) data.branch = branch;
        try {
            var result = await postFormJson(API + '/import_theme.php', data);
            if (result.error) {
                progress.log('Failed: ' + result.error, 'error');
                progress.status('Failed');
            } else {
                if (input) input.value = '';
                result.files.forEach(function(f) { progress.log(f, 'file'); });
                progress.log(result.files.length + ' file(s) downloaded', 'success');
                if (!window._fv3ThemeUpdateCache) window._fv3ThemeUpdateCache = {};
                window._fv3ThemeUpdateCache[result.name] = 'current';
                try { localStorage.setItem('fv3_theme_update_cache', JSON.stringify(window._fv3ThemeUpdateCache)); } catch(e) {}
                var urlWarnings = (result.warnings || []).filter(function(w) { return w.type === 'url(' && w.url && !w.url.startsWith('data:'); });
                if (urlWarnings.length > 0) {
                    progress.section('External URLs found');
                    urlWarnings.forEach(function(w) { progress.log(w.file + ': ' + w.url, 'warning'); });
                    progress.log('');
                    progress.log('This theme references external URLs. Keep it?');
                    var keep = await progress.confirm('Keep', 'Delete');
                    if (!keep) {
                        await postForm(API + '/delete_theme.php', { entry: result.name + '.disabled' });
                        progress.log('Theme deleted.', 'error');
                        progress.status('Removed');
                    } else {
                        progress.status('Complete');
                    }
                } else {
                    progress.status('Complete');
                }
            }
        } catch (e) {
            progress.log('Error: ' + e.message, 'error');
            progress.status('Failed');
        }

        await progress.done();
        loadThemes();
    }

    function showProgressDialog(title) {
        var html = '<pre id="fv3ProgressLog" style="text-align:left"></pre><hr>';
        swal({
            title: escapeAttr(title) + ' - <span id="fv3ProgressTitle">In Progress</span><span class="fv3-swal-spinner">\u21BB</span>',
            text: html,
            html: true,
            showConfirmButton: false,
            showCancelButton: false,
            allowOutsideClick: false,
            animation: 'none',
            customClass: 'nchan'
        });
        var swalEl = document.querySelector('.sweet-alert');
        var titleEl = swalEl.querySelector('h2');
        var statusEl = document.getElementById('fv3ProgressTitle');
        var log = document.getElementById('fv3ProgressLog');
        var scrollParent = log.closest('p') || log.parentElement;
        var btnContainer = swalEl.querySelector('.sa-button-container');
        var confirmContainer = swalEl.querySelector('.sa-confirm-button-container');
        var confirmBtn = confirmContainer ? confirmContainer.querySelector('.confirm') : null;
        var dotsEl = confirmContainer ? confirmContainer.querySelector('.la-ball-fall') : null;
        var currentSection = null;

        if (confirmBtn) { confirmBtn.style.display = 'none'; confirmBtn.style.backgroundColor = 'transparent'; }
        btnContainer.style.display = 'block';
        if (confirmContainer) confirmContainer.style.display = 'inline-block';
        if (dotsEl) dotsEl.style.display = 'block';

        return {
            status: function(text) {
                statusEl.textContent = text || 'In Progress';
                var spinner = titleEl.querySelector('.fv3-swal-spinner');
                if (spinner) spinner.style.display = text === 'Complete' || text === 'Finished' ? 'none' : '';
            },
            section: function(title) {
                var s = document.createElement('fieldset');
                s.className = 'docker';
                s.innerHTML = '<legend>' + escapeAttr(title) + '</legend><p class="logLine"></p>';
                log.appendChild(s);
                currentSection = s.querySelector('.logLine');
                scrollParent.scrollTop = scrollParent.scrollHeight;
            },
            log: function(msg, type) {
                var target = currentSection || log;
                var span = document.createElement('span');
                if (type === 'file') {
                    span.style.cssText = 'opacity:0.7;padding-left:4px';
                    span.innerHTML = '<i class="fa fa-file-text-o" style="margin-right:6px;opacity:0.5"></i>' + escapeAttr(msg);
                } else if (type === 'success') {
                    span.style.color = 'hsl(var(--success, 120 40% 55%))';
                    span.textContent = msg;
                } else if (type === 'error') {
                    span.style.cssText = 'color:hsl(var(--error, 0 65% 55%));font-weight:bold';
                    span.textContent = msg;
                } else if (type === 'warning') {
                    span.style.color = 'var(--color-orange, #f0a30a)';
                    span.textContent = msg;
                } else {
                    span.textContent = msg;
                }
                target.appendChild(span);
                target.appendChild(document.createElement('br'));
                scrollParent.scrollTop = scrollParent.scrollHeight;
            },
            confirm: function(yesLabel, noLabel) {
                if (dotsEl) dotsEl.style.display = 'none';
                var actions = document.createElement('div');
                actions.style.cssText = 'text-align:center;padding:8px 0 0';
                actions.innerHTML = '<button class="confirm" style="background-color:transparent;margin:0 6px">' + escapeAttr(noLabel) + '</button> <button class="confirm" style="background-color:transparent;margin:0 6px">' + escapeAttr(yesLabel) + '</button>';
                btnContainer.appendChild(actions);
                return new Promise(function(resolve) {
                    var btns = actions.querySelectorAll('button');
                    btns[0].addEventListener('click', function() { actions.remove(); if (dotsEl) dotsEl.style.display = 'block'; resolve(false); });
                    btns[1].addEventListener('click', function() { actions.remove(); if (dotsEl) dotsEl.style.display = 'block'; resolve(true); });
                });
            },
            done: function() {
                statusEl.textContent = 'Finished';
                var spinner = titleEl.querySelector('.fv3-swal-spinner');
                if (spinner) spinner.style.display = 'none';
                if (dotsEl) dotsEl.style.display = 'none';
                if (confirmBtn) { confirmBtn.textContent = 'Done'; confirmBtn.style.display = ''; }
                return new Promise(function(resolve) {
                    if (confirmBtn) {
                        confirmBtn.addEventListener('click', function() {
                            swal.close();
                            resolve();
                        });
                    }
                });
            }
        };
    }

    async function doBatchImport(repo, paths, branch) {
        var progress = showProgressDialog('Importing Themes');
        var succeeded = 0;
        var failed = 0;
        progress.status('In Progress');
        for (var i = 0; i < paths.length; i++) {
            var path = paths[i];
            progress.section('Downloading: ' + path + ' (' + (i + 1) + '/' + paths.length + ')');
            var data = { repo: repo, path: path };
            if (branch) data.branch = branch;
            try {
                var result = await postFormJson(API + '/import_theme.php', data);
                if (result.error) {
                    progress.log('Failed: ' + result.error, 'error');
                    failed++;
                } else {
                    result.files.forEach(function(f) { progress.log(f, 'file'); });
                    progress.log(result.files.length + ' file(s) downloaded', 'success');
                    if (!window._fv3ThemeUpdateCache) window._fv3ThemeUpdateCache = {};
                    window._fv3ThemeUpdateCache[result.name] = 'current';
                    var urlWarnings = (result.warnings || []).filter(function(w) { return w.type === 'url(' && w.url && !w.url.startsWith('data:'); });
                    if (urlWarnings.length > 0) {
                        urlWarnings.forEach(function(w) { progress.log(w.file + ': ' + w.url, 'warning'); });
                        progress.log('This theme references external URLs. Keep it?');
                        var keep = await progress.confirm('Keep', 'Delete');
                        if (!keep) {
                            await postForm(API + '/delete_theme.php', { entry: result.name + '.disabled' });
                            progress.log('Theme deleted.', 'error');
                            failed++;
                        } else {
                            succeeded++;
                        }
                    } else {
                        succeeded++;
                    }
                }
            } catch (e) {
                progress.log('Error: ' + e.message, 'error');
                failed++;
            }
        }
        try { localStorage.setItem('fv3_theme_update_cache', JSON.stringify(window._fv3ThemeUpdateCache || {})); } catch(e) {}
        progress.status('Finished');
        progress.section('Summary');
        progress.log(succeeded + ' imported' + (failed ? ', ' + failed + ' skipped/failed' : ''));
        await progress.done();
        loadThemes();
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
                var cssTextarea = document.getElementById('fv3-custom-css');
                if (cssTextarea) cssConfig[customCssKey(currentScope)] = cssTextarea.value;
                document.querySelectorAll('.fv3-subtab').forEach(t => t.classList.remove('fv3-subtab-active'));
                tab.classList.add('fv3-subtab-active');
                currentScope = tab.dataset.scope;
                renderVariables();
                if (cssTextarea) cssTextarea.value = cssConfig[customCssKey(currentScope)] || '';
                updateCssLabel();
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
                                setVal(parts[1], parts[2].trim());
                            }
                        });
                        renderVariables();
                    }
                }, 300);
            });
        }

        document.getElementById('fv3-css-save')?.addEventListener('click', () => saveConfig());
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
        });

        loadConfig();
        loadThemes().then(() => maybeAutoCheckThemes());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
