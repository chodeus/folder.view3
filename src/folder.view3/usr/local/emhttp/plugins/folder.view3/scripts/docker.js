// Global variables
let cpus = 1;
let loadedFolder = false;
let globalFolders = {};
const folderRegex = /^folder-/;
let folderDebugMode = !!window.FV3_DEBUG;
window.fv3DebugSource = 'DOCKER';
let folderobserver;
let folderobserverConfig = {
    subtree: true,
    attributes: true
};
let folderReq = [];

/**
 * Handles the creation of all folders
 */
// Folder rendering — orchestrate (createFolders) and per-folder build (createFolder)
const createFolders = async () => {
    fv3Debug('createFolders', 'Entry');
    await fv3LoadFolderDefaults();
    const prom = await Promise.all(folderReq);
    fv3Debug('createFolders', 'Promises resolved', prom);

    let folders = fv3SafeParseWithRecovery(prom[0], 'docker-folders', {});
    const unraidOrder = fv3SafeParse(prom[1], []);
    const containersInfo = fv3SafeParse(prom[2], {});
    let order = Object.values(fv3SafeParse(prom[3], {}));

    fv3ResolveRenamedContainers(folders, containersInfo, 'docker');
    Object.values(folders).forEach(f => fv3ApplyDefaults(f));

    // When userprefs.cfg is absent (no manual reorder), synthesize an alphabetical intermix
    // of folder names + orphan container names so folders slot into their natural position.
    // Folder members stay in their editor-chosen order inside the folder.
    // Variable naming is reversed from intuition: `unraidOrder` is read_order.php (raw
    // userprefs.cfg, including folder placeholders); `order` is read_unraid_order.php
    // (containers only, alphabetical when userprefs.cfg is absent). So the empty check
    // goes on unraidOrder, and orphans are drawn from order.
    if (unraidOrder.length === 0) {
        const memberSet = new Set(
            Object.values(folders).flatMap(f => Array.isArray(f.containers) ? f.containers : [])
        );
        const orphans = order.filter(name => !memberSet.has(name));
        const entries = [
            ...Object.entries(folders).map(([id, f]) => ({ key: `folder-${id}`, name: f.name || `folder-${id}` })),
            ...orphans.map(c => ({ key: c, name: c }))
        ];
        entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        order = entries.map(e => e.key);
        fv3Debug('createFolders', 'order synthesized (alpha intermix)', [...order]);
    }

    fv3Debug('createFolders', 'unraidOrder', JSON.parse(JSON.stringify(unraidOrder)));
    fv3Debug('createFolders', 'order (UI)', JSON.parse(JSON.stringify(order)));
    fv3Debug('createFolders', 'folders', JSON.parse(JSON.stringify(folders)));
    fv3Debug('createFolders', 'containersInfo keys', Object.keys(containersInfo));


    const newOnes = order.filter(x => !unraidOrder.includes(x));
    fv3Debug('createFolders', 'newOnes (containers not in unraidOrder)', newOnes);


    for (let index = 0; index < unraidOrder.length; index++) {
        const element = unraidOrder[index];
        if((folderRegex.test(element) && folders[element.slice(7)])) {
            fv3Debug('createFolders', `Splicing folder ${element} into order at index ${index + newOnes.length}`);
            order.splice(index+newOnes.length, 0, element);
        }
    }
    fv3Debug('createFolders', 'Order after inserting Unraid-ordered folders', [...order]);


    if(window.FV3_DEBUG) {
        // Stash the data payload; the actual download happens on demand (FV3 Debug pill /
        // fv3CaptureDebug('DOCKER')) so env() is collected post-render at click time.
        window.fv3DebugPayloads['DOCKER'] = JSON.stringify({
            version: (await $.get('/plugins/folder.view3/server/version.php').promise()).trim(),
            folders,
            unraidOrder,
            originalOrder: fv3SafeParse(await $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise(), []),
            newOnes,
            order,
            containersInfo: fv3SanitizeContainersInfo(containersInfo),
            cssDebug: await fv3CollectCssDebug()
        });
        fv3Debug('createFolders', 'Debug payload stored for DOCKER; click the FV3 Debug pill to download. Order:', [...order]);
    }

    let foldersDone = {};
    fv3Debug('createFolders', 'Initialized foldersDone', foldersDone);


    if(folderobserver) {
        fv3Debug('createFolders', 'Disconnecting existing folderobserver.');
        folderobserver.disconnect();
        folderobserver = undefined;
    }

    folderobserver = new MutationObserver((mutationList, observer) => {
        fv3Debug('folderobserver', 'Mutation observed', mutationList);
        for (const mutation of mutationList) {
            if(/^load-/.test(mutation.target.id)) {
                fv3Debug('folderobserver', 'Target ID matches /^load-/', mutation.target.id, mutation.target.className);
                $('i#folder-' + mutation.target.id).attr('class', mutation.target.className)
            }
        }
    });
    fv3Debug('createFolders', 'New folderobserver created.');

    fv3Debug('createFolders', 'Dispatching docker-pre-folders-creation event.');
    folderEvents.dispatchEvent(new CustomEvent('docker-pre-folders-creation', {detail: {
        folders: folders,
        order: order,
        containersInfo: containersInfo
    }}));

    fv3Debug('createFolders', 'Starting loop to draw folders in order.');
    for (let key = 0; key < order.length; key++) {
        const container = order[key];
        fv3Debug('createFolders', `Loop iteration: key=${key}, container=${container}`);
        if (container && folderRegex.test(container)) {
            let id = container.replace(folderRegex, '');
            fv3Debug('createFolders', `Is a folder: id=${id}`);
            if (folders[id]) {
                fv3Debug('createFolders', `Folder ${id} exists in folders data. Calling createFolder. Position in order: ${key}`);
                const removedCount = createFolder(folders[id], id, key, order, containersInfo, Object.keys(foldersDone));
                key -= removedCount;
                fv3Debug('createFolders', `createFolder for ${id} returned remBefore=${removedCount}. Adjusted main loop key to ${key}.`);
                foldersDone[id] = folders[id];
                delete folders[id];
                fv3Debug('createFolders', `Folder ${id} moved to foldersDone. Updated foldersDone:`, {...foldersDone}, "Remaining folders:", {...folders});
            } else {
                fv3DebugWarn('createFolders', `Folder ${id} (from order) not found in folders data.`);
            }
        }
    }
    fv3Debug('createFolders', 'Finished loop for ordered folders.');

    fv3Debug('createFolders', 'Starting loop to draw folders outside of order (remaining).');
    for (const [id, value] of Object.entries(folders)) {
        fv3Debug('createFolders', `Processing remaining folder: id=${id}`);
        order.unshift(`folder-${id}`);
        fv3Debug('createFolders', `Unshifted folder-${id} to order. New order:`, [...order]);
        createFolder(value, id, 0, order, containersInfo, Object.keys(foldersDone));
        foldersDone[id] = folders[id];
        delete folders[id];
        fv3Debug('createFolders', `Remaining folder ${id} moved to foldersDone. Updated foldersDone:`, {...foldersDone}, "Remaining folders:", {...folders});
    }
    fv3Debug('createFolders', 'Finished loop for remaining folders.');

    // In alpha-synthesis mode (no manual order), the createFolder() insertion math leaves
    // folders and orphan containers in roughly-but-not-quite alphabetical positions because
    // positionInMainOrder is an index into our synthesized `order`, which doesn't map cleanly
    // to DOM positions when Unraid PHP rendered containers in pure alphabetical order.
    // Final pass: reattach top-level sortable rows in alphabetical order by name.
    if (unraidOrder.length === 0) {
        const $list = $('#docker_list');
        const rows = $list.children('tr.sortable').toArray();
        const nameOf = (el) => $(el).hasClass('folder')
            ? $(el).find('.folder-appname').text().trim()
            : ($(el).find('td.ct-name .appname').text().trim() || ($(el).attr('id') || '').replace('ct-', ''));
        rows.sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true, sensitivity: 'base' }));
        rows.forEach(r => $list.append(r));
        fv3Debug('createFolders', 'alpha-synthesis: re-sorted top-level rows', rows.map(nameOf));
    }

    fv3Debug('createFolders', 'Expanding folders set to expand by default.');
    for (const [id, value] of Object.entries(foldersDone)) {
        if ((globalFolders[id] && globalFolders[id].status.expanded) || value.settings.expand_tab) {
            fv3Debug('createFolders', `Expanding folder ${id} by default.`);
            value.status.expanded = true;
            dropDownButton(id);
        }
    }

    try { $('#docker_list').sortable('refresh'); } catch(e) {}

    fv3Debug('createFolders', 'Dispatching docker-post-folders-creation event.');
    folderEvents.dispatchEvent(new CustomEvent('docker-post-folders-creation', {detail: {
        folders: folders,
        order: order,
        containersInfo: containersInfo
    }}));

    try { fv3InstallDockerTableWidthFix(); } catch(e) { fv3DebugWarn('createFolders', 'WidthFix failed:', e.message); }

    globalFolders = foldersDone;
    fv3Debug('createFolders', 'Assigned foldersDone to globalFolders:', {...globalFolders});

    requestAnimationFrame(() => fv3SyncPreviewHeights('docker_listview_mode'));

    fv3CheckUpdates().then(statuses => {
        if (!statuses || !Object.keys(statuses).length) return;
        fv3Debug('createFolders', 'API update statuses received:', statuses);
        for (const [folderId, folder] of Object.entries(globalFolders)) {
            let folderHasUpdate = false;
            if (!folder.containers) continue;
            for (const containerName of Object.keys(folder.containers)) {
                if (statuses[containerName] === 'UPDATE_AVAILABLE') {
                    folderHasUpdate = true;
                    break;
                }
            }
            if (folderHasUpdate) {
                const $badge = $(`tr.folder-id-${folderId} .folder-update-text`);
                if ($badge.length && !$badge.hasClass('orange-text')) {
                    $badge.removeClass('green-text').addClass('orange-text')
                        .html(`<i class="fa fa-flash fa-fw"></i> ${$.i18n('update-ready')}`);
                    fv3Debug('createFolders', `Folder ${folderId} has update available`);
                }
            }
        }
    });

    fv3SyncOrganizer(globalFolders);

    folderDebugMode = false;

    fv3Debug('createFolders', 'Exit');
};

