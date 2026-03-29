const escapeHtml = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

const rgbToHex = (rgb) => {
    const m = rgb.match(/\d+/g);
    return m ? '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('') : rgb;
};

const fv3ResetColor = (colorId, textId) => {
    const val = rgbToHex($('body').css('color'));
    $(`#${colorId}`).val(val);
    $(`#${textId}`).val(val);
};

const fv3SafeParse = window.fv3SafeParse || ((raw, fallback) => {
    if (raw !== null && typeof raw === 'object') return raw;
    try { return JSON.parse(raw); }
    catch (e) { console.error('[FV3] JSON parse failed:', e); return fallback; }
});

let dockers = {};
let vms = {};

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

const orderFolderIds = (folders, itemOrder) => {
    try {
        const ordered = [];
        const seen = new Set();
        for (const name of itemOrder) {
            for (const [folderId, folder] of Object.entries(folders)) {
                if (folder.containers && folder.containers.includes(name)) {
                    if (!seen.has(folderId)) {
                        ordered.push(folderId);
                        seen.add(folderId);
                    }
                    break;
                }
            }
        }
        for (const folderId of Object.keys(folders)) {
            if (!seen.has(folderId)) {
                ordered.push(folderId);
            }
        }
        return ordered;
    } catch (error) {
        return Object.keys(folders);
    }
};

const populateTable = async () => {
    const proms = await Promise.all([
        $.get('/plugins/folder.view3/server/read.php?type=docker').promise(),
        $.get('/plugins/folder.view3/server/read.php?type=vm').promise(),
        $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise(),
        $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise()
    ]);
    const dockerData = fv3SafeParse(proms[0], {});
    const vmData = fv3SafeParse(proms[1], {});
    const currentDockerContainerOrder = fv3SafeParse(proms[2], []);
    const currentVmOrder = fv3SafeParse(proms[3], []);

    dockers = dockerData;
    vms = vmData;

    const dockerTable = $('tbody#docker');
    const vmsTable = $('tbody#vms');

    dockerTable.empty();
    vmsTable.empty();

    const dockerIds = orderFolderIds(dockers, currentDockerContainerOrder);
    for (const id of dockerIds) {
        const folder = dockers[id];
        const fld = `<tr><td>${escapeHtml(id)}</td><td><img src="${escapeHtml(folder.icon)}" class="img" onerror="this.src='/plugins/dynamix.docker.manager/images/question.png';">${escapeHtml(folder.name)}</td><td><button title="Export" onclick="downloadDocker('${escapeHtml(id)}')"><i class="fa fa-download"></i></button><button title="Delete" onclick="clearDocker('${escapeHtml(id)}')"><i class="fa fa-trash"></i></button></td></tr>`;
        dockerTable.append($(fld));
    }

    const vmIds = orderFolderIds(vms, currentVmOrder);
    for (const id of vmIds) {
        const folder = vms[id];
        const fld = `<tr><td>${escapeHtml(id)}</td><td><img src="${escapeHtml(folder.icon)}" class="img" onerror="this.src='/plugins/dynamix.docker.manager/images/question.png';">${escapeHtml(folder.name)}</td><td><button title="Export" onclick="downloadVm('${escapeHtml(id)}')"><i class="fa fa-download"></i></button><button title="Delete" onclick="clearVm('${escapeHtml(id)}')"><i class="fa fa-trash"></i></button></td></tr>`;
        vmsTable.append($(fld));
    }

    const dockerCount = document.getElementById('fv3-docker-count');
    const vmCount = document.getElementById('fv3-vm-count');
    if (dockerCount) dockerCount.textContent = `(${dockerIds.length})`;
    if (vmCount) vmCount.textContent = `(${vmIds.length})`;
};

populateTable();

const buildOrderedExport = async (folders, type) => {
    const order = fv3SafeParse(await $.get(`/plugins/folder.view3/server/read_unraid_order.php?type=${type}`).promise(), []);
    const orderedIds = orderFolderIds(folders, order);
    const exportData = {};
    for (const folderId of orderedIds) {
        if (folders[folderId]) {
            exportData[folderId] = folders[folderId];
        }
    }
    return exportData;
};

