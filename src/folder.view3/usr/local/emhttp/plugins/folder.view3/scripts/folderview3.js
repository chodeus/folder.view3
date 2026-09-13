(function() {
    var isModern = !!document.querySelector('link[href*="default-base"]');
    document.body.dataset.fv3Unraid = isModern ? 'modern' : 'legacy';
    window.fv3UnraidLegacy = !isModern;
})();

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
    let proms;
    try {
        proms = await Promise.all([
            $.get('/plugins/folder.view3/server/read.php?type=docker').promise(),
            $.get('/plugins/folder.view3/server/read.php?type=vm').promise(),
            $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise(),
            $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise()
        ]);
    } catch (e) {
        console.error('[FV3] Failed to load folder data:', e);
        swal({ title: 'Error', text: fv3I18nOr('folder-data-load-failed', 'Could not load folder data. Try refreshing the page.'), type: 'error' });
        return;
    }
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
        const fld = `<tr><td>${escapeHtml(id)}</td><td><img src="${escapeHtml(folder.icon || '/plugins/dynamix.docker.manager/images/question.png')}" class="img" onerror="this.onerror=null;this.src='/plugins/dynamix.docker.manager/images/question.png';">${escapeHtml(folder.name)}</td><td><button title="Export" onclick="downloadDocker('${escapeHtml(id)}')"><i class="fa fa-download"></i></button><button title="Delete" onclick="clearDocker('${escapeHtml(id)}')"><i class="fa fa-trash"></i></button></td></tr>`;
        dockerTable.append($(fld));
    }

    const vmIds = orderFolderIds(vms, currentVmOrder);
    for (const id of vmIds) {
        const folder = vms[id];
        const fld = `<tr><td>${escapeHtml(id)}</td><td><img src="${escapeHtml(folder.icon || '/plugins/dynamix.docker.manager/images/question.png')}" class="img" onerror="this.onerror=null;this.src='/plugins/dynamix.docker.manager/images/question.png';">${escapeHtml(folder.name)}</td><td><button title="Export" onclick="downloadVm('${escapeHtml(id)}')"><i class="fa fa-download"></i></button><button title="Delete" onclick="clearVm('${escapeHtml(id)}')"><i class="fa fa-trash"></i></button></td></tr>`;
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

// A folder export is either one folder object or an id => folder map (both shapes are what
// folder.view2 downloads). Neither carries a docker|vm marker — the caller supplies the type.
const fv3IsFolderShaped = (o) => !!o && typeof o === 'object' && !Array.isArray(o)
    && typeof o.name === 'string'
    && (Array.isArray(o.containers) || (!!o.settings && typeof o.settings === 'object'));

const fv3CountFolderExport = (parsed) => {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0;
    if (fv3IsFolderShaped(parsed)) return 1;
    const folders = Object.values(parsed);
    return (folders.length && folders.every(fv3IsFolderShaped)) ? folders.length : 0;
};

// Imports every folder, carrying on past failures; closes any open modal or reports the ones refused
const fv3ImportFolderMap = async (content, type) => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        swal({ title: 'Error', text: fv3I18nOr('invalid-folder-export', 'This file is not a folder export.'), type: 'error' });
        return;
    }
    // Structural test, not `content.name` — an empty name is legal and would otherwise route a
    // single folder down the map path, writing its own keys (name, icon, settings…) as folder ids.
    const jobs = fv3IsFolderShaped(content)
        ? [{ url: '/plugins/folder.view3/server/create.php', data: { type: type, content: JSON.stringify(content) }, label: content.name || 'folder' }]
        : Object.entries(content).map(([id, folder]) => ({ url: '/plugins/folder.view3/server/update.php', data: { type: type, content: JSON.stringify(folder), id: id }, label: folder?.name || id }));
    const failed = await postEach(jobs);
    let syncError = null;
    if (type === 'docker') {
        try {
            await $.post('/plugins/folder.view3/server/sync_order.php', { type: 'docker' }).promise();
        } catch (error) {
            console.warn('[FV3] Autostart order sync failed after import:', fv3FailReason(error));
            syncError = fv3FailReason(error);
        }
    }
    populateTable();
    const syncText = syncError ? fv3I18nOr('order-sync-failed', 'Saved, but the Docker start order could not be updated: $1', syncError) : '';
    if (showBatchErrors(failed, { key: 'import-folders-failed', text: 'These folders could not be imported: $1' }, null, syncText)) return;
    if (syncText) { swal({ title: 'Warning', text: syncText, type: 'warning' }); } else { swal.close(); }
};