/**
 * Handles the creation of one folder
 * @param {object} folder the folder
 * @param {string} id if of the folder
 * @param {int} position position to inset the folder
 * @param {Array<string>} order order of containers
 * @param {object} containersInfo info of the containers
 * @param {Array<string>} foldersDone folders that are done
 * @returns {number} the number of element removed before the folder
 */
const createFolder = (folder, id, positionInMainOrder, liveOrderArray, containersInfo, foldersDone) => {
    fv3Debug('createFolder', id, 'Entry', { folder: JSON.parse(JSON.stringify(folder)), id, positionInMainOrder, orderInitialSnapshot: [...liveOrderArray], containersInfoKeys: Object.keys(containersInfo).length, foldersDone: [...foldersDone] });

    const orderSnapshotAtFolderStart = [...liveOrderArray];
    if (FV3_DEBUG && id === "2l2rPNIkZHWN5WLqAuzPaCZHSqI") {
        fv3Debug('createFolder', 'Network folder containers', JSON.parse(JSON.stringify(folder.containers)));
        fv3Debug('createFolder', 'Network folder regex', folder.regex);
        fv3Debug('createFolder', 'Network folder orderSnapshot', [...orderSnapshotAtFolderStart]);
    }

    fv3Debug('createFolder', id, 'Dispatching docker-pre-folder-creation event.');
    folderEvents.dispatchEvent(new CustomEvent('docker-pre-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: positionInMainOrder,
        order: liveOrderArray,
        containersInfo: containersInfo,
        foldersDone: foldersDone
    }}));

    let upToDate = true;
    let started = 0;
    let paused = 0;
    let autostart = 0;
    let autostartStarted = 0;
    let managed = 0;
    let managerTypes = new Set();
    let remBefore = 0;
    fv3Debug('createFolder', id, 'Initialized local state variables', { upToDate, started, paused, autostart, autostartStarted, managed, remBefore });

    const advanced = $.cookie('docker_listview_mode') == 'advanced';
    fv3Debug('createFolder', id, `Advanced view enabled: ${advanced}`);

    const originalContainersFromDefinition = Array.isArray(folder.containers) ? [...folder.containers] : [];
    let combinedContainers = [...originalContainersFromDefinition];
    fv3Debug('createFolder', id, 'Initial containers from definition for combinedContainers:', [...originalContainersFromDefinition]);

    if (folder.regex && typeof folder.regex === 'string' && folder.regex.trim() !== "") {
        fv3Debug('createFolder', id, `Regex defined: '${folder.regex}'. Filtering orderSnapshotAtFolderStart.`);
        try {
            const re = new RegExp(folder.regex);
            const regexMatches = orderSnapshotAtFolderStart.filter(el => containersInfo[el] && re.test(el) && !combinedContainers.includes(el));
            regexMatches.forEach(match => combinedContainers.push(match));
            fv3Debug('createFolder', id, 'Regex matches added:', regexMatches, "Combined containers after regex:", [...combinedContainers]);
        } catch (e) {
            fv3DebugWarn('createFolder', id, `Invalid regex '${folder.regex}':`, e);
        }
    } else {
        if (folder.regex) fv3Debug('createFolder', id, 'regex present but empty/invalid, skipping');
    }

    const labelMatches = orderSnapshotAtFolderStart.filter(el => containersInfo[el]?.Labels?.['folder.view3'] === folder.name && !combinedContainers.includes(el));
    labelMatches.forEach(match => combinedContainers.push(match));

    fv3Debug('createFolder', id, 'label matches', labelMatches);
    fv3Debug('createFolder', id, 'combinedContainers', [...combinedContainers]);

    const colspan = document.querySelector("#docker_containers > thead > tr").childElementCount - 5;
    const fld = `<tr class="sortable folder-id-${id} ${folder.settings.preview_hover ? 'hover' : ''} folder"><td class="ct-name folder-name"><div class="folder-name-sub"><i class="fa fa-arrows-v mover orange-text"></i><span class="outer folder-outer"><span id="${id}" onclick="addDockerFolderContext('${id}')" class="hand folder-hand"><img src="${escapeHtml(folder.icon)}" class="img folder-img" onerror='this.src="/plugins/dynamix.docker.manager/images/question.png"'></span><span class="inner folder-inner"><span class="appname" style="display: none;"><a>folder-${id}</a></span><a class="exec folder-appname" onclick='editFolder("${id}")'>${escapeHtml(folder.name)}</a><br><i id="load-folder-${id}" class="fa fa-square stopped red-text folder-load-status"></i><span class="state folder-state"> ${$.i18n('stopped')}</span></span></span><button class="dropDown-${id} folder-dropdown" onclick="dropDownButton('${id}')" ><i class="fa fa-chevron-down" aria-hidden="true"></i></button></div></td><td class="updatecolumn folder-update"><span class="green-text folder-update-text"><i class="fa fa-check fa-fw"></i> ${$.i18n('up-to-date')}</span><div class="advanced" style="display: ${advanced ? 'block' : 'none'};"><a class="exec" onclick="forceUpdateFolder('${id}');"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i> ${$.i18n('force-update')}</span></a></div></td><td colspan="${colspan}"><div class="folder-storage"></div><div class="folder-preview"></div></td><td class="advanced folder-advanced" ${advanced ? 'style="display: table-cell;"' : ''}><span class="cpu-folder-${id} folder-cpu">0%</span><div class="usage-disk mm folder-load"><span id="cpu-folder-${id}" class="folder-cpu-bar" style="width:0%"></span><span></span></div><br><span class="mem-folder-${id} folder-mem">0 / 0</span></td><td class="folder-autostart"><input type="checkbox" id="folder-${id}-auto" class="autostart" style="display:none"><div style="clear:left"></div></td><td></td></tr>`;
    fv3Debug('createFolder', id, `colspan=${colspan}. Generated folder HTML (fld).`);

    if (positionInMainOrder === 0) {
        fv3Debug('createFolder', id, 'Inserting folder HTML at position 0 (before).');
        $('#docker_list > tr.sortable').eq(0).before($(fld));
    } else {
        if ($('#docker_list > tr.sortable').length > 0 && positionInMainOrder > 0) {
             fv3Debug('createFolder', id, `Inserting folder HTML at position ${positionInMainOrder} (after eq ${positionInMainOrder-1} of current sortables).`);
             $('#docker_list > tr.sortable').eq(positionInMainOrder - 1).after($(fld));
        } else if ($('#docker_list > tr.sortable').length === 0 && positionInMainOrder === 0) {
             fv3Debug('createFolder', id, 'No sortables found, inserting folder at the beginning of #docker_list.');
            $('#docker_list').prepend($(fld));
        } else {
             fv3DebugWarn('createFolder', id, `Could not determine insertion point for folder. Position: ${positionInMainOrder}, Sortables count: ${$('#docker_list > tr.sortable').length}`);
             $('#docker_list').append($(fld));
        }
    }

    // switchButton init deferred until autostart state is known — early init can reset container autostart.
    fv3Debug('createFolder', id, 'switchButton init deferred until autostart state is calculated.');

    if(folder.settings.preview_border) {
        const preview = $(`tr.folder-id-${id} div.folder-preview`);
        if (folder.settings.preview_border_color) {
            if (folder.settings.lock_colors) {
                preview.css('border', `solid ${folder.settings.preview_border_color} 1px`);
            } else {
                preview[0].style.setProperty('--fv3-preview-border-color', folder.settings.preview_border_color);
                preview.css('border', 'solid var(--fv3-preview-border-color) 1px');
            }
        } else {
            preview.css('border', 'solid var(--fv3-preview-border-color) 1px');
        }
        fv3Debug('createFolder', id, `Setting preview border.`);
    }
    $(`tr.folder-id-${id} div.folder-preview`).addClass(`folder-preview-${folder.settings.preview}`);
    fv3Debug('createFolder', id, `Added class folder-preview-${folder.settings.preview} to preview div.`);
    if (folder.settings.preview === 2 && folder.settings.preview_status && folder.settings.preview_status !== 'none') {
        $(`tr.folder-id-${id}`).attr('data-fv3-preview-status', folder.settings.preview_status);
    } else {
        $(`tr.folder-id-${id}`).removeAttr('data-fv3-preview-status');
    }

    let addPreview;
    fv3Debug('createFolder', id, `Selecting addPreview function based on folder.settings.preview = ${folder.settings.preview}. Context setting: ${folder.settings.context}`);
    switch (folder.settings.preview) {
        case 1:
            addPreview = (folderTrId, ctid, autostart) => {
                fv3Debug('addPreview', `case 1: ctid=${ctid}, autostart=${autostart}`);
                let clone = $(`tr.folder-id-${folderTrId} div.folder-storage > tr > td.ct-name > span.outer:last`).clone();
                clone.find(`span.state`)[0].innerHTML = clone.find(`span.state`)[0].innerHTML.split("<br>")[0];
                $(`tr.folder-id-${folderTrId} div.folder-preview`).append(clone.addClass(`${autostart ? 'autostart' : ''}`));
                let tmpId = $(`tr.folder-id-${folderTrId} div.folder-preview > span.outer:last`).find('i[id^="load-"]');
                tmpId.attr("id", "folder-" + tmpId.attr("id"));
                if(folder.settings.context === 2 || folder.settings.context === 0) {
                    tmpId = $(`tr.folder-id-${folderTrId} div.folder-preview > span.outer:last > span.hand`);
                    tmpId.attr("id", "folder-preview-" + ctid);
                    tmpId.removeAttr("onclick");
                    fv3Debug('addPreview', `case 1: Context is ${folder.settings.context}. Modified preview element for tooltipster:`, tmpId);
                    if(folder.settings.context === 2) { return tmpId; }
                }
            }; break;
        case 2:
            addPreview = (folderTrId, ctid, autostart) => {
                fv3Debug('addPreview', `case 2: ctid=${ctid}, autostart=${autostart}`);
                $(`tr.folder-id-${folderTrId} div.folder-preview`).append($(`tr.folder-id-${folderTrId} div.folder-storage > tr > td.ct-name > span.outer > span.hand:last`).clone().addClass(`${autostart ? 'autostart' : ''}`));
                if(folder.settings.context === 2 || folder.settings.context === 0) {
                    let tmpId = $(`tr.folder-id-${folderTrId} div.folder-preview > span.hand:last`);
                    tmpId.attr("id", "folder-preview-" + ctid);
                    tmpId.removeAttr("onclick");
                    fv3Debug('addPreview', `case 2: Context is ${folder.settings.context}. Modified preview element for tooltipster:`, tmpId);
                    if(folder.settings.context === 2) { return tmpId; }
                }
            }; break;
        case 3:
            addPreview = (folderTrId, ctid, autostart) => {
                fv3Debug('addPreview', `case 3: ctid=${ctid}, autostart=${autostart}`);
                let clone = $(`tr.folder-id-${folderTrId} div.folder-storage > tr > td.ct-name > span.outer > span.inner:last`).clone();
                clone.find(`span.state`)[0].innerHTML = clone.find(`span.state`)[0].innerHTML.split("<br>")[0];
                $(`tr.folder-id-${folderTrId} div.folder-preview`).append(clone.addClass(`${autostart ? 'autostart' : ''}`));
                let tmpId = $(`tr.folder-id-${folderTrId} div.folder-preview > span.inner:last`).find('i[id^="load-"]');
                tmpId.attr("id", "folder-" + tmpId.attr("id"));
                if(folder.settings.context === 2 || folder.settings.context === 0) {
                    tmpId = $(`tr.folder-id-${folderTrId} div.folder-preview > span.inner:last > span.appname > a.exec`);
                    tmpId.attr("id", "folder-preview-" + ctid);
                    tmpId.removeAttr("onclick");
                    fv3Debug('addPreview', `case 3: Context is ${folder.settings.context}. Modified preview element for tooltipster:`, tmpId);
                    if(folder.settings.context === 2) { return tmpId; }
                }
            }; break;
        case 4:
            addPreview = (folderTrId, ctid, autostart) => {
                fv3Debug('addPreview', `case 4: ctid=${ctid}, autostart=${autostart}`);
                let lstSpan = $(`tr.folder-id-${folderTrId} div.folder-preview > span.outer:last`);
                if(!lstSpan[0] || lstSpan.children().length >= 2) {
                    $(`tr.folder-id-${folderTrId} div.folder-preview`).append($('<span class="outer"></span>'));
                    lstSpan = $(`tr.folder-id-${folderTrId} div.folder-preview > span.outer:last`);
                }
                lstSpan.append($('<span class="inner"></span>'));
                lstSpan.children('span.inner:last').append($(`tr.folder-id-${folderTrId} div.folder-storage > tr > td.ct-name > span.outer > span.inner > span.appname:last`).clone().addClass(`${autostart ? 'autostart' : ''}`));
                if(folder.settings.context === 2 || folder.settings.context === 0) {
                    let tmpId = $(`tr.folder-id-${folderTrId} div.folder-preview span.inner:last > span.appname > a.exec`);
                    tmpId.attr("id", "folder-preview-" + ctid);
                    tmpId.removeAttr("onclick");
                    fv3Debug('addPreview', `case 4: Context is ${folder.settings.context}. Modified preview element for tooltipster:`, tmpId);
                    if(folder.settings.context === 2) {
                        return tmpId.length>0 ? tmpId : $(`tr.folder-id-${folderTrId} div.folder-preview span.inner:last > span.appname`).attr("id", "folder-preview-" + ctid);
                    }
                }
            }; break;
        default:
            fv3Debug('createFolder', id, 'Default case for addPreview (no preview).');
            addPreview = () => { };
            break;
    }

    let newFolder = {};
    fv3Debug('createFolder', id, 'Initialized newFolder for processed containers.');

    const mappedFoldersDone = foldersDone.map(e => 'folder-'+e);
    const cutomOrder = orderSnapshotAtFolderStart.filter((e) => {
        return e && (mappedFoldersDone.includes(e) || !(folderRegex.test(e) && e !== `folder-${id}`));
    });
    fv3Debug('createFolder', id, '(Informational) Filtered cutomOrder based on orderSnapshotAtFolderStart:', [...cutomOrder]);


    fv3Debug('createFolder', id, `Starting loop to process ${combinedContainers.length} combinedContainers.`);
    for (const container_name_in_folder of combinedContainers) {

        const ct = containersInfo[container_name_in_folder];
        if (!ct) {
            fv3DebugWarn('createFolder', id, `CRITICAL - Container info for '${container_name_in_folder}' not found in containersInfo! Skipping further processing for this container.`);
            continue;
        }
        const indexInCustomOrder = cutomOrder.indexOf(container_name_in_folder);
        const indexInLiveOrderArray = liveOrderArray.indexOf(container_name_in_folder);

        fv3Debug('createFolder', id, `Processing container from combinedContainers: ${container_name_in_folder}`);

        const originalIndexOfContainerInSnapshot = orderSnapshotAtFolderStart.indexOf(container_name_in_folder);
        fv3Debug('createFolder', id, container_name_in_folder, `originalIndexOfContainerInSnapshot=${originalIndexOfContainerInSnapshot}, folder's positionInMainOrder=${positionInMainOrder}`);

        if (originalIndexOfContainerInSnapshot !== -1 && originalIndexOfContainerInSnapshot < positionInMainOrder) {
            remBefore++;
            fv3Debug('createFolder', id, container_name_in_folder, `Original index ${originalIndexOfContainerInSnapshot} < folder position ${positionInMainOrder}. Incremented remBefore to ${remBefore}.`);
        }

        let $containerTR = $(document.getElementById(`ct-${container_name_in_folder}`));
        if (!$containerTR.length || !$containerTR.hasClass('sortable')) {
            fv3Debug('createFolder', id, container_name_in_folder, 'TR not found, fallback search');
            $containerTR = $("#docker_list > tr.sortable").filter(function() {
                return $(this).find("td.ct-name .appname").text().trim() === container_name_in_folder;
            }).first();
        }

        if ($containerTR.length) {
            fv3Debug('createFolder', id, container_name_in_folder, 'Found its TR element in the main list.');

            folderEvents.dispatchEvent(new CustomEvent('docker-pre-folder-preview', {detail: {
                folder: folder,
                id: id,
                position: positionInMainOrder,
                order: liveOrderArray,
                containersInfo: containersInfo,
                foldersDone: foldersDone,
                container: container_name_in_folder,
                ct: ct,
                index: indexInCustomOrder,
                offsetIndex: indexInLiveOrderArray
            }}));

            $(`tr.folder-id-${id} div.folder-storage`).append(
                $containerTR.addClass(`folder-${id}-element folder-element`).removeClass('sortable ui-sortable-handle')
            );
            $containerTR.find('input:not([name]):not([id])').each(function() {
                $(this).attr('name', `fv3-${$(this).attr('class') || 'input'}-${ct.info.Name}`);
            });
            fv3Debug('createFolder', id, container_name_in_folder, 'Moved TR to folder storage.');

            const currentIndexInLiveList = liveOrderArray.indexOf(container_name_in_folder);
            if (currentIndexInLiveList !== -1) {
                liveOrderArray.splice(currentIndexInLiveList, 1);
                fv3Debug('createFolder', id, container_name_in_folder, `Spliced from liveOrderArray. New liveOrderArray length: ${liveOrderArray.length}`);
            } else {
                fv3DebugWarn('createFolder', id, `Container ${container_name_in_folder} was MOVED FROM DOM but NOT FOUND IN liveOrderArray for splicing. This might indicate it was already spliced by a previous folder or logic error.`);
            }

            fv3Debug('createFolder', id, container_name_in_folder, 'Container info (ct):', JSON.parse(JSON.stringify(ct)));

            const isHiddenFromPreview = (folder.hidden_preview || []).includes(container_name_in_folder);
            const tooltip_trigger_element = isHiddenFromPreview ? null : addPreview(id, ct.shortId, !(ct.info.State.Autostart === false));
            fv3Debug('createFolder', id, ct.shortId, `Called addPreview (hidden: ${isHiddenFromPreview}). Returned tooltip_trigger_element:`, tooltip_trigger_element ? tooltip_trigger_element[0] : 'null/undefined');

            $(`tr.folder-id-${id} div.folder-preview span.inner > span.appname`).css("width", folder.settings.preview_text_width || '');
            if (folder.settings.preview_text_width) fv3Debug('createFolder', id, `preview text width: ${folder.settings.preview_text_width}`);

            if (tooltip_trigger_element && tooltip_trigger_element.length > 0) {
                fv3AttachAdvancedPreview({
                    triggerEl: tooltip_trigger_element,
                    ct,
                    folder,
                    id,
                    container_name_in_folder,
                    cpus
                });
            } else {
                fv3DebugWarn('createFolder', id, ct.shortId, 'tooltip_trigger_element is NOT valid. Tooltipster NOT initialized.');
            }

            newFolder[container_name_in_folder] = {
                id: ct.shortId,
                fullId: ct.Id,
                pause: ct.info.State.Paused,
                state: ct.info.State.Running,
                update: ct.info.State.Updated === false && ct.info.State.manager === 'dockerman',
                managed: ct.info.State.manager === 'dockerman',
                manager: ct.info.State.manager
            };
            fv3Debug('createFolder', id, container_name_in_folder, 'Stored in newFolder:', JSON.parse(JSON.stringify(newFolder[container_name_in_folder])));

            if (!isHiddenFromPreview) {
                const elementForPreviewOpts = $(`tr.folder-id-${id} div.folder-preview > span:last`);
                fv3Debug('createFolder', id, container_name_in_folder, 'Preview element for options:', elementForPreviewOpts[0]);
                let sel_preview_opt;
                fv3Debug('createFolder', id, container_name_in_folder, 'Applying preview options based on folder.settings:', JSON.parse(JSON.stringify(folder.settings)));

                const $previewElementTarget = $(`tr.folder-id-${id} div.folder-preview > span:last`);
                let $targetForAppend;

                if (folder.settings.preview_grayscale) {
                    let $imgToGrayscale = $previewElementTarget.children('span.hand').children('img.img');
                    if (!$imgToGrayscale.length) {
                        $imgToGrayscale = $previewElementTarget.children('img.img');
                    }
                    if ($imgToGrayscale.length) {
                        $imgToGrayscale.css('filter', 'grayscale(100%)');
                        fv3Debug('createFolder', id, container_name_in_folder, 'Applied grayscale to preview image.');
                    } else {
                        fv3DebugWarn('createFolder', id, container_name_in_folder, 'Grayscale: Could not find image in preview element.');
                    }
                }

                if (folder.settings.preview_update && ct.info.State.Updated === false && ct.info.State.manager === "dockerman") {
                    let $appNameSpan = $previewElementTarget.children('span.inner').children('span.appname');
                    if (!$appNameSpan.length) {
                        $appNameSpan = $previewElementTarget.children('span.appname');
                    }
                    if ($appNameSpan.length) {
                        $appNameSpan.addClass('orange-text');
                        $appNameSpan.children('a.exec').addClass('orange-text');
                        fv3Debug('createFolder', id, container_name_in_folder, 'Applied orange-text for update status to preview appname.');
                    } else {
                         fv3DebugWarn('createFolder', id, container_name_in_folder, 'Update style: Could not find appname span in preview element.');
                    }
                }

                $targetForAppend = $previewElementTarget.children('span.inner').last();
                if (!$targetForAppend.length) {
                    $targetForAppend = $previewElementTarget;
                }

                if (folder.settings.preview_webui && ct.info.State.WebUi) {
                    if ($targetForAppend.length) {
                        $targetForAppend.append($(`<span class="folder-element-custom-btn folder-element-webui"><a href="${escapeHtml(ct.info.State.WebUi)}" target="_blank"><i class="fa fa-globe" aria-hidden="true"></i></a></span>`));
                        fv3Debug('createFolder', id, container_name_in_folder, 'Appended WebUI icon to preview.');
                    } else {
                         fv3DebugWarn('createFolder', id, container_name_in_folder, 'WebUI icon: Could not find target for append in preview element.');
                    }
                }

                if (folder.settings.preview_console) {
                    if ($targetForAppend.length) {
                        $targetForAppend.append($(`<span class="folder-element-custom-btn folder-element-console"><a href="#" onclick="event.preventDefault(); openTerminal('docker', '${escapeHtml(ct.info.Name)}', '${escapeHtml(ct.info.Shell)}');"><i class="fa fa-terminal" aria-hidden="true"></i></a></span>`));
                        fv3Debug('createFolder', id, container_name_in_folder, 'Appended Console icon to preview.');
                    } else {
                         fv3DebugWarn('createFolder', id, container_name_in_folder, 'Console icon: Could not find target for append in preview element.');
                    }
                }

                if (folder.settings.preview_logs) {
                    if ($targetForAppend.length) {
                        $targetForAppend.append($(`<span class="folder-element-custom-btn folder-element-logs"><a href="#" onclick="event.preventDefault(); openTerminal('docker', '${escapeHtml(ct.info.Name)}', '.log');"><i class="fa fa-bars" aria-hidden="true"></i></a></span>`));
                        fv3Debug('createFolder', id, container_name_in_folder, 'Appended Logs icon to preview.');
                    } else {
                        fv3DebugWarn('createFolder', id, container_name_in_folder, 'Logs icon: Could not find target for append in preview element.');
                    }
                }

                $previewElementTarget.attr('data-fv3-state', ct.info.State.Running ? 'running' : 'stopped');
                if (folder.settings.preview === 2) {
                    const fv3StatusIconCls = ct.info.State.Running
                        ? 'fa fa-play started green-text fv3-status-icon'
                        : 'fa fa-square stopped red-text fv3-status-icon';
                    if ($targetForAppend.length) {
                        $targetForAppend.append('<br class="fv3-status-line">');
                        $targetForAppend.append(`<i class="${fv3StatusIconCls}" aria-hidden="true"></i>`);
                    }
                }
            }

            upToDate = upToDate && !newFolder[container_name_in_folder].update;
            started += newFolder[container_name_in_folder].state ? 1 : 0;
            paused += newFolder[container_name_in_folder].pause ? 1 : 0;
            const isDockerMan = ct.info.State.manager === 'dockerman';
            autostart += (isDockerMan && !(ct.info.State.Autostart === false)) ? 1 : 0;
            autostartStarted += (isDockerMan && !(ct.info.State.Autostart === false) && newFolder[container_name_in_folder].state) ? 1 : 0;
            managed += newFolder[container_name_in_folder].managed ? 1 : 0;
            managerTypes.add(ct.info.State.manager);
            fv3Debug('createFolder', id, container_name_in_folder, 'Updated folder aggregate states:', { upToDate, started, paused, autostart, autostartStarted, managed, managerTypes: Array.from(managerTypes) });
            folderEvents.dispatchEvent(new CustomEvent('docker-post-folder-preview', {detail: {
                folder: folder,
                id: id,
                position: positionInMainOrder,
                order: liveOrderArray,
                containersInfo: containersInfo,
                foldersDone: foldersDone,
                container: container_name_in_folder,
                ct: ct,
                index: indexInCustomOrder,
                offsetIndex: indexInLiveOrderArray,
                states: {
                    upToDate,
                    started,
                    autostart,
                    autostartStarted,
                    managed
                }
            }}));
        } else {
            fv3DebugWarn('createFolder', id, `Container TR for '${container_name_in_folder}' NOT FOUND in the sortable list. It might have been moved by another folder or an error occurred. Skipping.`);
        }
    }
    fv3Debug('createFolder', id, `Finished loop over combinedContainers. Final remBefore for this folder = ${remBefore}`);

    $(`.folder-${id}-element:last`).css('border-bottom', '1px solid rgba(128, 128, 128, 0.3)');
    fv3Debug('createFolder', id, `Set border-bottom on last .folder-${id}-element.`);
    folder.containers = newFolder;
    fv3Debug('createFolder', id, 'Replaced folder.containers with newFolder:', JSON.parse(JSON.stringify(newFolder)));

    $(`tr.folder-id-${id} div.folder-storage span.outer`).get().forEach((e) => {
        folderobserver.observe(e, folderobserverConfig);
    });
    fv3Debug('createFolder', id, 'Attached folderobserver to .folder-storage span.outer elements.');
    $(`tr.folder-id-${id} div.folder-preview > span`).wrap('<div class="folder-preview-wrapper"></div>');
    fv3Debug('createFolder', id, 'Wrapped preview spans with .folder-preview-wrapper.');
    fv3SetupPreviewMode(folder, id, globalFolders);
    if(folder.settings.preview_vertical_bars) {
        const barsColor = folder.settings.preview_vertical_bars_color || folder.settings.preview_border_color || '';
        let barStyle = '';
        if (barsColor && folder.settings.lock_colors) {
            barStyle = `border-color: ${barsColor};`;
        } else if (barsColor) {
            barStyle = `--fv3-vertical-bars-color: ${barsColor};`;
        }
        $(`tr.folder-id-${id} div.folder-preview > div`).not(':last').after(`<div class="folder-preview-divider" style="${barStyle}"></div>`);
        fv3Debug('createFolder', id, 'Added preview_vertical_bars.');
    }
    if(folder.settings.update_column) {
        $(`tr.folder-id-${id} > td.updatecolumn`).next().attr('colspan',6).end().remove();
        fv3Debug('createFolder', id, 'Handled update_column setting (removed column).');
    }
    if(managed === 0) {
        $(`tr.folder-id-${id} > td.updatecolumn > div.advanced`).remove();
        fv3Debug('createFolder', id, 'No managed containers, removed advanced update div.');
    }

    fv3Debug('createFolder', id, 'Setting folder status indicators based on aggregate states. managerTypes:', Array.from(managerTypes));
    const hasDockerMan = managerTypes.has('dockerman');
    const hasCompose = managerTypes.has('composeman');
    const has3rdParty = [...managerTypes].some(t => t !== 'dockerman' && t !== 'composeman');

    if (!hasDockerMan && hasCompose && has3rdParty) {
        $(`tr.folder-id-${id} > td.updatecolumn > span`).replaceWith(
            $(`<span class="folder-update-text" style="white-space:nowrap;"><i class="fa fa-docker fa-fw"></i> ${$.i18n('compose')}</span><br><span class="folder-update-text" style="white-space:nowrap;"><i class="fa fa-docker fa-fw"></i> ${$.i18n('third-party')}</span>`)
        );
        fv3Debug('createFolder', id, 'Set stacked compose + 3rd party labels in update column.');
    } else if (!hasDockerMan && hasCompose) {
        $(`tr.folder-id-${id} > td.updatecolumn > span`).replaceWith(
            $(`<span class="folder-update-text" style="white-space:nowrap;"><i class="fa fa-docker fa-fw"></i> ${$.i18n('compose')}</span>`)
        );
        fv3Debug('createFolder', id, 'Set compose label in update column.');
    } else if (!hasDockerMan && managerTypes.size > 0) {
        $(`tr.folder-id-${id} > td.updatecolumn > span`).replaceWith(
            $(`<span class="folder-update-text" style="white-space:nowrap;"><i class="fa fa-docker fa-fw"></i> ${$.i18n('third-party')}</span>`)
        );
        fv3Debug('createFolder', id, 'Set 3rd party label in update column.');
    } else if (!upToDate) {
        $(`tr.folder-id-${id} > td.updatecolumn > span`).replaceWith($(`<div class="advanced" style="display: ${advanced ? 'block' : 'none'};"><span class="orange-text folder-update-text" style="white-space:nowrap;"><i class="fa fa-flash fa-fw"></i> ${$.i18n('update-ready')}</span></div>`));
        $(`tr.folder-id-${id} > td.updatecolumn > div.advanced:has(a)`).remove();
        $(`tr.folder-id-${id} > td.updatecolumn`).append($(`<a class="exec" onclick="updateFolder('${id}');"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i> ${$.i18n('apply-update')}</span></a>`));
        fv3Debug('createFolder', id, 'Set update ready status in update column.');
        if (folder.settings && folder.settings.preview_update_folder) {
            $(`tr.folder-id-${id} a.folder-appname`).addClass('orange-text');
            fv3Debug('createFolder', id, 'Applied orange-text to folder name (preview_update_folder).');
        }
    }
    if (started) {
        const allPaused = paused > 0 && paused === started;
        const iconCls = allPaused
            ? 'fa fa-pause started orange-text folder-load-status'
            : 'fa fa-play started green-text folder-load-status';
        const stateKey = allPaused ? 'paused' : 'started';
        $(`tr.folder-id-${id} i#load-folder-${id}`).attr('class', iconCls);
        $(`tr.folder-id-${id} span.folder-state`).text(`${started}/${Object.entries(folder.containers).length} ${$.i18n(stateKey)}`);
        fv3Debug('createFolder', id, `Set '${stateKey}' status. Count: ${started}/${Object.entries(folder.containers).length}, paused: ${paused}.`);
    }
    if (!managerTypes.has('dockerman')) {
        $(`tr.folder-id-${id} td.folder-autostart`).empty();
        fv3Debug('createFolder', id, 'No dockerman containers — removed autostart toggle.');
    } else {
        const folderHasAutostart = autostart > 0;
        $(`#folder-${id}-auto`).switchButton({ labels_placement: 'right', off_label: $.i18n('off'), on_label: $.i18n('on'), checked: folderHasAutostart });
        fv3Debug('createFolder', id, `Initialized autostart switchButton with checked=${folderHasAutostart}. Autostart count: ${autostart}`);
        $(`#folder-${id}-auto`).off("change", folderAutostart).on("change", folderAutostart);
        fv3Debug('createFolder', id, 'Attached change event to folder autostart switch.');
    }

    if(autostart === 0) { $(`tr.folder-id-${id}`).addClass('no-autostart'); }
    else if (autostart > 0 && autostartStarted === 0) { $(`tr.folder-id-${id}`).addClass('autostart-off'); }
    else if (autostart > 0 && autostartStarted > 0 && autostart !== autostartStarted) { $(`tr.folder-id-${id}`).addClass('autostart-partial'); }
    else if (autostart > 0 && autostartStarted > 0 && autostart === autostartStarted) { $(`tr.folder-id-${id}`).addClass('autostart-full'); }
    fv3Debug('createFolder', id, `Applied autostart status class. Autostart: ${autostart}, AutostartStarted: ${autostartStarted}.`);

    if(managed === 0) { $(`tr.folder-id-${id}`).addClass('no-managed'); }
    else if (managed > 0 && managed < Object.values(folder.containers).length) { $(`tr.folder-id-${id}`).addClass('managed-partial'); }
    else if (managed > 0 && managed === Object.values(folder.containers).length) { $(`tr.folder-id-${id}`).addClass('managed-full'); }
    fv3Debug('createFolder', id, `Applied managed status class. Managed: ${managed}, Total: ${Object.values(folder.containers).length}.`);

    folder.status = { upToDate, started, paused, autostart, autostartStarted, managed, managerTypes: Array.from(managerTypes), expanded: false };
    fv3Debug('createFolder', id, 'Set final folder.status object:', JSON.parse(JSON.stringify(folder.status)));
    fv3Debug('createFolder', id, 'Dispatching docker-post-folder-creation event.');
    folderEvents.dispatchEvent(new CustomEvent('docker-post-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: positionInMainOrder,
        order: liveOrderArray,
        containersInfo: containersInfo,
        foldersDone: foldersDone
    }}));

    fv3Debug('createFolder', id, `Exit. Returning remBefore = ${remBefore}`);
    return remBefore;
};

