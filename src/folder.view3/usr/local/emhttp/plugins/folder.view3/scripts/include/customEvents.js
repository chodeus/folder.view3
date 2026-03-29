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