const importDocker = () => {
    let input = document.getElementById('fv3-import-docker-file');
    input.onchange = (e) => {

        let file = e.target.files[0];
        e.target.value = ''; // reset so re-selecting the same file fires change again

        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        reader.onload = async (readerEvent) => {
            let content = readerEvent.target.result;
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

            if (content && content.fv3_export_version) {
                swal({ title: 'Wrong import', text: 'This is a full backup bundle — use "Import Everything" to restore it, or select a Docker folders export here.', type: 'error' });
                return;
            }
            await fv3ImportFolderMap(content, 'docker');
        }
    }
    input.click();
};

const importVm = () => {
    let input = document.getElementById('fv3-import-vm-file');
    input.onchange = (e) => {

        let file = e.target.files[0];
        e.target.value = ''; // reset so re-selecting the same file fires change again

        let reader = new FileReader();
        reader.readAsText(file, 'UTF-8');

        reader.onload = async (readerEvent) => {
            let content = readerEvent.target.result;
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

            if (content && content.fv3_export_version) {
                swal({ title: 'Wrong import', text: 'This is a full backup bundle — use "Import Everything" to restore it, or select a VM folders export here.', type: 'error' });
                return;
            }
            await fv3ImportFolderMap(content, 'vm');
        }
    }
    input.click();
};

// Confirm modals stay open until the request settles: a swal reopened inside close()'s hide timer is blanked
const swalLoaderOpts = { showLoaderOnConfirm: true, closeOnConfirm: false };

// Posts each job in turn, carrying on past failures; returns { label, reason } for each one that failed
const postEach = async (jobs) => {
    const failed = [];
    for (const { url, data, label } of jobs) {
        try {
            await $.post(url, data).promise();
        } catch (error) {
            console.error('[FV3] Request failed:', label, error);
            failed.push({ label, reason: fv3FailReason(error) });
        }
    }
    return failed;
};

// Replaces the open dialog with one error for a batch: a lone failure with its reason when `one` is given, else the
// failed names. Returns false, showing nothing, when every job went through
const showBatchErrors = (failed, many, one = null, extra = '') => {
    if (!failed.length) return false;
    const text = failed.length === 1 && one
        ? fv3I18nOr(one.key, one.text, failed[0].label, failed[0].reason)
        : fv3I18nOr(many.key, many.text, failed.map(f => f.label).join(', '));
    swal({ title: 'Error', text: extra ? text + '\n' + extra : text, type: 'error' });
    return true;
};

// Deletes one folder, or every folder of the type when id is omitted; the confirm stays open until the deletes settle
const clearFolders = (type, id) => {
    const folders = type === 'docker' ? dockers : vms;
    const ids = id ? [id] : Object.keys(folders);
    swal({
        title: 'Are you sure?',
        text: id ? `Remove folder: ${escapeHtml(folders[id].name)}` : 'Remove ALL folders',
        type: 'warning',
        html: true,
        showCancelButton: true,
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel',
        ...swalLoaderOpts
    },
    async (c) => {
        if (!c) { return; }
        const failed = await postEach(ids.map(fid => ({ url: '/plugins/folder.view3/server/delete.php', data: { type: type, id: fid }, label: folders[fid].name || fid })));
        populateTable();
        if (!showBatchErrors(failed,
            { key: 'clear-folders-failed', text: 'These folders could not be deleted: $1' },
            { key: 'delete-folder-failed', text: 'Could not delete folder "$1": $2' })) { swal.close(); }
    });
};

const clearDocker = (id) => clearFolders('docker', id);
const clearVm = (id) => clearFolders('vm', id);

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
    'default-preview-update-folder': 'default_preview_update_folder',
    'dashboard-update-container': 'dashboard_update_container',
    'dashboard-update-folder': 'dashboard_update_folder',
    'default-preview-vertical-bars': 'default_preview_vertical_bars',
    'default-preview-border': 'default_preview_border',
    'default-row-separator': 'default_row_separator',
    'default-update-column': 'default_update_column'
};