// hideAllTips() and advancedAutostart() moved to advanced-preview.js (window globals)

/**
 * Hanled the click of the autostart button and changes the container to reflect the status of the folder
 * @param {*} el element passed by the event caller
 */
const folderAutostart = async (el) => {
    fv3Debug('folderAutostart', 'Entry. Event target:', el.target);
    const status = el.target.checked;
    const id = el.target.id.split('-')[1];
    fv3Debug('folderAutostart', `Folder ID: ${id}, New Status: ${status}`);
    const containers = $(`.folder-${id}-element`);
    fv3Debug('folderAutostart', `Found ${containers.length} containers in folder ${id}.`);
    for (const container of containers) {
        const switchTd = $(container).children('td.advanced').next();
        const containerAutostartCheckbox = $(switchTd).find('input.autostart')[0];
        if (containerAutostartCheckbox) {
            const cstatus = containerAutostartCheckbox.checked;
            fv3Debug('folderAutostart', `Container ${$(container).find('.appname a').text().trim() || 'N/A'}: current autostart=${cstatus}. Folder target status=${status}`);
            if (status !== cstatus) {
                fv3Debug('folderAutostart', 'Clicking autostart switch for container.');
                $(switchTd).children('.switch-button-background').click();
                await new Promise(resolve => {
                    const timeout = setTimeout(resolve, 3000);
                    $(document).one('ajaxComplete', () => { clearTimeout(timeout); resolve(); });
                });
            }
        } else {
            fv3DebugWarn('folderAutostart', `Could not find autostart checkbox for a container in folder ${id}. TD element:`, switchTd[0]);
        }
    }
    fv3Debug('folderAutostart', id, 'Exit.');
};