const downloadDocker = async (id) => {
    if (id) {
        downloadFile(`${dockers[id].name}.json`, JSON.stringify(dockers[id]));
    } else {
        try {
            downloadFile(`Docker.json`, JSON.stringify(await buildOrderedExport(dockers, 'docker')));
        } catch (error) {
            downloadFile(`Docker.json`, JSON.stringify(dockers));
        }
    }
};

const importDocker = () => {
    let input = document.getElementById('fv3-import-docker-file');
    input.onchange = (e) => {

        // getting a hold of the file reference
        let file = e.target.files[0];

        // setting up the reader
        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        // here we tell the reader what to do when it's done reading...
        reader.onload = async (readerEvent) => {
            let content = readerEvent.target.result; // this is the content!
            $(input).off();
            try {
                content = JSON.parse(content);
            } catch (error) {
                swal({
                    title: 'Error',
                    text: 'Error parsing the input file, please select a JSON file',
                    type: 'error',
                });
                return;
            }

            if(content.name) {
                await $.post('/plugins/folder.view3/server/create.php', { type: 'docker', content: JSON.stringify(content) });
            } else {
                for (const [id, folder] of Object.entries(content)) {
                    await $.post('/plugins/folder.view3/server/update.php', { type: 'docker', content: JSON.stringify(folder), id: id });
                }
                await $.post('/plugins/folder.view3/server/sync_order.php', { type: 'docker' });
            }
            populateTable();
        }
    }
    input.click();
};

const importVm = () => {
    let input = document.getElementById('fv3-import-vm-file');
    input.onchange = (e) => {

        // getting a hold of the file reference
        let file = e.target.files[0];

        // setting up the reader
        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        // here we tell the reader what to do when it's done reading...
        reader.onload = async (readerEvent) => {
            let content = readerEvent.target.result; // this is the content!
            $(input).off();
            try {
                content = JSON.parse(content);
            } catch (error) {
                swal({
                    title: 'Error',
                    text: 'Error parsing the input file, please select a JSON file',
                    type: 'error',
                });
                return;
            }

            if(content.name) {
                await $.post('/plugins/folder.view3/server/create.php', { type: 'vm', content: JSON.stringify(content) });
            } else {
                for (const [id, folder] of Object.entries(content)) {
                    await $.post('/plugins/folder.view3/server/update.php', { type: 'vm', content: JSON.stringify(folder), id: id });
                }
            }
            populateTable();
        }
    }
    input.click();
};

const clearDocker = (id) => {
    if (id) {
        swal({
            title: 'Are you sure?',
            text: `Remove folder: ${escapeHtml(dockers[id].name)}`,
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                await $.post('/plugins/folder.view3/server/delete.php', { type: 'docker', id: id }).promise();
            } catch (error) {
                console.error('Docker delete error:', error);
                swal({ title: 'Error', text: 'Failed to delete folder: ' + error.statusText, type: 'error' });
                return;
            }
            populateTable();
        });
    } else {
        swal({
            title: 'Are you sure?',
            text: 'Remove ALL folders',
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                for (const cid of Object.keys(dockers)) {
                    await $.post('/plugins/folder.view3/server/delete.php', { type: 'docker', id: cid }).promise();
                }
            } catch (error) {
                console.error('Docker clear all error:', error);
                swal({ title: 'Error', text: 'Failed to clear all folders', type: 'error' });
                return;
            }
            populateTable();
        });
    }
};

const downloadVm = async (id) => {
    if (id) {
        downloadFile(`${vms[id].name}.json`, JSON.stringify(vms[id]));
    } else {
        try {
            downloadFile(`VM.json`, JSON.stringify(await buildOrderedExport(vms, 'vm')));
        } catch (error) {
            downloadFile(`VM.json`, JSON.stringify(vms));
        }
    }
};

const clearVm = (id) => {
    if (id) {
        swal({
            title: 'Are you sure?',
            text: `Remove folder: ${escapeHtml(vms[id].name)}`,
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                await $.post('/plugins/folder.view3/server/delete.php', { type: 'vm', id: id }).promise();
            } catch (error) {
                console.error('VM delete error:', error);
                swal({ title: 'Error', text: 'Failed to delete folder', type: 'error' });
                return;
            }
            populateTable();
        });
    } else {
        swal({
            title: 'Are you sure?',
            text: 'Remove ALL folders',
            type: 'warning',
            html: true,
            showCancelButton: true,
            confirmButtonText: 'Yes, delete it!',
            cancelButtonText: 'Cancel',
            showLoaderOnConfirm: true
        },
        async (c) => {
            if (!c) { return; }
            try {
                for (const cid of Object.keys(vms)) {
                    await $.post('/plugins/folder.view3/server/delete.php', { type: 'vm', id: cid }).promise();
                }
            } catch (error) {
                console.error('VM clear all error:', error);
                swal({ title: 'Error', text: 'Failed to clear all folders', type: 'error' });
                return;
            }
            populateTable();
        });
    }
};