const fv3SelectMap = {
    'dashboard-docker-layout': 'dashboard_docker_layout',
    'dashboard-vm-layout': 'dashboard_vm_layout',
    'dashboard-context': 'dashboard_context',
    'dashboard-context-trigger': 'dashboard_context_trigger',
    'dashboard-context-graph': 'dashboard_context_graph',
    'default-preview': 'default_preview',
    'default-preview-status': 'default_preview_status',
    'default-overflow': 'default_overflow',
    'default-context': 'default_context',
    'default-context-trigger': 'default_context_trigger',
    'default-context-graph': 'default_context_graph'
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
    if (settings.default_context_graph_time) $(`#default-context-graph-time`).val(settings.default_context_graph_time);
    else $(`#default-context-graph-time`).val('60');
    if (settings.dashboard_context_graph_time) $(`#dashboard-context-graph-time`).val(settings.dashboard_context_graph_time);
    else $(`#dashboard-context-graph-time`).val('60');
    $('.fv3-dashboard-context-advanced').css('display', ($('select#dashboard-context').val() === '2') ? '' : 'none');
    fv3ApplyConstraints();
};

const fv3ApplyConstraints = () => {
    const preview = $('select#default-preview').val();
    const overflow = $('select#default-overflow').val();
    const context = $('select#default-context').val();
    $('[data-fv3-show-preview]').each(function() {
        const allowed = ($(this).attr('data-fv3-show-preview') || '').split(/\s+/);
        let show = allowed.includes(preview);
        if (show && this.classList.contains('fv3-expand-only')) show = overflow === 'expand';
        if (show && this.classList.contains('fv3-context-advanced')) show = context === '2';
        $(this).css('display', show ? '' : 'none');
    });
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
    settings.default_context_graph_time = $(`#default-context-graph-time`).val() || '';
    settings.dashboard_context_graph_time = $(`#dashboard-context-graph-time`).val() || '';
    return settings;
};

let fv3LoadedSettings = {};

const loadDashboardSettings = async () => {
    try {
        const settings = fv3SafeParse(await $.get('/plugins/folder.view3/server/read_settings.php').promise(), {});
        fv3LoadedSettings = { ...settings };
        fv3ApplyFormState(settings);
    } catch (e) {
        console.error('Failed to load dashboard settings:', e);
    }
};

const fv3SubmitSettings = async (quiet = false) => {
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
    if (Object.keys(changed).length === 0) {
        if (!quiet) swal({ title: 'No Changes', text: 'Settings are unchanged.', type: 'info', timer: 1500 });
        return true;
    }
    try {
        await $.ajax({
            url: '/plugins/folder.view3/server/update_settings_batch.php',
            method: 'POST',
            data: { settings: JSON.stringify(changed) }
        }).promise();
        fv3LoadedSettings = { ...fv3LoadedSettings, ...changed };
        fv3ApplyFormState(fv3LoadedSettings);
        if (!quiet) swal({ title: 'Saved', text: 'Settings saved.', type: 'success', timer: 1500 });
        return true;
    } catch (e) {
        var msg = e.responseText || e.statusText || e.message || 'Unknown error';
        console.error('Failed to save settings:', msg);
        swal({ title: 'Error', text: 'Failed to save settings: ' + msg, type: 'error' });
        return false;
    }
};

const fv3CancelSettings = () => {
    fv3ApplyFormState(fv3LoadedSettings);
};