// Folder controls (dropdown, autostart, edit, remove, force-update)
const dropDownButton = (id) => fv3DropDownButton('docker', globalFolders, id);
const rmFolder = (id) => fv3RmFolder('docker', globalFolders, loadlist, id);
const editFolder = (id) => fv3EditFolder('docker', '/Docker/Folder', id);

/**
 * Force update all the containers inside a folder
 * @param {string} id the id of the folder
 */
const forceUpdateFolder = (id) => {
    fv3Debug('forceUpdateFolder', id, 'Entry.');
    hideAllTips();
    const folder = globalFolders[id];
    fv3Debug('forceUpdateFolder', id, 'Folder data:', {...folder});
    const containersToUpdate = Object.entries(folder.containers).filter(([k, v]) => v.managed).map(e => e[0]).join('*');
    fv3Debug('forceUpdateFolder', id, `Containers to force update: ${containersToUpdate}. Calling openDocker.`);
    openDocker('update_container ' + containersToUpdate, $.i18n('updating', folder.name),'','loadlist');
};

/**
 * Update all the updatable containers inside a folder
 * @param {string} id the id of the folder
 */
const updateFolder = (id) => {
    fv3Debug('updateFolder', id, 'Entry.');
    hideAllTips();
    const folder = globalFolders[id];
    fv3Debug('updateFolder', id, 'Folder data:', {...folder});
    const containersToUpdate = Object.entries(folder.containers).filter(([k, v]) => v.managed && v.update).map(e => e[0]).join('*');
    fv3Debug('updateFolder', id, `Containers to update (ready): ${containersToUpdate}. Calling openDocker.`);
    openDocker('update_container ' + containersToUpdate, $.i18n('updating', folder.name),'','loadlist');
};