const downloadFile = (name, content) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const element = document.createElement('a');
    element.href = url;
    element.download = name;
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
};

const fileManager = async (type) => {
    location.href = location.pathname + '/Browse?dir=/boot/config/plugins/folder.view3';
};

const fv3ToggleMap = {
    'dashboard-animation': 'dashboard_animation',
    'dashboard-docker-expand-toggle': 'dashboard_docker_expand_toggle',
    'dashboard-docker-greyscale': 'dashboard_docker_greyscale',
    'dashboard-docker-folder-label': 'dashboard_docker_folder_label',
    'dashboard-vm-expand-toggle': 'dashboard_vm_expand_toggle',
    'dashboard-vm-greyscale': 'dashboard_vm_greyscale',
    'dashboard-vm-folder-label': 'dashboard_vm_folder_label',
    'default-preview-hover': 'default_preview_hover',
    'default-preview-grayscale': 'default_preview_grayscale',
    'default-preview-webui': 'default_preview_webui',
    'default-preview-logs': 'default_preview_logs',
    'default-preview-console': 'default_preview_console',
    'default-preview-update': 'default_preview_update',
    'default-preview-vertical-bars': 'default_preview_vertical_bars',
    'default-preview-border': 'default_preview_border',
    'default-row-separator': 'default_row_separator',
    'default-update-column': 'default_update_column'
};

const fv3SelectMap = {
    'dashboard-docker-layout': 'dashboard_docker_layout',
    'dashboard-vm-layout': 'dashboard_vm_layout',
    'default-preview': 'default_preview',
    'default-overflow': 'default_overflow',
    'default-context': 'default_context'
};

const fv3ColorFields = [
    { toggleId: 'default-preview-vertical-bars', rowId: 'fv3-bars-color-row', colorId: 'default-vertical-bars-color', textId: 'default-vertical-bars-color-text', key: 'default_vertical_bars_color' },
    { toggleId: 'default-preview-border', rowId: 'fv3-border-color-row', colorId: 'default-border-color', textId: 'default-border-color-text', key: 'default_border_color' },
    { toggleId: 'default-row-separator', rowId: 'fv3-separator-color-row', colorId: 'default-separator-color', textId: 'default-separator-color-text', key: 'default_separator_color' }
];

const fv3ToggleNonClassicSettings = () => {
    const docker = $('select#dashboard-docker-layout').val();
    const vm = $('select#dashboard-vm-layout').val();
    $('.fv3-docker-nonclassic').css('display', docker !== 'classic' ? '' : 'none');
    $('.fv3-vm-nonclassic').css('display', vm !== 'classic' ? '' : 'none');
};

const fv3ApplyFormState = (settings) => {
    for (const [id, key] of Object.entries(fv3SelectMap)) {
        if (settings[key]) $(`select#${id}`).val(settings[key]);
    }
    for (const [id, key] of Object.entries(fv3ToggleMap)) {
        $(`#${id}`).prop('checked', settings[key] === 'yes');
    }
    fv3ToggleNonClassicSettings();
    const overflow = settings.default_overflow || '';
    $('.fv3-expand-only').css('display', overflow === 'expand' ? '' : 'none');
    fv3ColorFields.forEach(cf => {
        const val = settings[cf.key] || '';
        if (val) { $(`#${cf.colorId}`).val(val); $(`#${cf.textId}`).val(val); }
        else { $(`#${cf.colorId}`).val('#000000'); $(`#${cf.textId}`).val(''); }
        $(`#${cf.rowId}`).css('display', $(`#${cf.toggleId}`).is(':checked') ? 'flex' : 'none');
    });
    if (settings.default_preview_text_width) $(`#default-preview-text-width`).val(settings.default_preview_text_width);
    else $(`#default-preview-text-width`).val('');
};