// UI side effects (no save, just visual)
$('select#dashboard-docker-layout, select#dashboard-vm-layout').on('change', fv3ToggleNonClassicSettings);
$('select#default-preview, select#default-overflow, select#default-context').on('change', fv3ApplyConstraints);
$('select#dashboard-context').on('change', function() {
    $('.fv3-dashboard-context-advanced').css('display', this.value === '2' ? '' : 'none');
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
        confirmButtonText: 'Apply',
        ...swalLoaderOpts
    }, async (confirmed) => {
        if (!confirmed) return;
        // Quiet: its timed toasts would close this dialog's result. A failed save shows its error and stops here
        if (!(await fv3SubmitSettings(true))) return;
        const settings = fv3CollectSettings();
        const defaultMap = {
            preview: parseInt(settings.default_preview !== undefined ? settings.default_preview : '1', 10),
            preview_hover: settings.default_preview_hover === 'yes',
            preview_status: settings.default_preview_status || 'none',
            preview_grayscale: settings.default_preview_grayscale === 'yes',
            preview_webui: settings.default_preview_webui === 'yes',
            preview_logs: settings.default_preview_logs === 'yes',
            preview_console: settings.default_preview_console === 'yes',
            preview_update: settings.default_preview_update === 'yes',
            preview_update_folder: settings.default_preview_update_folder === 'yes',
            preview_vertical_bars: settings.default_preview_vertical_bars === 'yes',
            preview_vertical_bars_color: settings.default_vertical_bars_color || '',
            preview_border: settings.default_preview_border === 'yes',
            preview_border_color: settings.default_border_color || '',
            preview_row_separator: settings.default_row_separator === 'yes',
            preview_row_separator_color: settings.default_separator_color || '',
            preview_text_width: settings.default_preview_text_width || '',
            preview_overflow: settings.default_overflow === 'scroll' ? 2 : settings.default_overflow === 'expand' ? 1 : 0,
            context: parseInt(settings.default_context !== undefined ? settings.default_context : '1', 10),
            context_trigger: parseInt(settings.default_context_trigger || '0', 10),
            context_graph: parseInt(settings.default_context_graph || '1', 10),
            context_graph_time: parseInt(settings.default_context_graph_time || '60', 10),
            update_column: settings.default_update_column === 'yes',
            use_global_defaults: true
        };
        const jobs = [];
        for (const [type, folders] of [['docker', dockers], ['vm', vms]]) {
            for (const [id, folder] of Object.entries(folders)) {
                if (!folder.settings) folder.settings = {};
                const applyMap = Object.assign({}, defaultMap);
                if (folder.settings.lock_colors) {
                    delete applyMap.preview_vertical_bars_color;
                    delete applyMap.preview_border_color;
                    delete applyMap.preview_row_separator_color;
                }
                Object.assign(folder.settings, applyMap);
                jobs.push({ url: '/plugins/folder.view3/server/update.php', data: { type, id, content: JSON.stringify(folder) }, label: folder.name || id });
            }
        }
        const failed = await postEach(jobs);
        if (showBatchErrors(failed, { key: 'defaults-not-applied', text: 'Defaults were not applied to these folders: $1' })) return;
        swal({ title: 'Done', text: 'Defaults applied to all folders.', type: 'success', timer: 1500 });
    });
});

const fv3ExportAll = async () => {
    try {
        const resp = await fetch('/plugins/folder.view3/server/export_all.php', { credentials: 'same-origin' });
        const data = await resp.json();
        if (!resp.ok || data.error) {
            // Never save an aborted export as a backup file
            swal({ title: 'Export Failed', text: data.error || ('Server returned ' + resp.status), type: 'error' });
            return;
        }
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

const fv3ImportFolderExport = async (content, type) => {
    // Replace the choice modal rather than close it: a swal reopened inside close()'s hide timer is blanked
    swal({ title: fv3I18nOr('importing-folders', 'Importing folders…'), text: '', showConfirmButton: false });
    try {
        await fv3ImportFolderMap(content, type);
    } catch (err) {
        swal({ title: 'Error', text: fv3I18nOr('import-failed', 'Import failed: $1', fv3FailReason(err)), type: 'error' });
    }
};

$('#fv3-import-all-btn').on('click', () => $('#fv3-import-all').click());
$('#fv3-import-all').on('change', function() {
    const file = this.files[0];
    if (!file) return;
    this.value = '';
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.fv3_export_version) {
                // folder.view2 exports land here — take them rather than dead-ending the user.
                const count = fv3CountFolderExport(parsed);
                if (!count) { swal({ title: 'Error', text: 'Not a valid FV3 backup file.', type: 'error' }); return; }
                // The choice can't ride on the confirm/cancel boolean: swal reports ESC and Cancel
                // identically, so a dismissal would silently import as whichever type lost the coin toss.
                swal({
                    title: 'Folder export detected',
                    text: `<p>This file holds ${count} folder${count === 1 ? '' : 's'} — a FolderView2 or per-type export, not a full FV3 backup.</p>`
                        + '<p>Import as:</p><p>'
                        + '<button class="fv3-choice" style="margin:0 4px" data-fv3-type="docker">Docker folders</button>'
                        + '<button class="fv3-choice" style="margin:0 4px" data-fv3-type="vm">VM folders</button></p>',
                    html: true,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: 'Cancel'
                });
                // An inline onclick inside swal's own markup never fires — bind explicitly instead.
                // The buttons exist synchronously once swal() has returned.
                document.querySelectorAll('.sweet-alert button.fv3-choice').forEach(b => {
                    b.addEventListener('click', () => fv3ImportFolderExport(parsed, b.dataset.fv3Type));
                });
                return;
            }
            const items = [];
            if (parsed.docker && Object.keys(parsed.docker).length) items.push(Object.keys(parsed.docker).length + ' Docker folders');
            if (parsed.vm && Object.keys(parsed.vm).length) items.push(Object.keys(parsed.vm).length + ' VM folders');
            if (parsed.settings && Object.keys(parsed.settings).length) items.push('settings');
            if (parsed.autostart && Object.keys(parsed.autostart).length) items.push('autostart order');
            if (parsed.css_config && Object.keys(parsed.css_config).length) items.push('CSS config');
            if (parsed.custom_styles && Object.keys(parsed.custom_styles).length) items.push(Object.keys(parsed.custom_styles).length + ' custom CSS files');
            if (parsed.css_skipped) items.push('(custom CSS excluded — too large)');
            swal({
                title: 'Import Backup?',
                text: 'This will overwrite current config with: ' + items.join(', ') + '.' + (parsed.exported ? '\nExported: ' + parsed.exported : ''),
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Import',
                ...swalLoaderOpts
            }, async (confirmed) => {
                if (!confirmed) return;
                let result;
                try {
                    const resp = await $.post('/plugins/folder.view3/server/import_all.php', { bundle: JSON.stringify(parsed) }).promise();
                    result = (typeof resp === 'object' && resp !== null) ? resp : fv3SafeParse(resp, null);
                    // A reply that isn't a result object is a failed restore, never "0 items restored"
                    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid restore response');
                } catch (err) {
                    console.error('Import Everything error:', err);
                    swal({ title: 'Error', text: fv3I18nOr('import-failed', 'Import failed: $1', fv3FailReason(err)), type: 'error' });
                    return;
                }
                if (result.error) {
                    swal({ title: 'Error', text: result.error, type: 'error' });
                } else {
                    swal({ title: 'Restored', text: (result.restored || []).length + ' items restored.', type: 'success', timer: 2000 });
                    setTimeout(function() { location.reload(); }, 2000);
                }
            });
        } catch (err) {
            swal({ title: 'Error', text: 'Invalid JSON file.', type: 'error' });
        }
    };
    reader.readAsText(file);
});