/**
 * Perform an action for the entire folder
 * @param {string} id The id of the folder
 * @param {string} action the desired action
 */
// Bulk folder actions (start/stop/restart all containers in folder)
const actionFolder = async (id, action) => {
    fv3Debug('actionFolder', id, action, 'Entry.');
    const folder = globalFolders[id];
    if (!folder || !folder.containers) {
        fv3DebugWarn('actionFolder', id, 'Folder or folder.containers not found in globalFolders.');
        $('div.spinner.fixed').hide('slow');
        return;
    }
    const cts = Object.keys(folder.containers);
    let proms = [];
    let errors;

    fv3Debug('actionFolder', id, 'Folder data:', {...folder}, "Containers to act on:", cts);

    $(`i#load-folder-${id}`).removeClass('fa-play fa-square fa-pause').addClass('fa-refresh fa-spin');
    $('div.spinner.fixed').show('slow');

    for (let index = 0; index < cts.length; index++) {
        const containerName = cts[index];
        const ct = folder.containers[containerName];
        if (!ct) {
            fv3DebugWarn('actionFolder', id, `Container data for '${containerName}' not found in folder.containers.`);
            continue;
        }
        const cid = ct.id;
        const fullCid = ct.fullId;
        let pass = false;
        fv3Debug('actionFolder', id, `Processing container ${containerName} (cid: ${cid}). State: ${ct.state}, Paused: ${ct.pause}.`);
        switch (action) {
            case "start":
                pass = !ct.state;
                break;
            case "stop":
                pass = ct.state;
                break;
            case "pause":
                pass = ct.state && !ct.pause;
                break;
            case "resume":
                pass = ct.state && ct.pause;
                break;
            case "restart":
                pass = ct.state;
                break;
            default:
                pass = false;
                fv3DebugWarn('actionFolder', id, `Unknown action '${action}'.`);
                break;
        }
        fv3Debug('actionFolder', id, `Container ${containerName} - action '${action}', pass condition: ${pass}.`);
        if(pass) {
            fv3Debug('actionFolder', id, `Pushing POST request for container ${cid}, action ${action}.`);
            proms.push(fv3DockerAction(action, cid, fullCid));
        }
    }

    fv3Debug('actionFolder', id, `Awaiting ${proms.length} promises.`);
    const results = await Promise.all(proms);
    fv3Debug('actionFolder', id, 'Promises resolved. Results:', results);

    errors = results.filter(e => e.success !== true);
    fv3Debug('actionFolder', id, 'Filtered errors:', errors);

    if(errors.length > 0) {
        const errorMessages = errors.map(e => escapeHtml(e.text || JSON.stringify(e)));
        fv3DebugWarn('actionFolder', id, 'Execution errors occurred:', errorMessages);
        swal({
            title: $.i18n('exec-error'),
            text:errorMessages.join('<br>'),
            type:'error',
            html:true,
            confirmButtonText:'Ok'
        }, loadlist);
    } else {
        fv3Debug('actionFolder', id, 'No errors. Reloading list.');
        loadlist();
    }
    $('div.spinner.fixed').hide('slow');
    fv3Debug('actionFolder', id, 'Exit.');
};

