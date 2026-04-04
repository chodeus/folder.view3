/**
 * Handles the creation of all folders
 */
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


    if(folderDebugMode) {
        const debugData = JSON.stringify({
            version: (await $.get('/plugins/folder.view3/server/version.php').promise()).trim(),
            folders,
            unraidOrder,
            originalOrder: fv3SafeParse(await $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise(), []),
            newOnes,
            order,
            containersInfo: fv3SanitizeContainersInfo(containersInfo)
        });
        fv3DownloadDebugJSON('debug-DOCKER.json', debugData);
        fv3Debug('createFolders', 'Order:', [...order]);
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
                // Pass 'order' (the live array) to createFolder.
                // 'position' is the current 'key' (index of the folder placeholder in the 'order' array).
                const removedCount = createFolder(folders[id], id, key, order, containersInfo, Object.keys(foldersDone));
                key -= removedCount; // Adjust key by the number of items that were before the folder and moved into it.
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
        folders: folders, // Note: this `folders` object will be empty here if all were processed
        order: order,
        containersInfo: containersInfo
    }}));

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

    // --- Store a snapshot of the live order array AT THE START of this folder's processing ---
    // This snapshot is crucial for correctly calculating `remBefore` based on original positions.
    const orderSnapshotAtFolderStart = [...liveOrderArray];
    if (FV3_DEBUG && id === "2l2rPNIkZHWN5WLqAuzPaCZHSqI") {
        fv3Debug('createFolder', 'Network folder containers', JSON.parse(JSON.stringify(folder.containers)));
        fv3Debug('createFolder', 'Network folder regex', folder.regex);
        fv3Debug('createFolder', 'Network folder orderSnapshot', [...orderSnapshotAtFolderStart]);
    }

    fv3Debug('createFolder', id, 'Dispatching docker-pre-folder-creation event.');
    folderEvents.dispatchEvent(new CustomEvent('docker-pre-folder-creation', {detail: {
        folder: folder, // Be aware: if 'folder' object is modified by listeners, it affects this function
        id: id,
        position: positionInMainOrder, // Use the more descriptive name
        order: liveOrderArray,         // Pass the live array
        containersInfo: containersInfo,
        foldersDone: foldersDone
    }}));

    let upToDate = true;
    let started = 0;
    let autostart = 0;
    let autostartStarted = 0;
    let managed = 0;
    let managerTypes = new Set();
    let remBefore = 0; // This will count items *from this folder* that were originally before its placeholder
    fv3Debug('createFolder', id, 'Initialized local state variables', { upToDate, started, autostart, autostartStarted, managed, remBefore });

    const advanced = $.cookie('docker_listview_mode') == 'advanced';
    fv3Debug('createFolder', id, `Advanced view enabled: ${advanced}`);

    // --- Correctly build combinedContainers ---
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
    // --- End of combinedContainers build ---

    const colspan = document.querySelector("#docker_containers > thead > tr").childElementCount - 5;
    const fld = `<tr class="sortable folder-id-${id} ${folder.settings.preview_hover ? 'hover' : ''} folder"><td class="ct-name folder-name"><div class="folder-name-sub"><i class="fa fa-arrows-v mover orange-text"></i><span class="outer folder-outer"><span id="${id}" onclick="addDockerFolderContext('${id}')" class="hand folder-hand"><img src="${escapeHtml(folder.icon)}" class="img folder-img" onerror='this.src="/plugins/dynamix.docker.manager/images/question.png"'></span><span class="inner folder-inner"><span class="appname" style="display: none;"><a>folder-${id}</a></span><a class="exec folder-appname" onclick='editFolder("${id}")'>${escapeHtml(folder.name)}</a><br><i id="load-folder-${id}" class="fa fa-square stopped red-text folder-load-status"></i><span class="state folder-state"> ${$.i18n('stopped')}</span></span></span><button class="dropDown-${id} folder-dropdown" onclick="dropDownButton('${id}')" ><i class="fa fa-chevron-down" aria-hidden="true"></i></button></div></td><td class="updatecolumn folder-update"><span class="green-text folder-update-text"><i class="fa fa-check fa-fw"></i> ${$.i18n('up-to-date')}</span><div class="advanced" style="display: ${advanced ? 'block' : 'none'};"><a class="exec" onclick="forceUpdateFolder('${id}');"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i> ${$.i18n('force-update')}</span></a></div></td><td colspan="${colspan}"><div class="folder-storage"></div><div class="folder-preview"></div></td><td class="advanced folder-advanced" ${advanced ? 'style="display: table-cell;"' : ''}><span class="cpu-folder-${id} folder-cpu">0%</span><div class="usage-disk mm folder-load"><span id="cpu-folder-${id}" class="folder-cpu-bar" style="width:0%"></span><span></span></div><br><span class="mem-folder-${id} folder-mem">0 / 0</span></td><td class="folder-autostart"><input type="checkbox" id="folder-${id}-auto" class="autostart" style="display:none"><div style="clear:left"></div></td><td></td></tr>`;
    fv3Debug('createFolder', id, `colspan=${colspan}. Generated folder HTML (fld).`);

    if (positionInMainOrder === 0) {
        fv3Debug('createFolder', id, 'Inserting folder HTML at position 0 (before).');
        $('#docker_list > tr.sortable').eq(0).before($(fld)); // Always eq(0) for 'before' the first sortable
    } else {
        // Find the actual DOM element that is currently at positionInMainOrder - 1 in the *visible sortable list*
        // This needs to be robust to items already having been moved.
        // A safer bet is to find the *last processed item* or *first non-folder item* if the folder is inserted later.
        // For now, using the direct index, assuming other sortables are still in place.
        if ($('#docker_list > tr.sortable').length > 0 && positionInMainOrder > 0) {
             fv3Debug('createFolder', id, `Inserting folder HTML at position ${positionInMainOrder} (after eq ${positionInMainOrder-1} of current sortables).`);
             $('#docker_list > tr.sortable').eq(positionInMainOrder - 1).after($(fld));
        } else if ($('#docker_list > tr.sortable').length === 0 && positionInMainOrder === 0) {
            // If no sortables exist yet (e.g., first folder, all others are new)
             fv3Debug('createFolder', id, 'No sortables found, inserting folder at the beginning of #docker_list.');
            $('#docker_list').prepend($(fld));
        } else {
             fv3DebugWarn('createFolder', id, `Could not determine insertion point for folder. Position: ${positionInMainOrder}, Sortables count: ${$('#docker_list > tr.sortable').length}`);
             // Fallback: append to the list if other logic fails
             $('#docker_list').append($(fld));
        }
    }

    // NOTE: switchButton initialization is deferred until after autostart state is known (see below).
    // This avoids the bug where initializing with checked:false then clicking ON could
    // fire a change event that resets container autostart settings.
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

    // Note: `cutomOrder` is not used in the critical logic below, but kept for potential other uses or debugging.
    const mappedFoldersDone = foldersDone.map(e => 'folder-'+e);
    const cutomOrder = orderSnapshotAtFolderStart.filter((e) => { // Based on snapshot, as original code
        return e && (mappedFoldersDone.includes(e) || !(folderRegex.test(e) && e !== `folder-${id}`));
    });
    fv3Debug('createFolder', id, '(Informational) Filtered cutomOrder based on orderSnapshotAtFolderStart:', [...cutomOrder]);


    fv3Debug('createFolder', id, `Starting loop to process ${combinedContainers.length} combinedContainers.`);
    for (const container_name_in_folder of combinedContainers) {

        const ct = containersInfo[container_name_in_folder];
        if (!ct) {
            fv3DebugWarn('createFolder', id, `CRITICAL - Container info for '${container_name_in_folder}' not found in containersInfo! Skipping further processing for this container.`);
            continue; // Skip this container if info is missing
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
                foldersDone: foldersDone, // Original foldersDone
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


            let CPU = []; let MEM = []; let charts = []; let tootltipObserver;
            fv3Debug('createFolder', id, container_name_in_folder, 'Initialized CPU, MEM, charts, tootltipObserver for tooltip.');

            const pushChartData = (cpuVal, memVal) => {
                const now = Date.now();
                CPU.push({ x: now, y: cpuVal });
                MEM.push({ x: now, y: memVal });
                for (const chart of charts) { chart.update('quiet'); }
            };

            const graphListenerSSE = (e) => {
                try {
                    let dataToParse = e.data ? e.data : e;
                    let loadMatch = dataToParse.match(new RegExp(`^${ct.shortId}\;.*\;.*\ \/\ .*$`, 'm'));
                    if (!loadMatch) { pushChartData(0, 0); return; }
                    let load = loadMatch[0].split(';');
                    let cpuVal = parseFloat(load[1].replace('%', '')) / cpus;
                    let memParts = load[2].split(' / ');
                    let memVal = memToB(memParts[0]) / memToB(memParts[1]) * 100;
                    pushChartData(cpuVal, memVal);
                } catch (error) {
                    pushChartData(0, 0);
                }
            };

            const graphListenerWS = (e) => {
                const detail = e.detail;
                if (detail.source !== 'ws' || !detail.stat || detail.stat.shortId !== ct.shortId) return;
                try {
                    let cpuVal = detail.stat.cpuPercent;
                    let memVal = memToB(detail.stat.mem[0]) / memToB(detail.stat.mem[1]) * 100;
                    pushChartData(cpuVal, memVal);
                } catch (error) {
                    pushChartData(0, 0);
                }
            };

            const isHiddenFromPreview = (folder.hidden_preview || []).includes(container_name_in_folder);
            const tooltip_trigger_element = isHiddenFromPreview ? null : addPreview(id, ct.shortId, !(ct.info.State.Autostart === false));
            fv3Debug('createFolder', id, ct.shortId, `Called addPreview (hidden: ${isHiddenFromPreview}). Returned tooltip_trigger_element:`, tooltip_trigger_element ? tooltip_trigger_element[0] : 'null/undefined');
        
            $(`tr.folder-id-${id} div.folder-preview span.inner > span.appname`).css("width", folder.settings.preview_text_width || '');
            if (folder.settings.preview_text_width) fv3Debug('createFolder', id, `preview text width: ${folder.settings.preview_text_width}`);

            if(tooltip_trigger_element && tooltip_trigger_element.length > 0) {
                fv3Debug('createFolder', id, ct.shortId, 'tooltip_trigger_element is valid. Initializing tooltipster.');
                $(tooltip_trigger_element).tooltipster({
                    interactive: true,
                    theme: ['tooltipster-docker-folder'],
                    trigger: (folder.settings.context_trigger===1 ? 'hover' : 'click') || 'click',
                    zIndex: 99998,
                    // --- START OF MODIFIED functionBefore ---
                    functionBefore: function(instance, helper) {
                        // instance: The Tooltipster instance.
                        // helper: An object, helper.origin is the triggering element.
                        const origin = helper.origin; // Get the triggering element

                        fv3Debug('tooltipster', ct.shortId, 'functionBefore', instance, helper, origin);
                        fv3Debug('tooltipster', ct.shortId, 'folder settings', {...folder.settings});

                        // Dispatch your custom event
                        fv3Debug('tooltipster', ct.shortId, 'Dispatching docker-tooltip-before event.');
                        folderEvents.dispatchEvent(new CustomEvent('docker-tooltip-before', {detail: {
                            folder: folder,
                            id: id, // Folder ID
                            containerInfo: ct, // Container info
                            origin: origin,
                            charts: charts, 
                            stats: {
                                CPU: CPU, 
                                MEM: MEM
                            }
                        }}));

                        fv3Debug('tooltipster', ct.shortId, 'functionBefore completed. Allowing tooltip to proceed by default.');
                        // By not returning false, Tooltipster should proceed.
                    },
                    functionReady: function(instance, helper) {
                        // instance: The Tooltipster instance
                        // helper: An object with helper.origin (trigger element) and helper.tooltip (tooltip DOM element)

                        const triggerOriginEl = helper.origin;  // This is the jQuery object of the element that triggered the tooltip
                        const tooltipDomEl = helper.tooltip;  // This is the jQuery object of the tooltip's outermost DOM element

                        fv3Debug('tooltipster', ct.shortId, 'functionReady. Instance:', instance, "Helper:", helper, "Trigger Origin Element:", triggerOriginEl[0], "Tooltip DOM Element:", tooltipDomEl[0]);
                        fv3Debug('tooltipster', ct.shortId, 'Dispatching docker-tooltip-ready-start event.');
                        
                        folderEvents.dispatchEvent(new CustomEvent('docker-tooltip-ready-start', {detail: {
                            folder: folder,
                            id: id,
                            containerInfo: ct,
                            origin: triggerOriginEl,
                            tooltip: tooltipDomEl,
                            charts,
                            stats: {
                                CPU,
                                MEM
                            }
                        }}));
                        
                        let diabled = [];
                        let active = 0;
                        const options = {
                            scales: {
                                x: {
                                    type: 'realtime',
                                    realtime: {
                                        duration: 1000*(folder.settings.context_graph_time || 60),
                                        refresh: 1000, 
                                        delay: 1000 
                                    },
                                    time: {
                                        tooltipFormat: 'dd MMM, yyyy, HH:mm:ss',
                                        displayFormats: {
                                            millisecond: 'H:mm:ss.SSS',
                                            second: 'H:mm:ss',
                                            minute: 'H:mm',
                                            hour: 'H',
                                            day: 'MMM D',
                                            week: 'll',
                                            month: 'MMM YYYY',
                                            quarter: '[Q]Q - YYYY',
                                            year: 'YYYY'
                                        },
                                    },
                                },
                                y: {
                                    min: 0,
                                }
                            },
                            interaction: {
                                intersect: false,
                                mode: 'index',
                            },
                            plugins: {
                                tooltip: {
                                    position: 'nearest'
                                }
                            }
                        };
                        fv3Debug('tooltipster', ct.shortId, 'Chart.js options:', options, "Graph mode setting:", folder.settings.context_graph);

                        charts = []; 
                        switch (folder.settings.context_graph) {
                            case 0: 
                                fv3Debug('tooltipster', ct.shortId, 'Graph mode 0 (None).');
                                diabled = [0, 1, 2]; 
                                active = 3; 
                                break;
                            case 2: 
                                fv3Debug('tooltipster', ct.shortId, 'Graph mode 2 (Split). Creating CPU and MEM charts.');
                                diabled = [0]; 
                                active = 1; 
                                try {
                                    charts.push(new Chart($(`.cpu-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0), { 
                                        type: 'line',
                                        data: { datasets: [ { label: 'CPU', data: CPU, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu'), tension: 0.4, pointRadius: 0, borderWidth: 1 } ] },
                                        options: options
                                    }));
                                    charts.push(new Chart($(`.mem-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0), { 
                                        type: 'line',
                                        data: { datasets: [ { label: 'MEM', data: MEM, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), tension: 0.4, pointRadius: 0, borderWidth: 1 } ] },
                                        options: options
                                    }));
                                     fv3Debug('tooltipster', ct.shortId, 'Split charts created. CPU canvas:', $(`.cpu-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0), "MEM canvas:", $(`.mem-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0));
                                } catch(e) {
                                    fv3DebugWarn('tooltipster', ct.shortId, 'Error creating split charts:', e);
                                }
                                break;
                            case 3: 
                                 fv3Debug('tooltipster', ct.shortId, 'Graph mode 3 (CPU only). Creating CPU chart.');
                                diabled = [0, 2]; 
                                active = 1; 
                                try {
                                    charts.push(new Chart($(`.cpu-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0), { 
                                        type: 'line',
                                        data: { datasets: [ { label: 'CPU', data: CPU, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu'), tension: 0.4, pointRadius: 0, borderWidth: 1 } ] },
                                        options: options
                                    }));
                                     fv3Debug('tooltipster', ct.shortId, 'CPU chart created. Canvas:', $(`.cpu-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0));
                                } catch(e) {
                                     fv3DebugWarn('tooltipster', ct.shortId, 'Error creating CPU chart:', e);
                                }
                                break;
                            case 4: 
                                fv3Debug('tooltipster', ct.shortId, 'Graph mode 4 (MEM only). Creating MEM chart.');
                                diabled = [0, 1]; 
                                active = 2; 
                                try {
                                    charts.push(new Chart($(`.mem-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0), { 
                                        type: 'line',
                                        data: { datasets: [ { label: 'MEM', data: MEM, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), tension: 0.4, pointRadius: 0, borderWidth: 1 } ] },
                                        options: options
                                    }));
                                    fv3Debug('tooltipster', ct.shortId, 'MEM chart created. Canvas:', $(`.mem-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0));
                                } catch(e) {
                                    fv3DebugWarn('tooltipster', ct.shortId, 'Error creating MEM chart:', e);
                                }
                                break;
                            case 1: 
                            default:
                                fv3Debug('tooltipster', ct.shortId, 'Graph mode 1 (Combined) or default. Creating combined chart.');
                                diabled = [1, 2]; 
                                active = 0; 
                                try {
                                    charts.push(new Chart($(`.comb-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0), { 
                                        type: 'line',
                                        data: {
                                            datasets: [
                                                { label: 'CPU', data: CPU, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-cpu'), tension: 0.4, pointRadius: 0, borderWidth: 1 },
                                                { label: 'MEM', data: MEM, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), tension: 0.4, pointRadius: 0, borderWidth: 1 }
                                            ]
                                        },
                                        options: options
                                    }));
                                    fv3Debug('tooltipster', ct.shortId, 'Combined chart created. Canvas:', $(`.comb-graph-${ct.shortId} > canvas`, tooltipDomEl).get(0));
                                } catch(e) {
                                     fv3DebugWarn('tooltipster', ct.shortId, 'Error creating combined chart:', e);
                                }
                                break;
                        };
                        fv3Debug('tooltipster', ct.shortId, `Tab states: disabled=${diabled}, active=${active}. Charts array length: ${charts.length}`);

                        fv3Debug('tooltipster', ct.shortId, 'canvas check', {
                            comb: $(`.comb-graph-${ct.shortId} > canvas`, tooltipDomEl).length,
                            cpu: $(`.cpu-graph-${ct.shortId} > canvas`, tooltipDomEl).length,
                            mem: $(`.mem-graph-${ct.shortId} > canvas`, tooltipDomEl).length
                        });

                        tootltipObserver = new MutationObserver((mutationList, observer) => {
                            fv3Debug('tooltipObserver', ct.shortId, 'Mutation observed for CPU text.', mutationList);
                            for (const mutation of mutationList) {
                                $(`.preview-outbox-${ct.shortId} span#cpu-${ct.shortId}`, tooltipDomEl).css('width',  mutation.target.textContent) 
                            }
                        });

                        const cpuTextElement = $(`.preview-outbox-${ct.shortId} span.cpu-${ct.shortId}`, tooltipDomEl).get(0); 
                        if (cpuTextElement) {
                            tootltipObserver.observe(cpuTextElement, {childList: true});
                            fv3Debug('tooltipster', ct.shortId, 'tootltipObserver observing CPU text element.', cpuTextElement);
                        } else {
                            fv3DebugWarn('tooltipster', ct.shortId, 'CPU text element for tootltipObserver not found.');
                        }

                        if($(`.preview-outbox-${ct.shortId} .status-autostart`, tooltipDomEl).children().length === 1) { 
                            fv3Debug('tooltipster', ct.shortId, 'Initializing switchButton and tabs for tooltip content.');
                            $(`.preview-outbox-${ct.shortId} .status-autostart > input[type='checkbox']`, tooltipDomEl).switchButton({ labels_placement: 'right', off_label: $.i18n('off'), on_label: $.i18n('on'), checked: !(ct.info.State.Autostart === false) }); 
                            $(`.preview-outbox-${ct.shortId} .info-section`, tooltipDomEl).tabs({ 
                                heightStyle: 'auto',
                                disabled: diabled,
                                active: active
                            });
                            $(`.preview-outbox-${ct.shortId} table > tbody div.status-autostart > input[type="checkbox"]`, tooltipDomEl).on("change", advancedAutostart); 
                        } else {
                             fv3DebugWarn('tooltipster', ct.shortId, 'Autostart switch placeholder not found as expected in tooltip.');
                        }

                        if (fv3UsingWebSocket) {
                            folderEvents.addEventListener('fv3-stats-update', graphListenerWS);
                            fv3Debug('tooltipster', ct.shortId, 'Added graphListener via WebSocket events.');
                        } else {
                            dockerload.addEventListener('message', graphListenerSSE);
                            fv3Debug('tooltipster', ct.shortId, 'Added graphListener to dockerload SSE.');
                        }

                        fv3Debug('tooltipster', ct.shortId, 'Dispatching docker-tooltip-ready-end event.');
                        folderEvents.dispatchEvent(new CustomEvent('docker-tooltip-ready-end', {detail: {
                            folder: folder,
                            id: id,
                            containerInfo: ct,
                            origin: triggerOriginEl,
                            tooltip: tooltipDomEl,
                            charts,
                            tootltipObserver,
                            stats: {
                                CPU,
                                MEM
                            }
                        }}));
                    },
                    functionAfter: function(instance, helper) {
                        const origin = helper.origin;
                        fv3Debug('tooltipster', ct.shortId, 'functionAfter. Instance:', instance, "Helper:", helper, "Origin:", origin);
                        fv3Debug('tooltipster', ct.shortId, 'Dispatching docker-tooltip-after event.');
                        folderEvents.dispatchEvent(new CustomEvent('docker-tooltip-after', {detail: {
                            folder: folder,
                            id: id,
                            containerInfo: ct,
                            origin: origin,
                            charts, 
                            tootltipObserver,
                            stats: { 
                                CPU,
                                MEM
                            }
                        }}));
                        if (fv3UsingWebSocket) {
                            folderEvents.removeEventListener('fv3-stats-update', graphListenerWS);
                        } else {
                            dockerload.removeEventListener('message', graphListenerSSE);
                        }
                        fv3Debug('tooltipster', ct.shortId, 'Removed graphListener.');
                        for (const chart of charts) {
                            chart.destroy();
                        }
                        fv3Debug('tooltipster', ct.shortId, `Destroyed ${charts.length} charts.`);
                        charts = []; 
                        if (tootltipObserver) {
                            tootltipObserver.disconnect();
                            tootltipObserver = undefined;
                            fv3Debug('tooltipster', ct.shortId, 'Disconnected and cleared tootltipObserver.');
                        }
                    },
                   content: $(`
                        <div class="preview-outbox preview-outbox-${ct.shortId}">
                            <div class="first-row">
                                <div class="preview-name">
                                    <div class="preview-img"><img src="${ct.Labels['net.unraid.docker.icon'] || ''}" class="img folder-img" onerror='this.src="/plugins/dynamix.docker.manager/images/question.png"'></div>
                                    <div class="preview-actual-name">
                                        <span class="blue-text appname">${escapeHtml(ct.info.Name)}</span><br>
                                        <i class="fa fa-${ct.info.State.Running ? (ct.info.State.Paused ? 'pause' : 'play') : 'square'} ${ct.info.State.Running ? (ct.info.State.Paused ? 'paused' : 'started') : 'stopped'} ${ct.info.State.Running ? (ct.info.State.Paused ? 'orange-text' : 'green-text') : 'red-text'}"></i>
                                        <span class="state"> ${ct.info.State.Running ? (ct.info.State.Paused ? $.i18n('paused') : $.i18n('started')) : $.i18n('stopped')}</span>
                                    </div>
                                </div>
                                <table class="preview-status">
                                    <thead class="status-header"><tr><th class="status-header-version">${$.i18n('version')}</th><th class="status-header-stats">CPU/MEM</th><th class="status-header-autostart">${$.i18n('autostart')}</th></tr></thead>
                                    <tbody><tr>
                                        <td><div class="status-version">${ct.info.State.manager === 'composeman' ? `<span class="folder-update-text"><i class="fa fa-docker fa-fw"></i> ${$.i18n('compose')}</span>` : ct.info.State.manager !== 'dockerman' ? `<span class="folder-update-text"><i class="fa fa-docker fa-fw"></i> ${$.i18n('third-party')}</span>` : ct.info.State.Updated !== false ? `<span class="green-text folder-update-text"><i class="fa fa-check fa-fw"></i>${$.i18n('up-to-date')}</span><br><a class="exec" onclick="hideAllTips(); updateContainer('${escapeHtml(ct.info.Name)}');"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i>${$.i18n('force-update')}</span></a>` : `<span class="orange-text folder-update-text" style="white-space:nowrap;"><i class="fa fa-flash fa-fw"></i>${$.i18n('update-ready')}</span><br><a class="exec" onclick="hideAllTips(); updateContainer('${escapeHtml(ct.info.Name)}');"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i>${$.i18n('apply-update')}</span></a>`}<br><i class="fa fa-info-circle fa-fw"></i> ${escapeHtml(ct.info.Config.Image.split(':').pop())}</div></td>
                                        <td><div class="status-stats"><span class="cpu-${ct.shortId}">0%</span><div class="usage-disk mm"><span id="cpu-${ct.shortId}" style="width: 0%;"></span><span></span></div><br><span class="mem-${ct.shortId}">0 / 0</span></div></td>
                                        <td><div class="status-autostart"><input type="checkbox" style="display:none" class="staus-autostart-checkbox" name="preview-autostart-${ct.shortId}"></div></td>
                                    </tr></tbody>
                                </table>
                            </div>
                            <div class="second-row">
                                <div class="action-info">
                                    <div class="action">
                                        <div class="action-left">
                                            <ul class="fa-ul">
                                                ${(ct.info.State.Running && !ct.info.State.Paused) ? 
                                                    `${ct.info.State.WebUi ? `<li><a href="${escapeHtml(ct.info.State.WebUi)}" target="_blank"><i class="fa fa-globe" aria-hidden="true"></i> ${$.i18n('webui')}</a></li>` : ''}
                                                     ${ct.info.State.TSWebUi ? `<li><a href="${escapeHtml(ct.info.State.TSWebUi)}" target="_blank"><i class="fa fa-shield" aria-hidden="true"></i> ${$.i18n('tailscale-webui')}</a></li>` : ''}
                                                     <li><a onclick="event.preventDefault(); openTerminal('docker', '${escapeHtml(ct.info.Name)}', '${escapeHtml(ct.info.Shell)}');"><i class="fa fa-terminal" aria-hidden="true"></i> ${$.i18n('console')}</a></li>`
                                                : ''}
                                                ${!ct.info.State.Running ? `<li><a onclick="event.preventDefault(); eventControl({action:'start', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-play" aria-hidden="true"></i> ${$.i18n('start')}</a></li>` :
                                                    `${ct.info.State.Paused ? `<li><a onclick="event.preventDefault(); eventControl({action:'resume', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-play" aria-hidden="true"></i> ${$.i18n('resume')}</a></li>` :
                                                        `<li><a onclick="event.preventDefault(); eventControl({action:'stop', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-stop" aria-hidden="true"></i> ${$.i18n('stop')}</a></li>
                                                         <li><a onclick="event.preventDefault(); eventControl({action:'pause', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-pause" aria-hidden="true"></i> ${$.i18n('pause')}</a></li>`}
                                                <li><a onclick="event.preventDefault(); eventControl({action:'restart', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-refresh" aria-hidden="true"></i> ${$.i18n('restart')}</a></li>`}
                                                <li><a onclick="event.preventDefault(); openTerminal('docker', '${escapeHtml(ct.info.Name)}', '.log');"><i class="fa fa-navicon" aria-hidden="true"></i> ${$.i18n('logs')}</a></li>
                                                ${ct.info.template ? `<li><a onclick="event.preventDefault(); editContainer('${escapeHtml(ct.info.Name)}', '${escapeHtml(ct.info.template.path)}');"><i class="fa fa-wrench" aria-hidden="true"></i> ${$.i18n('edit')}</a></li>` : ''}
                                                <li><a onclick="event.preventDefault(); rmContainer('${escapeHtml(ct.info.Name)}', '${ct.shortImageId}', '${ct.shortId}');"><i class="fa fa-trash" aria-hidden="true"></i> ${$.i18n('remove')}</a></li>
                                            </ul>
                                        </div>
                                        <div class="action-right">
                                            <ul class="fa-ul">
                                                ${ct.info.ReadMe ? `<li><a href="${escapeHtml(ct.info.ReadMe)}" target="_blank"><i class="fa fa-book" aria-hidden="true"></i> ${$.i18n('read-me-first')}</a></li>` : ''}
                                                ${ct.info.Project ? `<li><a href="${escapeHtml(ct.info.Project)}" target="_blank"><i class="fa fa-life-ring" aria-hidden="true"></i> ${$.i18n('project-page')}</a></li>` : ''}
                                                ${ct.info.Support ? `<li><a href="${escapeHtml(ct.info.Support)}" target="_blank"><i class="fa fa-question" aria-hidden="true"></i> ${$.i18n('support')}</a></li>` : ''}
                                                ${ct.info.registry ? `<li><a href="${escapeHtml(ct.info.registry)}" target="_blank"><i class="fa fa-info-circle" aria-hidden="true"></i> ${$.i18n('more-info')}</a></li>` : ''}
                                                ${ct.info.DonateLink ? `<li><a href="${escapeHtml(ct.info.DonateLink)}" target="_blank"><i class="fa fa-usd" aria-hidden="true"></i> ${$.i18n('donate')}</a></li>` : ''}
                                            </ul>
                                        </div>
                                    </div>
                                    <div class="info-ct">
                                        <span class="container-id">${$.i18n('container-id')}: ${ct.shortId}</span><br>
                                        <span class="repo">${$.i18n('by')}: <a target="_blank" ${ct.info.registry ? `href="${escapeHtml(ct.info.registry)}"` : ''} >${escapeHtml(ct.info.Config.Image.split(':').shift())}</a></span>
                                    </div>
                                </div>
                                <div class="info-section">
                                    <ul class="info-tabs">
                                        <li><a class="tabs-graph localURL" href="#comb-graph-${ct.shortId}">${$.i18n('graph')}</a></li>
                                        <li><a class="tabs-cpu-graph localURL" href="#cpu-graph-${ct.shortId}">${$.i18n('cpu-graph')}</a></li>
                                        <li><a class="tabs-mem-graph localURL" href="#mem-graph-${ct.shortId}">${$.i18n('mem-graph')}</a></li>
                                        <li><a class="tabs-ports localURL" href="#info-ports-${ct.shortId}">${$.i18n('port-mappings')}</a></li>
                                        <li><a class="tabs-volumes localURL" href="#info-volumes-${ct.shortId}">${$.i18n('volume-mappings')}</a></li>
                                    </ul>
                                    <div class="comb-graph-${ct.shortId} comb-stat-graph" id="comb-graph-${ct.shortId}" style="display: none;"><canvas></canvas></div>
                                    <div class="cpu-graph-${ct.shortId} cpu-stat-graph" id="cpu-graph-${ct.shortId}" style="display: none;"><canvas></canvas></div>
                                    <div class="mem-graph-${ct.shortId} mem-stat-graph" id="mem-graph-${ct.shortId}" style="display: none;"><canvas></canvas></div>
                                    <div class="info-ports" id="info-ports-${ct.shortId}" style="display: none;">${ct.info.Ports?.length > 10 ? (`<span class="info-ports-more" style="display: none;">${ct.info.Ports?.map(e=>`${e.PrivateIP ? e.PrivateIP + ':' : ''}${e.PrivatePort}/${e.Type.toUpperCase()} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? e.PublicIP + ':' : ''}${e.PublicPort}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-ports-less').css('display', 'inline')">${$.i18n('compress')}</a></span><span class="info-ports-less">${ct.info.Ports?.slice(0,10).map(e=>`${e.PrivateIP ? e.PrivateIP + ':' : ''}${e.PrivatePort}/${e.Type.toUpperCase()} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? e.PublicIP + ':' : ''}${e.PublicPort}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-ports-more').css('display', 'inline')">${$.i18n('expand')}</a></span>`) : (`<span class="info-ports-mono">${ct.info.Ports?.map(e=>`${e.PrivateIP ? e.PrivateIP + ':' : ''}${e.PrivatePort}/${e.Type.toUpperCase()} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? e.PublicIP + ':' : ''}${e.PublicPort}`).join('<br>') || ''}</span>`)}</div>
                                    <div class="info-volumes" id="info-volumes-${ct.shortId}" style="display: none;">${ct.Mounts?.filter(e => e.Type==='bind').length > 10 ? (`<span class="info-volumes-more" style="display: none;">${ct.Mounts?.filter(e => e.Type==='bind').map(e=>`${e.Destination} <i class="fa fa-arrows-h"></i> ${e.Source}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-volumes-less').css('display', 'inline')">${$.i18n('compress')}</a></span><span class="info-volumes-less">${ct.Mounts?.filter(e => e.Type==='bind').slice(0,10).map(e=>`${e.Destination} <i class="fa fa-arrows-h"></i> ${e.Source}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-volumes-more').css('display', 'inline')">${$.i18n('expand')}</a></span>`) : (`<span class="info-volumes-mono">${ct.Mounts?.filter(e => e.Type==='bind').map(e=>`${e.Destination} <i class="fa fa-arrows-h"></i> ${e.Source}`).join('<br>') || ''}</span>`)}</div>
                                </div>
                            </div>
                        </div>
                    `)
                });
            } else {
                 fv3DebugWarn('createFolder', id, ct.shortId, 'tooltip_trigger_element is NOT valid. Tooltipster NOT initialized. This is likely the problem if folder.settings.context === 2.');
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
                const elementForPreviewOpts = $(`tr.folder-id-${id} div.folder-preview > span:last`); // Re-check if this is always correct
                fv3Debug('createFolder', id, container_name_in_folder, 'Preview element for options:', elementForPreviewOpts[0]);
                let sel_preview_opt;
                fv3Debug('createFolder', id, container_name_in_folder, 'Applying preview options based on folder.settings:', JSON.parse(JSON.stringify(folder.settings)));

                const $previewElementTarget = $(`tr.folder-id-${id} div.folder-preview > span:last`); // Or elementForPreviewOpts if you prefer
                let $targetForAppend; // Used for WebUI, Console, Logs icons

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

                // Determine the element to append WebUI/Console/Logs icons to
                $targetForAppend = $previewElementTarget.children('span.inner').last();
                if (!$targetForAppend.length) {
                    $targetForAppend = $previewElementTarget; // Fallback to the main span if no inner span
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
            }

            upToDate = upToDate && !newFolder[container_name_in_folder].update;
            started += newFolder[container_name_in_folder].state ? 1 : 0;
            const isDockerMan = ct.info.State.manager === 'dockerman';
            autostart += (isDockerMan && !(ct.info.State.Autostart === false)) ? 1 : 0;
            autostartStarted += (isDockerMan && !(ct.info.State.Autostart === false) && newFolder[container_name_in_folder].state) ? 1 : 0;
            managed += newFolder[container_name_in_folder].managed ? 1 : 0;
            managerTypes.add(ct.info.State.manager);
            fv3Debug('createFolder', id, container_name_in_folder, 'Updated folder aggregate states:', { upToDate, started, autostart, autostartStarted, managed, managerTypes: Array.from(managerTypes) });
            folderEvents.dispatchEvent(new CustomEvent('docker-post-folder-preview', {detail: {
                folder: folder,
                id: id,
                position: positionInMainOrder,
                order: liveOrderArray,
                containersInfo: containersInfo,
                foldersDone: foldersDone, // Original foldersDone
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
    }
    if (started) {
        $(`tr.folder-id-${id} i#load-folder-${id}`).attr('class', 'fa fa-play started green-text folder-load-status');
        $(`tr.folder-id-${id} span.folder-state`).text(`${started}/${Object.entries(folder.containers).length} ${$.i18n('started')}`);
        fv3Debug('createFolder', id, `Set 'started' status. Count: ${started}/${Object.entries(folder.containers).length}.`);
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

    folder.status = { upToDate, started, autostart, autostartStarted, managed, managerTypes: Array.from(managerTypes), expanded: false };
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

/**
 * Function to hide all tooltips
 */
const hideAllTips = () => {
    fv3Debug('hideAllTips', 'Entry');
    let tips = $.tooltipster.instances();
    fv3Debug('hideAllTips', 'Found tooltipster instances:', tips.length);
    $.each(tips, function(i, instance){
        fv3Debug('hideAllTips', `Closing instance ${i}`);
        instance.close();
    });
    fv3Debug('hideAllTips', 'Exit');
};

/**
 * Function to set the atuostart of a container in the advanced tooltip
 * @param {*} el element passed by the event caller
 */
const advancedAutostart = (el) => {
    fv3Debug('advancedAutostart', 'Entry. Event target:', el.target);
    const outbox = $(el.target).parents('.preview-outbox')[0];
    const ctid = outbox.className.match(/preview-outbox-([a-zA-Z0-9]+)/)[1]; // Ensure ctid is captured correctly
    fv3Debug('advancedAutostart', 'outbox:', outbox, `ctid: ${ctid}`);
    $(`#${ctid}`).parents('.folder-element').find('.switch-button-background').click();
    fv3Debug('advancedAutostart', `Clicked main autostart switch for container ${ctid}. Exit.`);
};

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
                pass = true;
                break;
            default:
                pass = false; // Should not happen with predefined actions
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
    // errors = errors.map(e => e.success); // This line seems to map to boolean, original used `e.text` or similar for swal

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

    if(act.type === 0) { // Standard Docker action
        fv3Debug('folderCustomAction', id, 'Action type 0 (Standard Docker).');
        // act.conatiners is an array of names. Need to map to folder.containers[name]
        const cts = act.conatiners.map(name => folder.containers[name]).filter(e => e);
        fv3Debug('folderCustomAction', id, 'Targeted containers data:', [...cts]);

        let ctAction = (e) => {}; // Placeholder
        if(act.action === 0) { // Cycle
            fv3Debug('folderCustomAction', id, `Standard action type 0 (Cycle). Mode: ${act.modes}.`);
            if(act.modes === 0) { // Start - Stop
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Cycle Start-Stop: State: ${e_ct.state}`);
                    if(e_ct.state) { // if running
                        prom.push(fv3DockerAction('stop', e_ct.id, e_ct.fullId));
                    } else { // if stopped
                        prom.push(fv3DockerAction('start', e_ct.id, e_ct.fullId));
                    }
                };
            } else if(act.modes === 1) { // Pause - Resume
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Cycle Pause-Resume: State: ${e_ct.state}, Paused: ${e_ct.pause}`);
                    if(e_ct.state) { // if running (can be paused or not)
                        if(e_ct.pause) { // if paused
                            prom.push(fv3DockerAction('resume', e_ct.id, e_ct.fullId));
                        } else { // if running but not paused
                            prom.push(fv3DockerAction('pause', e_ct.id, e_ct.fullId));
                        }
                    }
                };
            }
        } else if(act.action === 1) { // Set
            fv3Debug('folderCustomAction', id, `Standard action type 1 (Set). Mode: ${act.modes}.`);
            if(act.modes === 0) { // Start
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Set Start: State: ${e_ct.state}`);
                    if(!e_ct.state) { prom.push(fv3DockerAction('start', e_ct.id, e_ct.fullId)); }
                };
            } else if(act.modes === 1) { // Stop
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Set Stop: State: ${e_ct.state}`);
                    if(e_ct.state) { prom.push(fv3DockerAction('stop', e_ct.id, e_ct.fullId)); }
                };
            } else if(act.modes === 2) { // Pause
                ctAction = (e_ct) => {
                    fv3Debug('customAction', e_ct.id, `Set Pause: State: ${e_ct.state}, Paused: ${e_ct.pause}`);
                    if(e_ct.state && !e_ct.pause) { prom.push(fv3DockerAction('pause', e_ct.id, e_ct.fullId)); }
                };
            } else if(act.modes === 3) { // Resume
                ctAction = (e_ct) => {
                     fv3Debug('customAction', e_ct.id, `Set Resume: State: ${e_ct.state}, Paused: ${e_ct.pause}`);
                    if(e_ct.state && e_ct.pause) { prom.push(fv3DockerAction('resume', e_ct.id, e_ct.fullId)); }
                };
            }
        } else if(act.action === 2) { // Restart
            fv3Debug('folderCustomAction', id, 'Standard action type 2 (Restart).');
            ctAction = (e_ct) => {
                fv3Debug('customAction', e_ct.id, 'restart');
                prom.push(fv3DockerAction('restart', e_ct.id, e_ct.fullId));
            };
        }
        cts.forEach((e_ct_data) => { // e_ct_data is like {id: "...", state: true, ...}
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
                    action: (evt) => { evt.preventDefault(); folderCustomAction(id, i); } // evt for event
                }
            })
        );
        opts.push({ divider: true });
    } else if(!folderData.settings.default_action) { // if default actions are NOT hidden
        fv3Debug('addDockerFolderContext', id, 'Adding default action menu items.');
        opts.push({
            text: $.i18n('start'),
            icon: 'fa-play',
            action: (evt) => { evt.preventDefault(); actionFolder(id, "start"); }
        });
        opts.push({
            text: $.i18n('stop'),
            icon: 'fa-stop',
            action: (evt) => { evt.preventDefault(); actionFolder(id, "stop"); }
        });
        opts.push({
            text: $.i18n('pause'),
            icon: 'fa-pause',
            action: (evt) => { evt.preventDefault(); actionFolder(id, "pause"); }
        });
        opts.push({
            text: $.i18n('resume'),
            icon: 'fa-play-circle',
            action: (evt) => { evt.preventDefault(); actionFolder(id, "resume"); }
        });
        opts.push({
            text: $.i18n('restart'),
            icon: 'fa-refresh',
            action: (evt) => { evt.preventDefault(); actionFolder(id, "restart"); }
        });
        opts.push({ divider: true });
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

// Patching the original function to make sure the containers are rendered before insering the folder
window.listview_original = window.listview; // Ensure original is captured
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
        createFolders(); // This is async, but original listview isn't, so this runs after.
        loadedFolder = true;
         fv3Debug('Patched listview', 'Set loadedFolder to true.');
    } else {
        fv3Debug('Patched listview', 'loadedFolder is true. Skipped createFolders.');
    }
    fv3Debug('Patched listview', 'Exit.');
};

window.loadlist_original = window.loadlist; // Ensure original is captured
let fv3FolderReqPending = false;
window.loadlist = () => {
    fv3Debug('Patched loadlist', 'Entry.');

    // Only create new PHP requests if previous ones have been consumed
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
    for (const [id, value] of Object.entries(globalFolders)) {
        let loadCpu = 0;
        let totalMemB = 0;
        let loadMemB = 0;

        if (!value || !value.containers) continue;

        for (const [cid_name, cvalue] of Object.entries(value.containers)) {
            const containerShortId = cvalue.id;
            const curLoad = load[containerShortId] || { cpu: '0.00%', mem: ['0B', '0B'] };
            const cpuVal = typeof curLoad.cpu === 'number' ? curLoad.cpu : parseFloat(curLoad.cpu.replace('%', ''));
            loadCpu += divideByCore ? cpuVal / cpus : cpuVal;
            loadMemB += memToB(curLoad.mem[0]);
            let tempTotalMem = memToB(curLoad.mem[1]);
            totalMemB = Math.max(totalMemB, tempTotalMem);
        }

        $(`span.mem-folder-${id}`).text(`${bToMem(loadMemB)} / ${bToMem(totalMemB)}`);
        $(`span.cpu-folder-${id}`).text(`${loadCpu.toFixed(2)}%`);
        $(`span#cpu-folder-${id}`).css('width', `${Math.min(100, loadCpu).toFixed(2)}%`);
    }
};

// WebSocket stats state
let fv3WsLoad = {};
let fv3WsDebounceTimer = null;
let fv3UsingWebSocket = false;

const fv3InitSSEStats = () => {
    fv3Debug('init', 'requesting CPU count for SSE fallback');
    $.get('/plugins/folder.view3/server/cpu.php').promise().then((data) => {
        cpus = parseInt(data);
        fv3Debug('CPU count received', `${cpus}. Attaching SSE listener for dockerload.`);
        dockerload.addEventListener('message', (e_sse) => {
            const sseData = (typeof e_sse.data === 'string') ? e_sse.data : (typeof e_sse === 'string' ? e_sse : null);
            if (!sseData || !sseData.trim()) return;

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
            fv3UsingWebSocket = true;
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

/**
 * Convert memory unit to Bytes
 * @param {string} mem the unraid memory notation
 * @returns {number} number of bytes
 */
const memToB = (mem) => {
    if (typeof mem !== 'string') {
        fv3DebugWarn('memToB', `Input is not a string: ${mem}. Returning 0.`);
        return 0;
    }
    const unitMatch = mem.match(/[a-zA-Z]+/); // Get all letters for unit
    const unit = unitMatch ? unitMatch[0] : 'B'; // Default to B if no letters
    const numPart = parseFloat(mem.replace(unit, ''));

    if (isNaN(numPart)) {
         fv3DebugWarn('memToB', `Could not parse number from ${mem}. Returning 0.`);
        return 0;
    }

    let multiplier = 1;
    switch (unit) {
        case 'Bytes': case 'B': multiplier = 1; break; // Added Bytes
        case 'KiB': multiplier = 2 ** 10; break;
        case 'MiB': multiplier = 2 ** 20; break;
        case 'GiB': multiplier = 2 ** 30; break;
        case 'TiB': multiplier = 2 ** 40; break;
        case 'PiB': multiplier = 2 ** 50; break;
        case 'EiB': multiplier = 2 ** 60; break;
        // ZiB and YiB are rare for container mem but kept for completeness
        case 'ZiB': multiplier = 2 ** 70; break;
        case 'YiB': multiplier = 2 ** 80; break;
        default:
            fv3DebugWarn('memToB', `Unknown memory unit '${unit}' in '${mem}'. Assuming Bytes.`);
            multiplier = 1; // Default to Bytes if unit is unknown
            break;
    }
    const result = numPart * multiplier;
    return result;
};


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


// Global variables
let cpus = 1;
let loadedFolder = false;
let globalFolders = {};
const folderRegex = /^folder-/;
let folderDebugMode = !!window.FV3_DEBUG;
let folderobserver;
let folderobserverConfig = {
    subtree: true,
    attributes: true
};
let folderReq = [];

fv3Debug('init', 'globals', {
    cpus, loadedFolder, globalFolders: {...globalFolders}, folderRegex: folderRegex.toString(),
    folderDebugMode, folderobserverConfig: {...folderobserverConfig}, folderReq: [...folderReq]
});

fv3SetupResizeListeners(() => globalFolders, 'docker_listview_mode');

// Add the button for creating a folder
const createFolderBtn = () => fv3CreateFolderBtn('docker', '/Docker/Folder');

// This is needed because unraid don't like the folder and the number are set incorrectly, this intercept the request and change the numbers to make the order appear right, this is important for the autostart and to draw the folders
$.ajaxPrefilter((options, originalOptions, jqXHR) => {
    if (options.url === "/plugins/dynamix.docker.manager/include/UserPrefs.php") {
        fv3Debug('ajaxPrefilter', 'UserPrefs intercepted', {...options});
        const data = new URLSearchParams(options.data);
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

fv3Debug('init', 'docker.js loaded');