// ---- Autostart tab ----
let fv3AsSnapshot = null;
let fv3AsInfo = {};
let fv3AsMembership = null;
let fv3AsLoadStarted = false;

const fv3AsFolderOf = (name) => {
    // Server-computed effective membership — explicit > label > regex (issue #61);
    // explicit-only scan is the fallback when that read failed.
    if (fv3AsMembership) {
        return Object.prototype.hasOwnProperty.call(fv3AsMembership, name) ? fv3AsMembership[name] : '';
    }
    for (const folder of Object.values(dockers)) {
        if (Array.isArray(folder.containers) && folder.containers.includes(name)) return folder.name || '';
    }
    return '';
};

const fv3AsRowHtml = (name, wait, enabled) => {
    const icon = (fv3AsInfo[name] && fv3AsInfo[name].icon) || '/plugins/dynamix.docker.manager/images/question.png';
    const folder = fv3AsFolderOf(name);
    const safeName = escapeHtml(name);
    return `<tr class="fv3-as-item" data-name="${safeName}"${enabled ? ' draggable="true"' : ''}>
        <td class="fv3-as-pos">${enabled ? `<input type="number" class="fv3-as-pos-input" min="1" name="fv3-as-pos-${safeName}">` : ''}</td>
        <td class="fv3-as-name"><img src="${escapeHtml(icon)}" class="img" draggable="false" onerror="this.onerror=null;this.src='/plugins/dynamix.docker.manager/images/question.png';">${safeName}</td>
        <td>${folder ? `<span class="fv3-scope-badge">${escapeHtml(folder)}</span>` : ''}</td>
        <td class="fv3-as-toggle-cell"><input type="checkbox" class="fv3-as-toggle fv3-checkbox" name="fv3-as-autostart-${safeName}"${enabled ? ' checked' : ''}></td>
        <td><input type="number" class="fv3-as-wait" min="0" max="3600" name="fv3-as-wait-${safeName}" value="${Number.isFinite(wait) ? wait : 0}"${enabled ? '' : ' disabled'}></td>
    </tr>`;
};

const fv3AsSortTable = (e) => {
    if (!$('#fv3-as-rows .fv3-as-dragging').length) return;
    e.preventDefault();
    const sib = [...$('#fv3-as-rows .fv3-as-item:not(.fv3-as-dragging)')];
    const bound = e.delegateTarget.getBoundingClientRect();
    const near = sib.find(el => e.clientY - bound.top <= el.offsetTop + el.offsetHeight / 2);
    if (near) $(near).before($('.fv3-as-dragging'));
    else $('#fv3-as-rows').append($('.fv3-as-dragging'));
};