/**
 * Execute the desired custom action
 * @param {string} id
 * @param {number} actionIndex
 */
// Custom user-defined action runner
const folderCustomAction = async (id, actionIndex) => {
    fv3Debug('folderCustomAction', id, 'Entry.');
    $('div.spinner.fixed').show('slow');
    const folder = globalFolders[id];
    if (!folder || !folder.actions || !folder.actions[actionIndex]) {
        fv3DebugWarn('folderCustomAction', `Folder or action definition not found for id ${id}, actionIndex ${actionIndex}.`);
        $('div.spinner.fixed').hide('slow');
        loadlist();
        return;
    }
    let act = folder.actions[actionIndex];
    fv3Debug('folderCustomAction', id, 'Action details:', {...act});
    let prom = [];

    if(act.type === 0) {
        fv3Debug('folderCustomAction', id, 'Action type 0 (Standard Docker).');
        const cts = act.conatiners.map(name => folder.containers[name]).filter(e => e);
        fv3Debug('folderCustomAction', id, 'Targeted containers data:', [...cts]);

        let ctAction = (e) => {};
        if(act.action === 0) {
            fv3Debug('folderCustomAction', id, `Standard action type 0 (Cycle). Mode: ${act.modes}.`);
            if(act.modes === 0) {
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Cycle Start-Stop: State: ${e_ct.state}`);
                    if(e_ct.state) {
                        prom.push(fv3DockerAction('stop', e_ct.id, e_ct.fullId));
                    } else {
                        prom.push(fv3DockerAction('start', e_ct.id, e_ct.fullId));
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Cycle Pause-Resume: State: ${e_ct.state}, Paused: ${e_ct.pause}`);
                    if(e_ct.state) {
                        if(e_ct.pause) {
                            prom.push(fv3DockerAction('resume', e_ct.id, e_ct.fullId));
                        } else {
                            prom.push(fv3DockerAction('pause', e_ct.id, e_ct.fullId));
                        }
                    }
                };
            }
        } else if(act.action === 1) {
            fv3Debug('folderCustomAction', id, `Standard action type 1 (Set). Mode: ${act.modes}.`);
            if(act.modes === 0) {
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Set Start: State: ${e_ct.state}`);
                    if(!e_ct.state) { prom.push(fv3DockerAction('start', e_ct.id, e_ct.fullId)); }
                };
            } else if(act.modes === 1) {
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Set Stop: State: ${e_ct.state}`);
                    if(e_ct.state) { prom.push(fv3DockerAction('stop', e_ct.id, e_ct.fullId)); }
                };
            } else if(act.modes === 2) {
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Set Pause: State: ${e_ct.state}, Paused: ${e_ct.pause}`);
                    if(e_ct.state && !e_ct.pause) { prom.push(fv3DockerAction('pause', e_ct.id, e_ct.fullId)); }
                };
            } else if(act.modes === 3) {
                ctAction = (e_ct) => {
                     fv3Debug('customAction', e_ct.id, `Set Resume: State: ${e_ct.state}, Paused: ${e_ct.pause}`);
                    if(e_ct.state && e_ct.pause) { prom.push(fv3DockerAction('resume', e_ct.id, e_ct.fullId)); }
                };
            }
        } else if(act.action === 2) {
            fv3Debug('folderCustomAction', id, 'Standard action type 2 (Restart).');
            ctAction = (e_ct) => {
                fv3Debug('customAction', e_ct.id, `restart: State: ${e_ct.state}`);
                if(e_ct.state) {
                    prom.push(fv3DockerAction('restart', e_ct.id, e_ct.fullId));
                }
            };
        }
        cts.forEach((e_ct_data) => {
            fv3Debug('folderCustomAction', id, 'Applying defined ctAction to container data:', e_ct_data);
            ctAction(e_ct_data);
        });
        fv3Debug('folderCustomAction', id, `Pushed ${prom.length} standard actions to promise array.`);

    } else if(act.type === 1) {
        await fv3RunUserScript(act, prom);
    }

    fv3Debug('folderCustomAction', id, `Awaiting ${prom.length} promises for custom action.`);
    await Promise.all(prom);
    fv3Debug('folderCustomAction', id, 'All promises resolved. Reloading list.');

    loadlist();
    $('div.spinner.fixed').hide('slow');
    fv3Debug('folderCustomAction', id, 'Exit.');
};


/**
 * Atach the menu when clicking the folder icon
 * @param {string} id the id of the folder
 */
// Folder context menu
const addDockerFolderContext = (id) => {
    fv3Debug('addDockerFolderContext', id, 'Entry.');
    let opts = [];

    context.settings({
        right: false,
        above: false
    });
    fv3Debug('addDockerFolderContext', id, 'Context menu settings configured.');

    if (!globalFolders[id]) {
        fv3DebugWarn('addDockerFolderContext', id, 'Folder data not found in globalFolders. Aborting context menu.');
        return;
    }
    const folderData = globalFolders[id];
    fv3Debug('addDockerFolderContext', id, 'Folder data:', {...folderData});


    if (folderData.settings.folder_webui && folderData.settings.folder_webui_url) {
        opts.push({
            text: $.i18n('webui'),
            icon: 'fa-globe',
            action: (evt) => { evt.preventDefault(); window.open(folderData.settings.folder_webui_url, '_blank'); }
        });
        opts.push({ divider: true });
    }

    if(folderData.settings.override_default_actions && folderData.actions && folderData.actions.length) {
        fv3Debug('addDockerFolderContext', id, `Overriding default actions with ${folderData.actions.length} custom actions.`);
        opts.push(
            ...folderData.actions.map((e, i) => {
                return {
                    text: escapeHtml(e.name),
                    icon: e.script_icon || "fa-bolt",
                    action: (evt) => { evt.preventDefault(); folderCustomAction(id, i); }
                }
            })
        );
        opts.push({ divider: true });
    } else if(!folderData.settings.default_action) {
        fv3Debug('addDockerFolderContext', id, 'Adding default action menu items.');
        const _cts = Object.values(folderData.containers || {});
        const _total = _cts.length;
        const _running = _cts.filter(c => c.state).length;
        const _paused = _cts.filter(c => c.state && c.pause).length;
        const _stopped = _total - _running;
        const _runningNotPaused = _running - _paused;
        let _added = false;
        if (_stopped > 0) {
            opts.push({
                text: $.i18n('start'),
                icon: 'fa-play',
                action: (evt) => { evt.preventDefault(); actionFolder(id, "start"); }
            });
            _added = true;
        }
        if (_running > 0) {
            opts.push({
                text: $.i18n('stop'),
                icon: 'fa-stop',
                action: (evt) => { evt.preventDefault(); actionFolder(id, "stop"); }
            });
            _added = true;
        }
        if (_runningNotPaused > 0) {
            opts.push({
                text: $.i18n('pause'),
                icon: 'fa-pause',
                action: (evt) => { evt.preventDefault(); actionFolder(id, "pause"); }
            });
            _added = true;
        }
        if (_paused > 0) {
            opts.push({
                text: $.i18n('resume'),
                icon: 'fa-play-circle',
                action: (evt) => { evt.preventDefault(); actionFolder(id, "resume"); }
            });
            _added = true;
        }
        if (_running > 0) {
            opts.push({
                text: $.i18n('restart'),
                icon: 'fa-refresh',
                action: (evt) => { evt.preventDefault(); actionFolder(id, "restart"); }
            });
            _added = true;
        }
        if (_added) opts.push({ divider: true });
    }

    if(folderData.status.managed > 0) {
        fv3Debug('addDockerFolderContext', id, 'Folder has managed containers. Adding update options.');
        if(!folderData.status.upToDate) {
            opts.push({
                text: $.i18n('update'),
                icon: 'fa-cloud-download',
                action: (evt) => { evt.preventDefault();  updateFolder(id); }
            });
        } else {
            opts.push({
                text: $.i18n('update-force'),
                icon: 'fa-cloud-download',
                action: (evt) => { evt.preventDefault(); forceUpdateFolder(id); }
            });
        }
        opts.push({ divider: true });
    }

    opts.push({
        text: $.i18n('edit'),
        icon: 'fa-wrench',
        action: (evt) => { evt.preventDefault(); editFolder(id); }
    });

    opts.push({
        text: $.i18n('remove'),
        icon: 'fa-trash',
        action: (evt) => { evt.preventDefault(); rmFolder(id); }
    });

    if(!folderData.settings.override_default_actions && folderData.actions && folderData.actions.length) {
        fv3Debug('addDockerFolderContext', id, 'Adding custom actions as submenu.');
        opts.push({ divider: true });
        opts.push({
            text: $.i18n('custom-actions'),
            icon: 'fa-bars',
            subMenu: folderData.actions.map((e, i) => {
                return {
                    text: escapeHtml(e.name),
                    icon: e.script_icon || "fa-bolt",
                    action: (evt) => { evt.preventDefault(); folderCustomAction(id, i); }
                }
            })
        });
    }

    fv3Debug('addDockerFolderContext', id, 'Dispatching docker-folder-context event. Options:', opts);
    folderEvents.dispatchEvent(new CustomEvent('docker-folder-context', {detail: { id, opts }}));

    context.attach('#' + id, opts);
    fv3Debug('addDockerFolderContext', id, `Context menu attached to #${id}. Exit.`);
};