const fv3CollectSettings = () => {
    const settings = {};
    for (const [id, key] of Object.entries(fv3SelectMap)) {
        settings[key] = $(`select#${id}`).val();
    }
    for (const [id, key] of Object.entries(fv3ToggleMap)) {
        settings[key] = $(`#${id}`).is(':checked') ? 'yes' : 'no';
    }
    fv3ColorFields.forEach(cf => {
        settings[cf.key] = $(`#${cf.textId}`).val() || '';
    });
    settings.default_preview_text_width = $(`#default-preview-text-width`).val() || '';
    return settings;
};

let fv3LoadedSettings = {};

const loadDashboardSettings = async () => {
    try {
        const settings = JSON.parse(await $.get('/plugins/folder.view3/server/read_settings.php').promise());
        fv3LoadedSettings = { ...settings };
        fv3ApplyFormState(settings);
    } catch (e) {
        console.error('Failed to load dashboard settings:', e);
    }
};

const fv3SubmitSettings = async () => {
    const current = fv3CollectSettings();
    const changed = {};
    for (const [key, value] of Object.entries(current)) {
        if ((fv3LoadedSettings[key] ?? '') !== value) changed[key] = value;
    }
    if (changed.dashboard_docker_layout === 'classic') {
        changed.dashboard_docker_folder_label = 'no';
        changed.dashboard_docker_expand_toggle = 'no';
    }
    if (changed.dashboard_vm_layout === 'classic') {
        changed.dashboard_vm_folder_label = 'no';
        changed.dashboard_vm_expand_toggle = 'no';
    }
    if (Object.keys(changed).length === 0) return;
    try {
        await $.ajax({
            url: '/plugins/folder.view3/server/update_settings_batch.php',
            method: 'POST',
            data: { settings: JSON.stringify(changed) }
        }).promise();
        fv3LoadedSettings = { ...fv3LoadedSettings, ...changed };
        fv3ApplyFormState(fv3LoadedSettings);
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
};

const fv3CancelSettings = () => {
    fv3ApplyFormState(fv3LoadedSettings);
};

// UI side effects (no save, just visual)
$('select#dashboard-docker-layout, select#dashboard-vm-layout').on('change', fv3ToggleNonClassicSettings);
$('select#default-overflow').on('change', function() {
    $('.fv3-expand-only').css('display', this.value === 'expand' ? '' : 'none');
});
fv3ColorFields.forEach(cf => {
    $(`#${cf.toggleId}`).on('change', function() { $(`#${cf.rowId}`).css('display', this.checked ? 'flex' : 'none'); });
    $(`#${cf.colorId}`).on('input', function() { $(`#${cf.textId}`).val(this.value); });
    $(`#${cf.textId}`).on('change', function() { $(`#${cf.colorId}`).val(this.value); });
});

$('#fv3-apply-defaults').on('click', function() {
    swal({
        title: 'Apply Defaults?',
        text: 'This will update all existing folders to use the current default settings. Per-folder overrides will be replaced.',
        type: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Apply'
    }, async (confirmed) => {
        if (!confirmed) return;
        const settings = fv3SafeParse(await $.get('/plugins/folder.view3/server/read_settings.php').promise(), {});
        const defaultMap = {
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
        for (const [type, folders] of [['docker', dockers], ['vm', vms]]) {
            for (const [id, folder] of Object.entries(folders)) {
                if (!folder.settings) folder.settings = {};
                Object.assign(folder.settings, defaultMap);
                await $.post('/plugins/folder.view3/server/update.php', {
                    type, id, content: JSON.stringify(folder)
                }).promise();
            }
        }
        swal({ title: 'Done', text: 'Defaults applied to all folders.', type: 'success', timer: 1500 });
    });
});

const fv3ExportAll = async () => {
    try {
        const resp = await fetch('/plugins/folder.view3/server/export_all.php', { credentials: 'same-origin' });
        const data = await resp.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fv3-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        if (data.css_skipped) {
            swal({ title: 'Partial Export', text: data.css_skipped_reason || 'Custom CSS files were too large and were excluded. Export them manually via File Manager.', type: 'warning' });
        }
    } catch (e) {
        swal({ title: 'Error', text: 'Export failed: ' + e.message, type: 'error' });
    }
};
window.fv3ExportAll = fv3ExportAll;

$('#fv3-import-all-btn').on('click', () => $('#fv3-import-all').click());
$('#fv3-import-all').on('change', function() {
    const file = this.files[0];
    if (!file) return;
    this.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.fv3_export_version) { swal({ title: 'Error', text: 'Not a valid FV3 backup file.', type: 'error' }); return; }
            const items = [];
            if (parsed.docker && Object.keys(parsed.docker).length) items.push(Object.keys(parsed.docker).length + ' Docker folders');
            if (parsed.vm && Object.keys(parsed.vm).length) items.push(Object.keys(parsed.vm).length + ' VM folders');
            if (parsed.settings && Object.keys(parsed.settings).length) items.push('settings');
            if (parsed.css_config && Object.keys(parsed.css_config).length) items.push('CSS config');
            if (parsed.custom_styles && Object.keys(parsed.custom_styles).length) items.push(Object.keys(parsed.custom_styles).length + ' custom CSS files');
            if (parsed.css_skipped) items.push('(custom CSS excluded — too large)');
            swal({
                title: 'Import Backup?',
                text: 'This will overwrite current config with: ' + items.join(', ') + '.' + (parsed.exported ? '\nExported: ' + parsed.exported : ''),
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Import'
            }, async (confirmed) => {
                if (!confirmed) return;
                const resp = await $.post('/plugins/folder.view3/server/import_all.php', { bundle: JSON.stringify(parsed) }).promise();
                const result = (typeof resp === 'object') ? resp : fv3SafeParse(resp, {});
                if (result.error) {
                    swal({ title: 'Error', text: result.error, type: 'error' });
                } else {
                    swal({ title: 'Restored', text: (result.restored || []).length + ' items restored. Reload to see changes.', type: 'success' });
                    populateTable();
                    loadDashboardSettings();
                }
            });
        } catch (err) {
            swal({ title: 'Error', text: 'Invalid JSON file.', type: 'error' });
        }
    };
    reader.readAsText(file);
});