const fv3AsRenumber = () => {
    $('#fv3-as-rows .fv3-as-item').each(function(i) { $(this).find('.fv3-as-pos-input').val(i + 1); });
};

// the sequence is only editable in custom mode — folder/off show a read-only view
const fv3AsApplyModeState = () => {
    const custom = $('#fv3-autostart-mode').val() === 'custom';
    $('#fv3-as-rows .fv3-as-item').attr('draggable', custom ? 'true' : 'false');
    $('#fv3-as-rows .fv3-as-wait').prop('disabled', !custom);
    $('#fv3-as-rows .fv3-as-pos-input').prop('disabled', !custom);
    $('.fv3-as-table').toggleClass('fv3-as-locked', !custom);
};

const fv3AsBindOnce = () => {
    $('#fv3-autostart-mode').on('change', fv3AsApplyModeState);
    $('.fv3-as-seq-table').on('dragover', fv3AsSortTable).on('dragenter', (e) => { e.preventDefault(); });
    // a child (e.g. the icon img) can natively start a drag even when the row is draggable=false — block it
    $(document).on('dragstart', '#fv3-as-rows .fv3-as-item', function(e) {
        if (this.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
        this.classList.add('fv3-as-dragging');
    });
    $(document).on('dragend', '#fv3-as-rows .fv3-as-item', function() { this.classList.remove('fv3-as-dragging'); fv3AsRenumber(); });
    $(document).on('touchstart', '#fv3-as-rows .fv3-as-item[draggable="true"]', function() { this.classList.add('fv3-as-dragging'); });
    $(document).on('touchmove', '#fv3-as-rows .fv3-as-item', function(e) {
        if (!this.classList.contains('fv3-as-dragging')) return;
        e.preventDefault();
        const touch = e.originalEvent.touches[0];
        fv3AsSortTable({ clientY: touch.clientY, preventDefault: () => {}, delegateTarget: this.closest('table') });
    });
    $(document).on('touchend', '#fv3-as-rows .fv3-as-item', function() { this.classList.remove('fv3-as-dragging'); fv3AsRenumber(); });
    // toggling moves the row between the sequence (end) and the not-autostarted section
    $(document).on('change', '.fv3-as-table .fv3-as-toggle', function() {
        const $tr = $(this).closest('tr');
        const on = this.checked;
        // switchButton re-fires change during init — only act on a genuine state flip
        if (on === $tr.parent().is('#fv3-as-rows')) return;
        $tr.find('.fv3-as-wait').prop('disabled', !on);
        if (on) {
            $tr.attr('draggable', 'true');
            $tr.find('.fv3-as-pos').html('<input type="number" class="fv3-as-pos-input" min="1" name="fv3-as-pos-' + $tr.attr('data-name') + '">');
            $('#fv3-as-rows').append($tr);
        } else {
            $tr.removeAttr('draggable');
            $tr.find('.fv3-as-wait').val(0);
            $tr.find('.fv3-as-pos').empty();
            $('#fv3-as-off-rows').append($tr);
        }
        fv3AsRenumber();
    });
    // type-to-jump: committing a number in the # column moves the row to that position
    $(document).on('change', '#fv3-as-rows .fv3-as-pos-input', function() {
        const $rows = $('#fv3-as-rows .fv3-as-item');
        const $tr = $(this).closest('tr');
        let pos = parseInt(this.value, 10);
        if (!Number.isFinite(pos)) { fv3AsRenumber(); return; }
        pos = Math.max(1, Math.min($rows.length, pos));
        const target = pos - 1;
        if (target === $rows.index($tr)) { fv3AsRenumber(); return; }
        const $others = $rows.not($tr);
        if (target >= $others.length) $('#fv3-as-rows').append($tr);
        else $others.eq(target).before($tr);
        fv3AsRenumber();
    });
    $(document).on('keydown', '#fv3-as-rows .fv3-as-pos-input', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
    });
};