// Unraid listview/loadlist patches — inject folder rendering after containers render
window.listview_original = window.listview;
window.listview = () => {
    fv3Debug('Patched listview', 'Entry.');
    if (typeof window.listview_original === 'function') {
        window.listview_original();
        fv3Debug('Patched listview', 'Called original listview.');
    } else {
        fv3DebugWarn('Patched listview', 'window.listview_original is not a function!');
    }

    if (!loadedFolder) {
        fv3Debug('Patched listview', 'loadedFolder is false. Calling createFolders.');
        loadedFolder = true;
        createFolders().catch((e) => {
            fv3DebugWarn('Patched listview', 'createFolders failed; clearing flag so a later render can retry', e);
            loadedFolder = false;
        });
    } else {
        fv3Debug('Patched listview', 'loadedFolder is true. Skipped createFolders.');
    }
    fv3Debug('Patched listview', 'Exit.');
};

window.loadlist_original = window.loadlist;
let fv3FolderReqPending = false;
window.loadlist = () => {
    fv3Debug('Patched loadlist', 'Entry.');

    if (!fv3FolderReqPending) {
        fv3FolderReqPending = true;
        loadedFolder = false;
        fv3OrganizerSyncDone = false;
        fv3Debug('Patched loadlist', 'Set loadedFolder to false.');
        folderReq = [
            $.get('/plugins/folder.view3/server/read.php?type=docker').fail(() => fv3ShowBanner('Could not load folder data. Try refreshing the page.', 'error')).promise(),
            $.get('/plugins/folder.view3/server/read_order.php?type=docker').promise(),
            $.get('/plugins/folder.view3/server/read_info.php?type=docker').fail(() => fv3ShowBanner('Could not load container details. Try refreshing the page.', 'error')).promise(),
            $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise()
        ];
        Promise.all(folderReq).finally(() => { fv3FolderReqPending = false; });
        fv3Debug('Patched loadlist', 'folderReq initialized with 4 promises.');
    } else {
        fv3Debug('Patched loadlist', 'Skipping — requests already pending.');
    }

    if (typeof window.loadlist_original === 'function') {
        window.loadlist_original();
        fv3Debug('Patched loadlist', 'Called original loadlist.');
    } else {
        fv3DebugWarn('Patched loadlist', 'window.loadlist_original is not a function!');
    }
     fv3Debug('Patched loadlist', 'Exit.');
};