// Page-level tab switching
const fv3SettingDefaults = {
    dashboard_docker_layout: 'classic', dashboard_vm_layout: 'classic',
    default_preview: '0', default_overflow: 'default', default_context: '0'
};

const fv3IsSettingsDirty = () => {
    const current = fv3CollectSettings();
    for (const [key, value] of Object.entries(current)) {
        const loaded = fv3LoadedSettings[key] ?? fv3SettingDefaults[key] ?? (value === 'yes' || value === 'no' ? 'no' : '');
        if (loaded !== value) return true;
    }
    return false;
};

window.fv3SwitchTab = (function() {
    var tabs = document.querySelectorAll('.fv3-page-tab');
    var panels = document.querySelectorAll('.fv3-page-panel');
    var currentTab = '';

    function switchTab(tabName, force) {
        if (!force && currentTab && currentTab !== tabName && currentTab !== 'backup') {
            var isDirty = false;
            if (currentTab === 'dashboard' || currentTab === 'defaults') {
                isDirty = fv3IsSettingsDirty();
            } else if (currentTab === 'css' && window.fv3IsCssDirty) {
                isDirty = window.fv3IsCssDirty();
            }
            if (isDirty) {
                var fromTab = currentTab;
                swal({
                    title: 'Unsaved Changes',
                    text: 'You have unsaved changes. Discard them?',
                    type: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Discard',
                    cancelButtonText: 'Stay',
                    closeOnConfirm: true,
                    closeOnCancel: true
                }, function(confirmed) {
                    if (confirmed === true) {
                        if (fromTab === 'dashboard' || fromTab === 'defaults') {
                            fv3CancelSettings();
                        }
                        switchTab(tabName, true);
                    }
                });
                return;
            }
        }
        currentTab = tabName;
        tabs.forEach(function(t) {
            t.classList.toggle('fv3-page-tab-active', t.getAttribute('data-tab') === tabName);
        });
        panels.forEach(function(p) {
            p.style.display = p.id === 'fv3-panel-' + tabName ? '' : 'none';
        });
        localStorage.setItem('fv3-settings-tab', tabName);
    }

    tabs.forEach(function(t) {
        t.addEventListener('click', function() { switchTab(this.getAttribute('data-tab')); });
    });

    return switchTab;
})();

loadDashboardSettings();
fv3SwitchTab(localStorage.getItem('fv3-settings-tab') || 'dashboard');