const fv3LoadAutostart = async () => {
    try {
        const [as, info, memb] = (await Promise.all([
            $.get('/plugins/folder.view3/server/read_autostart.php').promise(),
            $.get('/plugins/folder.view3/server/read_info.php?type=docker').promise(),
            // badge enrichment only — a failed membership read must not break the tab
            $.get('/plugins/folder.view3/server/read_membership.php?type=docker').promise().catch(() => null)
        ])).map(r => fv3SafeParse(r, {}));
        fv3AsMembership = memb && typeof memb.membership === 'object' && memb.membership !== null ? memb.membership : null;
        fv3AsInfo = {};
        for (const [name, ct] of Object.entries(info)) {
            // only dockerman-managed containers participate in Unraid autostart
            if (ct && ct.info && ct.info.State && ct.info.State.manager && ct.info.State.manager !== 'dockerman') continue;
            fv3AsInfo[name] = { icon: (ct && ct.info && ct.info.Config && ct.info.Config.Labels && ct.info.Config.Labels['net.unraid.docker.icon']) || '' };
        }
        const fileEntries = as.autostart || [];
        const enabledNames = fileEntries.map(e => e.name);
        const waits = {};
        fileEntries.forEach(e => { waits[e.name] = e.wait || 0; });
        // custom mode displays the saved sequence; other modes show the true live-file order
        const seq = (as.mode === 'custom') ? (as.sequence || []).filter(n => enabledNames.includes(n)) : [];
        const ordered = seq.concat(enabledNames.filter(n => !seq.includes(n)));
        const disabled = Object.keys(fv3AsInfo).filter(n => !enabledNames.includes(n))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        $('#fv3-autostart-mode').val(as.mode || 'folder');
        $('#fv3-as-rows').html(ordered.map(n => fv3AsRowHtml(n, waits[n] || 0, true)).join(''));
        $('#fv3-as-off-rows').html(disabled.map(n => fv3AsRowHtml(n, 0, false)).join(''));
        $('.fv3-as-table input.fv3-as-toggle').switchButton({ labels_placement: 'right', off_label: 'OFF', on_label: 'ON' });
        fv3AsRenumber();
        fv3AsApplyModeState();
        const toggles = {};
        ordered.forEach(n => { toggles[n] = true; });
        disabled.forEach(n => { toggles[n] = false; });
        fv3AsSnapshot = { mode: as.mode || 'folder', sequence: [...ordered], waits: { ...waits }, toggles };
    } catch (e) {
        console.error('[FV3] Failed to load autostart tab:', e);
        swal({ title: 'Error', text: 'Failed to load autostart data.', type: 'error' });
    }
};

const fv3AsCollect = () => {
    const sequence = $('#fv3-as-rows .fv3-as-item').map((_, tr) => tr.getAttribute('data-name')).get();
    const waits = {};
    const toggles = {};
    $('.fv3-as-table .fv3-as-item').each(function() {
        const name = this.getAttribute('data-name');
        toggles[name] = $(this).find('.fv3-as-toggle').is(':checked');
        const w = parseInt($(this).find('.fv3-as-wait').val(), 10);
        waits[name] = Number.isFinite(w) && w > 0 ? w : 0;
    });
    return { mode: $('#fv3-autostart-mode').val(), sequence, waits, toggles };
};

const fv3IsAutostartDirty = () => {
    if (!fv3AsSnapshot) return false;
    const cur = fv3AsCollect();
    if (cur.mode !== fv3AsSnapshot.mode) return true;
    if (cur.sequence.join('\n') !== fv3AsSnapshot.sequence.join('\n')) return true;
    for (const [name, on] of Object.entries(cur.toggles)) {
        if ((fv3AsSnapshot.toggles[name] || false) !== on) return true;
    }
    for (const [name, w] of Object.entries(cur.waits)) {
        if ((fv3AsSnapshot.waits[name] || 0) !== w) return true;
    }
    return false;
};

const fv3CancelAutostart = () => { if (fv3AsSnapshot) fv3LoadAutostart(); };