// Folder stats aggregation
const fv3UpdateFolderStats = (load, divideByCore) => {
    const hostMemB = Math.max(0, ...Object.values(load || {}).map(c => memToB((c && c.mem ? c.mem : ['0B','0B'])[1])));

    for (const [id, value] of Object.entries(globalFolders)) {
        let loadCpu = 0;
        let loadMemB = 0;
        const limits = [];

        if (!value || !value.containers) continue;

        for (const [cid_name, cvalue] of Object.entries(value.containers)) {
            const containerShortId = cvalue.id;
            const curLoad = load[containerShortId] || { cpu: '0.00%', mem: ['0B', '0B'] };
            const cpuVal = typeof curLoad.cpu === 'number' ? curLoad.cpu : parseFloat(curLoad.cpu.replace('%', ''));
            loadCpu += divideByCore ? cpuVal / cpus : cpuVal;
            loadMemB += memToB(curLoad.mem[0]);
            limits.push(memToB(curLoad.mem[1]));
        }

        const allLimited = hostMemB > 0 && limits.length > 0 && limits.every(l => l > 0 && l < hostMemB);
        const totalMemB = allLimited ? limits.reduce((a, b) => a + b, 0) : Math.max(0, ...limits);

        $(`span.mem-folder-${id}`).text(`${bToMem(loadMemB)} / ${bToMem(totalMemB)}`);
        $(`span.cpu-folder-${id}`).text(`${loadCpu.toFixed(2)}%`);
        $(`span#cpu-folder-${id}`).css('width', `${Math.min(100, loadCpu).toFixed(2)}%`);
    }
};

// WebSocket stats state (fv3UsingWebSocket lives in advanced-preview.js as window global)
let fv3WsLoad = {};
let fv3WsDebounceTimer = null;

// SSE stats fallback (when GraphQL WebSocket isn't available)
const fv3InitSSEStats = () => {
    fv3Debug('init', 'requesting CPU count for SSE fallback');
    $.get('/plugins/folder.view3/server/cpu.php').promise().then((data) => {
        cpus = parseInt(data);
        fv3Debug('CPU count received', `${cpus}. Attaching SSE listener for dockerload.`);
        dockerload.addEventListener('message', (e_sse) => {
            const sseData = (typeof e_sse.data === 'string') ? e_sse.data : (typeof e_sse === 'string' ? e_sse : null);
            if (!sseData || !sseData.trim()) return;
            if (window.fv3StatsMark) window.fv3StatsMark('sse');

            let load = {};
            const lines = sseData.split('\n');
            lines.forEach((line_str) => {
                if (!line_str.trim()) return;
                const exp = line_str.split(';');
                if (exp.length >= 3) {
                    load[exp[0]] = { cpu: exp[1], mem: exp[2].split(' / ') };
                }
            });

            fv3UpdateFolderStats(load, true);

            folderEvents.dispatchEvent(new CustomEvent('fv3-stats-update', { detail: { load, source: 'sse' } }));
        });
    }).catch(err => {
        fv3DebugWarn('init', 'error fetching CPU count', err);
    });
};

if (fv3ApiAvailable && fv3CpuCores) {
    cpus = fv3CpuCores;
    fv3Debug('init', `CPU cores from API: ${cpus}. Trying WebSocket stats.`);
    fv3ConnectStats(
        (stat) => {
            window.fv3UsingWebSocket = true;
            fv3WsLoad[stat.shortId] = { cpu: stat.cpuPercent, mem: stat.mem };
            folderEvents.dispatchEvent(new CustomEvent('fv3-stats-update', { detail: { stat, source: 'ws' } }));

            clearTimeout(fv3WsDebounceTimer);
            fv3WsDebounceTimer = setTimeout(() => {
                fv3UpdateFolderStats(fv3WsLoad, false);
            }, 200);
        },
        fv3InitSSEStats
    );
} else {
    fv3InitSSEStats();
}

// memToB() moved to advanced-preview.js (window global)


/**
 * Convert Bytes to memory units
 * @param {number} b the number of bytes
 * @returns {string} a string with the right notation and right unit
 */
const bToMem = (b) => {
    if (typeof b !== 'number' || isNaN(b) || b < 0) {
        fv3DebugWarn('bToMem', `Invalid input ${b}. Returning '0 B'.`);
        return '0 B';
    }
    if (b === 0) return '0 B';

    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let i = 0;
    let value = b;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    const result = `${value.toFixed(2)} ${units[i]}`;
    return result;
};


fv3Debug('init', 'globals', {
    cpus, loadedFolder, globalFolders: {...globalFolders}, folderRegex: folderRegex.toString(),
    folderDebugMode, folderobserverConfig: {...folderobserverConfig}, folderReq: [...folderReq]
});

fv3SetupResizeListeners(() => globalFolders, 'docker_listview_mode');

window.addEventListener('resize', () => fv3ScheduleWidthFix());
let _fv3LastAdvanced = $.cookie('docker_listview_mode') == 'advanced';
document.addEventListener('click', () => {
    setTimeout(() => {
        const now = $.cookie('docker_listview_mode') == 'advanced';
        if (now !== _fv3LastAdvanced) { _fv3LastAdvanced = now; fv3ScheduleWidthFix(); }
    }, 100);
}, true);

const createFolderBtn = () => fv3CreateFolderBtn('docker', '/Docker/Folder');

// Intercept Unraid's UserPrefs request to rewrite folder/order numbers — required for autostart and draw order.
$.ajaxPrefilter((options, originalOptions, jqXHR) => {
    if (options.url === "/plugins/dynamix.docker.manager/include/UserPrefs.php") {
        fv3Debug('ajaxPrefilter', 'UserPrefs intercepted', {...options});
        const data = new URLSearchParams(options.data);
        if (!data.has('names')) {
            // Reset Order POST has only {reset:true} — nothing to renumber, let it through.
            fv3Debug('ajaxPrefilter', 'no names param, passing through');
            return;
        }
        const containers = data.get('names').split(';');
        let num = "";
        for (let index = 0; index < containers.length - 1; index++) {
            num += index + ';'
        }
        data.set('index', num);
        options.data = data.toString();
        fv3Debug('ajaxPrefilter', 'modified data', options.data);
    }
});

// Patch Unraid's resetSorting to rebuild folder-grouped autostart before loadlist re-renders.
// Stock resetSorting POSTs {reset:true} (which deletes userprefs.cfg and natcasesorts autostart),
// then calls loadlist(). We chain a sync_order POST in between so FV3's folder-grouped autostart
// is re-established before the page re-renders.
if (typeof resetSorting === 'function') {
    window.resetSorting = function() {
        if ($.cookie('lockbutton') == null) return;
        $('input[type=button]').prop('disabled', true);
        $.post('/plugins/dynamix.docker.manager/include/UserPrefs.php', {reset: true}, function() {
            $.post('/plugins/folder.view3/server/sync_order.php', {type: 'docker'}, function() {
                loadlist();
            });
        });
    };
    fv3Debug('init', 'resetSorting patched for folder-grouped autostart');
}

// After Unraid mutates order or autostart, re-run sync_order so autostart matches screen.
$(document).ajaxComplete((event, jqXHR, settings) => {
    if (!settings || !settings.url) return;
    const url = settings.url;
    const data = typeof settings.data === 'string' ? settings.data : '';
    const isAutostartToggle = url.indexOf('/plugins/dynamix.docker.manager/include/UpdateConfig.php') !== -1
        && (data.indexOf('action=autostart') !== -1 || data.indexOf('action=wait') !== -1);
    const isOrderSave = url.indexOf('/plugins/dynamix.docker.manager/include/UserPrefs.php') !== -1
        && jqXHR.status === 200
        && data.indexOf('names=') !== -1;
    if (isAutostartToggle || isOrderSave) {
        fv3Debug('autostartSync', 'Rebuilding autostart after Unraid event', {url, sample: data.slice(0, 80)});
        $.post('/plugins/folder.view3/server/sync_order.php', {type: 'docker'});
    }
});

fv3Debug('init', 'docker.js loaded');