const fv3SubmitAutostart = async () => {
    if (!fv3AsSnapshot) return;
    const cur = fv3AsCollect();
    try {
        // fresh file state, not the load-time snapshot: Unraid removes by exact "name wait" line match
        // (mismatch corrupts entry 0) and duplicates on re-add — a concurrent docker-page edit must not trip either
        const live = fv3SafeParse(await $.get('/plugins/folder.view3/server/read_autostart.php').promise(), {});
        const liveWaits = {};
        (live.autostart || []).forEach(e => { liveWaits[e.name] = e.wait || 0; });
        // autostart on/off goes through Unraid's own handler; the batch below re-asserts order after its re-sort
        for (const [name, on] of Object.entries(cur.toggles)) {
            if ((fv3AsSnapshot.toggles[name] || false) === on) continue;
            const inFile = Object.prototype.hasOwnProperty.call(liveWaits, name);
            if (on === inFile) continue;
            const wait = on ? (cur.waits[name] > 0 ? cur.waits[name] : '') : (liveWaits[name] > 0 ? liveWaits[name] : '');
            await $.post('/plugins/dynamix.docker.manager/include/UpdateConfig.php', {
                action: 'autostart', container: name, wait: wait, auto: on ? 'true' : 'false',
                csrf_token: typeof csrf_token !== 'undefined' ? csrf_token : ''
            }).promise();
        }
        await $.ajax({
            url: '/plugins/folder.view3/server/update_autostart.php',
            method: 'POST',
            data: { mode: cur.mode, sequence: JSON.stringify(cur.sequence), waits: JSON.stringify(cur.waits) }
        }).promise();
        await fv3LoadAutostart();
        swal({ title: 'Saved', text: 'Start order saved and applied.', type: 'success', timer: 1800 });
    } catch (e) {
        var msg = e.responseText || e.statusText || e.message || 'Unknown error';
        console.error('[FV3] Failed to save autostart:', msg);
        swal({ title: 'Error', text: 'Failed to save start order: ' + msg, type: 'error' });
    }
};

// Page-level tab switching
const fv3SettingDefaults = {
    dashboard_docker_layout: 'classic', dashboard_vm_layout: 'classic',
    dashboard_context: '0', dashboard_context_trigger: '0', dashboard_context_graph: '1', dashboard_context_graph_time: '60',
    default_preview: '0', default_preview_status: 'none', default_overflow: 'default', default_context: '0',
    default_context_trigger: '0', default_context_graph: '1', default_context_graph_time: '60'
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
            } else if (currentTab === 'autostart') {
                isDirty = fv3IsAutostartDirty();
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
                        } else if (fromTab === 'autostart') {
                            fv3CancelAutostart();
                        } else if (fromTab === 'css' && window.fv3ResetCssDirty) {
                            window.fv3ResetCssDirty();
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
        if (tabName === 'autostart') {
            if (!fv3AsLoadStarted) {
                fv3AsLoadStarted = true;
                fv3AsBindOnce();
                fv3LoadAutostart();
            } else if (!fv3IsAutostartDirty()) {
                // re-entering refreshes from the live file so docker-page edits always show
                fv3LoadAutostart();
            }
        }
    }

    tabs.forEach(function(t) {
        t.addEventListener('click', function() { switchTab(this.getAttribute('data-tab')); });
    });

    return switchTab;
})();

loadDashboardSettings();
fv3SwitchTab('backup');

// Intercept Unraid's SPA navigation to warn about unsaved changes
if (typeof initab === 'function') {
    const _origInitab = initab;
    window.initab = function(url) {
        const cssDirty = window.fv3IsCssDirty && window.fv3IsCssDirty();
        const settingsDirty = typeof fv3IsSettingsDirty === 'function' && fv3IsSettingsDirty();
        const autostartDirty = typeof fv3IsAutostartDirty === 'function' && fv3IsAutostartDirty();
        if (cssDirty || settingsDirty || autostartDirty) {
            swal({
                title: 'Unsaved Changes',
                text: 'You have unsaved changes. Discard them?',
                type: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Discard',
                cancelButtonText: 'Stay'
            }, function(confirmed) {
                if (confirmed === true) _origInitab(url);
            });
            return false;
        }
        return _origInitab(url);
    };
}

// Unraid top-nav links keep their href even when onclick returns false, so catch the click in the
// capture phase and navigate manually after the dirty-check.
document.addEventListener('click', function(e) {
    const a = e.target.closest && e.target.closest('a[onclick*="initab"]');
    if (!a) return;
    const cssDirty = window.fv3IsCssDirty && window.fv3IsCssDirty();
    const settingsDirty = typeof fv3IsSettingsDirty === 'function' && fv3IsSettingsDirty();
    if (!(cssDirty || settingsDirty)) return;
    e.preventDefault();
    e.stopPropagation();
    const href = a.getAttribute('href') || '';
    swal({
        title: 'Unsaved Changes',
        text: 'You have unsaved changes. Discard them?',
        type: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Discard',
        cancelButtonText: 'Stay'
    }, function(confirmed) {
        if (confirmed === true && href) window.location.href = href;
    });
}, true);