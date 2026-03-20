/**
 * Handles the creation of all folders
 */
const createFolders = async () => {
    // ########################################
    // ##########       DOCKER       ##########
    // ########################################

    // if docker is enabled
    if($('tbody#docker_view').length > 0) {

        let prom = await Promise.all(folderReq.docker);
        // Parse the results
        let folders = JSON.parse(prom[0]);
        const unraidOrder = JSON.parse(prom[1]);
        const containersInfo = JSON.parse(prom[2]);
        let order = Object.values(JSON.parse(prom[3]));
    
        // Filter the order to get the container that aren't in the order, this happen when a new container is created
        let newOnes = order.filter(x => !unraidOrder.includes(x));

        // Insert the folder in the unraid folder into the order shifted by the unlisted containers
        for (let index = 0; index < unraidOrder.length; index++) {
            const element = unraidOrder[index];
            if((folderRegex.test(element) && folders[element.slice(7)])) {
                order.splice(index+newOnes.length, 0, element);
            }
        }

        // debug mode, download the debug json file
        if(folderDebugMode) {
            const debugData = JSON.stringify({
                version: (await $.get('/plugins/folder.view3/server/version.php').promise()).trim(),
                folders,
                unraidOrder,
                originalOrder: JSON.parse(await $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise()),
                newOnes,
                order,
                containersInfo
            });
            const blob = new Blob([debugData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const element = document.createElement('a');
            element.href = url;
            element.download = 'debug-DASHBOARD-DOCKER.json';
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            URL.revokeObjectURL(url);
            console.log('Docker Order:', [...order]);
        }
    
        let foldersDone = {};

        folderEvents.dispatchEvent(new CustomEvent('docker-pre-folders-creation', {detail: {
            folders: folders,
            order: order,
            containersInfo: containersInfo
        }}));

        // Draw the folders in the order
        for (let key = 0; key < order.length; key++) {
            const container = order[key];
            if (container && folderRegex.test(container)) {
                let id = container.replace(folderRegex, '');
                if (folders[id]) {
                    key -= createFolderDocker(folders[id], id, key, order, containersInfo, Object.keys(foldersDone));
                    key -= newOnes.length;
                    // Move the folder to the done object and delete it from the undone one
                    foldersDone[id] = folders[id];
                    delete folders[id];
                }
            }
        }
    
        // Draw the foldes outside of the order
        for (const [id, value] of Object.entries(folders)) {
            // Add the folder on top of the array
            order.unshift(`folder-${id}`);
            createFolderDocker(value, id, 0, order, containersInfo, Object.keys(foldersDone));
            // Move the folder to the done object and delete it from the undone one
            foldersDone[id] = folders[id];
            delete folders[id];
        }
    
        // if started only is active hide all stopped folder
        if ($('input#apps').is(':checked')) {
            $('tbody#docker_view > tr.updated > td > div > span.outer.stopped').css('display', 'none');
        }
        fv3UpdateHidden();

        
    
        // Expand folders that are set to be expanded by default, this is here because is easier to work with all compressed folder when creating them
        for (const [id, value] of Object.entries(foldersDone)) {
            if ((globalFolders.docker && globalFolders.docker[id].status.expanded) || value.settings.expand_dashboard) {
                value.status.expanded = true;
                expandFolderDocker(id);
            }
        }

        fv3InjectExpandToggles();
        fv3UpdateGreyscale();
        fv3UpdateInsetBorders();
        fv3AutoWidthTiles();
        document.querySelectorAll('.fv3-layout-inset .folder-showcase').forEach(el => fv3ShowcaseObserver.observe(el));

        folderEvents.dispatchEvent(new CustomEvent('docker-post-folders-creation', {detail: {
            folders: folders,
            order: order,
            containersInfo: containersInfo
        }}));

        // Assing the folder done to the global object
        globalFolders.docker = foldersDone;

    }


    // ########################################
    // ##########         VMS        ##########
    // ########################################

    // if vm is enabled
    if($('tbody#vm_view').length > 0) {

        const prom = await Promise.all(folderReq.vm);
        // Parse the results
        let folders = JSON.parse(prom[0]);
        const unraidOrder = Object.values(JSON.parse(prom[1]));
        const vmInfo = JSON.parse(prom[2]);
        let order = Object.values(JSON.parse(prom[3]));
    
        // Filter the webui order to get the container that aren't in the order, this happen when a new container is created
        let newOnes = order.filter(x => !unraidOrder.includes(x));

        // Insert the folder in the unraid folder into the order shifted by the unlisted containers
        for (let index = 0; index < unraidOrder.length; index++) {
            const element = unraidOrder[index];
            if((folderRegex.test(element) && folders[element.slice(7)])) {
                order.splice(index+newOnes.length, 0, element);
            }
        }

        // debug mode, download the debug json file
        if(folderDebugMode) {
            const debugData = JSON.stringify({
                version: (await $.get('/plugins/folder.view3/server/version.php').promise()).trim(),
                folders,
                unraidOrder,
                originalOrder: JSON.parse(await $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise()),
                newOnes,
                order,
                vmInfo
            });
            const blob = new Blob([debugData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const element = document.createElement('a');
            element.href = url;
            element.download = 'debug-DASHBOARD-VM.json';
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);
            URL.revokeObjectURL(url);
            console.log('VM Order:', [...order]);
        }
    
        let foldersDone = {};

        folderEvents.dispatchEvent(new CustomEvent('vm-pre-folders-creation', {detail: {
            folders: folders,
            order: order,
            vmInfo: vmInfo
        }}));

        // Draw the folders in the order
        for (let key = 0; key < order.length; key++) {
            const container = order[key];
            if (container && folderRegex.test(container)) {
                let id = container.replace(folderRegex, '');
                if (folders[id]) {
                    key -= createFolderVM(folders[id], id, key, order, vmInfo, Object.keys(foldersDone));
                    key -= newOnes.length;
                    // Move the folder to the done object and delete it from the undone one
                    foldersDone[id] = folders[id];
                    delete folders[id];
                }
            }
        }
    
        // Draw the foldes outside of the order
        for (const [id, value] of Object.entries(folders)) {
            // Add the folder on top of the array
            order.unshift(`folder-${id}`);
            createFolderVM(value, id, 0, order, vmInfo, Object.keys(foldersDone));
            // Move the folder to the done object and delete it from the undone one
            foldersDone[id] = folders[id];
            delete folders[id];
        }

        // if started only is active hide all stopped folder
        if ($('input#vms').is(':checked')) {
            $('tbody#vm_view > tr.updated > td > div > span.outer.stopped').css('display', 'none');
        }
        fv3UpdateHidden();

        // Expand folders that are set to be expanded by default, this is here because is easier to work with all compressed folder when creating them
        for (const [id, value] of Object.entries(foldersDone)) {
            if ((globalFolders.vms && globalFolders.vms[id].status.expanded) || value.settings.expand_dashboard) {
                value.status.expanded = true;
                expandFolderVM(id);
            }
        }

        fv3InjectExpandToggles();
        fv3UpdateGreyscale();
        fv3UpdateInsetBorders();
        fv3AutoWidthTiles();
        document.querySelectorAll('.fv3-layout-inset .folder-showcase').forEach(el => fv3ShowcaseObserver.observe(el));

        folderEvents.dispatchEvent(new CustomEvent('vm-post-folders-creation', {detail: {
            folders: folders,
            order: order,
            vmInfo: vmInfo
        }}));

        globalFolders.vms = foldersDone;
    }

    folderDebugMode  = false;
};

/**
 * Handles the creation of one folder
 * @param {object} folder the folder
 * @param {string} id if of the folder
 * @param {int} position position to inset the folder
 * @param {Array<string>} order order of containers
 * @param {object} containersInfo info of the containers
 * @param {Array<string>} foldersDone folders that are done
 * @returns the number of element removed before the folder
 */
const createFolderDocker = (folder, id, position, order, containersInfo, foldersDone) => {

    folderEvents.dispatchEvent(new CustomEvent('docker-pre-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: position,
        order: order,
        containersInfo: containersInfo,
        foldersDone: foldersDone
    }}));

    // default varibles
    let upToDate = true;
    let started = 0;
    let autostart = 0;
    let autostartStarted = 0;
    let managed = 0;
    let managerTypes = new Set();
    let remBefore = 0;

    // If regex is present searches all containers for a match and put them inside the folder containers
    if (folder.regex) {
        const regex = new RegExp(folder.regex);
        folder.containers = folder.containers.concat(order.filter(el => regex.test(el)));
    }

    folder.containers = folder.containers.concat(order.filter(el => containersInfo[el]?.Labels['folder.view3'] === folder.name));

    // the HTML template for the folder
    const fld = `<div class="folder-showcase-outer-${id} folder-showcase-outer"><span class="outer solid apps stopped folder-docker"><span id="folder-id-${id}" onclick='addDockerFolderContext("${id}")' class="hand docker folder-hand-docker"><img src="${escapeHtml(folder.icon)}" class="img folder-img-docker" onerror="this.src='/plugins/dynamix.docker.manager/images/question.png';"></span><span class="inner folder-inner-docker"><span class="folder-appname-docker fv3-folder-appname">${escapeHtml(folder.name)}</span><br><i class="fa fa-square stopped red-text folder-load-status-docker"></i><span class="state folder-state-docker">${$.i18n('stopped')}</span></span><div class="folder-storage"></div></span><div class="folder-showcase-${id} folder-showcase" data-folder-name="${escapeHtml(folder.name)}"></div></div>`;

    // insertion at position of the folder
    if (position === 0) {
        $('tbody#docker_view > tr.updated > td').children().eq(position).before($(fld));
    } else {
        $('tbody#docker_view > tr.updated > td').children().eq(position - 1).after($(fld));
    }

    // new folder is needed for not altering the old containers
    let newFolder = {};

    // foldersDone is and array of only ids there is the need to add the 'folder-' in front
    foldersDone = foldersDone.map(e => 'folder-'+e);

    // remove the undone folders from the order, needed because they can cause an offset when grabbing the containers
    const cutomOrder = order.filter((e) => {
        return e && (foldersDone.includes(e) || !(folderRegex.test(e) && e !== `folder-${id}`));
    });

    // loop over the containers
    for (const container of folder.containers) {
        // get both index, tis is needed for removing from the orders later
        const index = cutomOrder.indexOf(container);
        const offsetIndex = order.indexOf(container);

        folderEvents.dispatchEvent(new CustomEvent('docker-pre-folder-preview', {detail: {
            folder: folder,
            id: id,
            position: position,
            order: order,
            containersInfo: containersInfo,
            foldersDone: foldersDone,
            container: container,
            ct: containersInfo[container],
            index: index,
            offsetIndex: offsetIndex
        }}));

        if (index > -1) {

            // Keep track of removed elements before the folder to set back the for loop for creating folders, otherwise folder will be skipped
            if(offsetIndex < position) {
                remBefore += 1;
            }

            // remove the containers from the order
            cutomOrder.splice(index, 1);
            order.splice(offsetIndex, 1);
            const ct = containersInfo[container];

            // grab the storage folder
            const element = $(`tbody#docker_view span#folder-id-${id}`).siblings('div.folder-storage');
            // grab the container by name match (not positional index, which drifts as folders remove elements)
            const $containerEl = $('tbody#docker_view > tr.updated > td').children('span.outer').not('.folder-docker').filter(function() {
                const innerText = $(this).find('span.inner').contents().first().text().trim();
                return innerText === container;
            }).first();
            $containerEl.find('span.inner').addClass('fv3-child-appname');
            element.append($containerEl.addClass(`folder-${id}-element`).addClass(`folder-element-docker`).addClass(`${!(ct.info.State.Autostart === false) ? 'autostart' : ''}`));


            newFolder[container] = {};
            newFolder[container].id = ct.shortId;
            newFolder[container].pause = ct.info.State.Paused;
            newFolder[container].state = ct.info.State.Running;
            newFolder[container].update = ct.info.State.Updated === false && ct.info.State.manager === 'dockerman';
            newFolder[container].managed = ct.info.State.manager === 'dockerman';
            newFolder[container].manager = ct.info.State.manager;

            if (folder.settings?.preview_update && newFolder[container].update) {
                $containerEl.find('.blue-text').addClass('orange-text');
            }

            if(folderDebugMode) {
                console.log(`Docker ${newFolder[container].id}(${offsetIndex}, ${index}) => ${id}`);
            }

            // set the status of the folder
            upToDate = upToDate && !newFolder[container].update;
            started += newFolder[container].state ? 1 : 0;
            const isDockerMan = ct.info.State.manager === 'dockerman';
            autostart += (isDockerMan && !(ct.info.State.Autostart === false)) ? 1 : 0;
            autostartStarted += (isDockerMan && !(ct.info.State.Autostart === false) && newFolder[container].state) ? 1 : 0;
            managerTypes.add(ct.info.State.manager);
            managed += newFolder[container].managed ? 1 : 0;

            folderEvents.dispatchEvent(new CustomEvent('docker-post-folder-preview', {detail: {
                folder: folder,
                id: id,
                position: position,
                order: order,
                containersInfo: containersInfo,
                foldersDone: foldersDone,
                container: container,
                ct: containersInfo[container],
                index: index,
                offsetIndex: offsetIndex,
                states: {
                    upToDate,
                    started,
                    autostart,
                    autostartStarted,
                    managed
                }
            }}));
        }
    }

    // replace the old containers array with the newFolder object
    folder.containers = newFolder;

    //temp var
    const sel = $(`tbody#docker_view span#folder-id-${id}`)
    
    //set the status of a folder

    if (!upToDate && managerTypes.has('dockerman')) {
        sel.next('span.inner').children().first().addClass(folder.settings?.preview_update ? 'orange-text' : 'blue-text');
    }

    if (started) {
        sel.parent().removeClass('stopped').addClass('started');
        sel.next('span.inner').children('i').replaceWith($('<i class="fa fa-play started green-text"></i>'));
        sel.next('span.inner').children('span.state').text(`${started}/${Object.entries(folder.containers).length} ${$.i18n('started')}`);
    }

    if(autostart === 0) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('no-autostart');
    } else if (autostart > 0 && autostartStarted === 0) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('autostart-off');
    } else if (autostart > 0 && autostartStarted > 0 && autostart !== autostartStarted) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('autostart-partial');
    } else if (autostart > 0 && autostartStarted > 0 && autostart === autostartStarted) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('autostart-full');
    }

    if(managed === 0) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('no-managed');
    } else if (managed > 0 && managed < Object.values(folder.containers).length) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('managed-partial');
    } else if (managed > 0 && managed === Object.values(folder.containers).length) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('managed-full');
    }

    // set the status
    folder.status = {};
    folder.status.upToDate = upToDate;
    folder.status.started = started;
    folder.status.autostart = autostart;
    folder.status.autostartStarted = autostartStarted;
    folder.status.managed = managed;
    folder.status.managerTypes = Array.from(managerTypes);
    folder.status.expanded = false;

    folderEvents.dispatchEvent(new CustomEvent('docker-post-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: position,
        order: order,
        containersInfo: containersInfo,
        foldersDone: foldersDone
    }}));

    return remBefore;
};

/**
 * Handles the creation of one folder
 * @param {object} folder the folder
 * @param {string} id if of the folder
 * @param {int} position position to inset the folder
 * @param {Array<string>} order order of vms
 * @param {object} vmInfo info of the vms
 * @param {Array<string>} foldersDone folders that are done
 * @returns the number of element removed before the folder
 */
const createFolderVM = (folder, id, position, order, vmInfo, foldersDone) => {

    folderEvents.dispatchEvent(new CustomEvent('vm-pre-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: position,
        order: order,
        vmInfo: vmInfo,
        foldersDone: foldersDone
    }}));

    // default varibles
    let started = 0;
    let autostart = 0;
    let autostartStarted = 0;
    let remBefore = 0;

    // If regex is present searches all containers for a match and put them inside the folder containers
    if (folder.regex) {
        const regex = new RegExp(folder.regex);
        folder.containers = folder.containers.concat(order.filter(el => regex.test(el)));
    }

    // the HTML template for the folder
    const fld = `<div class="folder-showcase-outer-${id} folder-showcase-outer"><span class="outer solid vms stopped folder-vm"><span id="folder-id-${id}" onclick='addVMFolderContext("${id}")' class="hand vm folder-hand-vm"><img src="${escapeHtml(folder.icon)}" class="img folder-img-vm" onerror='this.src="/plugins/dynamix.docker.manager/images/question.png"'></span><span class="inner folder-inner-vm"><span class="folder-appname-vm fv3-folder-appname">${escapeHtml(folder.name)}</span><br><i class="fa fa-square stopped red-text folder-load-status-vm"></i><span class="state folder-state-vm">${$.i18n('stopped')}</span></span><div class="folder-storage" style="display:none"></div></span><div class="folder-showcase-${id} folder-showcase" data-folder-name="${escapeHtml(folder.name)}"></div></div>`;

    // insertion at position of the folder
    if (position === 0) {
        $('tbody#vm_view > tr.updated > td').children().eq(position).before($(fld));
    } else {
        $('tbody#vm_view > tr.updated > td').children().eq(position - 1).after($(fld));
    }

    // new folder is needed for not altering the old containers
    let newFolder = {};

    // foldersDone is and array of only ids there is the need to add the 'folder-' in front
    foldersDone = foldersDone.map(e => 'folder-'+e);

    // remove the undone folders from the order, needed because they can cause an offset when grabbing the containers
    const cutomOrder = order.filter((e) => {
        return e && (foldersDone.includes(e) || !(folderRegex.test(e) && e !== `folder-${id}`));
    });

    // loop over the containers
    for (const container of folder.containers) {
        // get both index, tis is needed for removing from the orders later
        const index = cutomOrder.indexOf(container);
        const offsetIndex = order.indexOf(container);

        folderEvents.dispatchEvent(new CustomEvent('vm-pre-folder-preview', {detail: {
            folder: folder,
            id: id,
            position: position,
            order: order,
            vmInfo: vmInfo,
            foldersDone: foldersDone,
            vm: container,
            ct: vmInfo[container],
            index: index,
            offsetIndex: offsetIndex
        }}));

        if (index > -1) {

            // Keep track of removed elements before the folder to set back the for loop for creating folders, otherwise folder will be skipped
            if(offsetIndex < position) {
                remBefore += 1;
            }

            // remove the containers from the order
            cutomOrder.splice(index, 1);
            order.splice(offsetIndex, 1);

            // add the id to the container name 
            const ct = vmInfo[container];
            newFolder[container] = {};
            newFolder[container].id = ct.uuid;
            newFolder[container].state = ct.state;

            // grab the container by name match (not positional index, which drifts as folders remove elements)
            const $vmEl = $('tbody#vm_view > tr.updated > td').children('span.outer').not('.folder-vm').filter(function() {
                const innerText = $(this).find('span.inner').contents().first().text().trim();
                return innerText === container;
            }).first();
            $vmEl.find('span.inner').addClass('fv3-child-appname');
            $(`tbody#vm_view span#folder-id-${id}`).siblings('div.folder-storage').append($vmEl.addClass(`folder-${id}-element`).addClass(`folder-element-vm`).addClass(`${ct.autostart ? 'autostart' : ''}`));

            if(folderDebugMode) {
                console.log(`VM ${newFolder[container].id}(${offsetIndex}, ${index}) => ${id}`);
            }
            
            // set the status of the folder
            started += ct.state!=="shutoff" ? 1 : 0;
            autostart += ct.autostart ? 1 : 0;
            autostartStarted += (ct.autostart && ct.state!=="shutoff") ? 1 : 0;

            folderEvents.dispatchEvent(new CustomEvent('vm-post-folder-preview', {detail: {
                folder: folder,
                id: id,
                position: position,
                order: order,
                vmInfo: vmInfo,
                foldersDone: foldersDone,
                vm: container,
                ct: vmInfo[container],
                index: index,
                offsetIndex: offsetIndex,
                states: {
                    started,
                    autostart,
                    autostartStarted
                }
            }}));
        }
    }

    // replace the old containers array with the newFolder object
    folder.containers = newFolder;

    
    //set tehe status of a folder
    if (started) {
        const sel = $(`tbody#vm_view span#folder-id-${id}`);
        sel.parent().removeClass('stopped').addClass('started');
        sel.next('span.inner').children('i').replaceWith($('<i class="fa fa-play started green-text"></i>'));
        sel.next('span.inner').children('span.state').text(`${started}/${Object.entries(folder.containers).length} ${$.i18n('started')}`);
    }

    if(autostart === 0) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('no-autostart');
    } else if (autostart > 0 && autostartStarted === 0) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('autostart-off');
    } else if (autostart > 0 && autostartStarted > 0 && autostart !== autostartStarted) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('autostart-partial');
    } else if (autostart > 0 && autostartStarted > 0 && autostart === autostartStarted) {
        $(`.folder-showcase-outer-${id}, .folder-showcase-outer-${id} > span.outer`).addClass('autostart-full');
    }

    // set the status
    folder.status = {};
    folder.status.started = started;
    folder.status.autostart = autostart;
    folder.status.autostartStarted = autostartStarted;
    folder.status.expanded = false;

    folderEvents.dispatchEvent(new CustomEvent('vm-post-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: position,
        order: order,
        vmInfo: vmInfo,
        foldersDone: foldersDone
    }}));

    return remBefore;
};

/**
 * Handle the dropdown expand button of folders
 * @param {string} id the id of the folder
 */
const expandFolderDocker = (id) => {
    folderEvents.dispatchEvent(new CustomEvent('docker-pre-folder-expansion', {detail: { id }}));
    const el = $(`tbody#docker_view > tr.updated > td span.outer.apps > span#folder-id-${id}`);
    const state = el.attr('expanded') === "true";
    const outer = $(`.folder-showcase-outer-${id}`);
    if (state) {
        // Collapsing: retrieve children from fullwidth panel if present
        const panel = outer.data('fv3-panel');
        if (panel) {
            el.parents().siblings('div.folder-showcase').append(panel.children());
            panel.remove();
            outer.removeData('fv3-panel');
        }
        el.siblings('div.folder-storage').append(el.parents().siblings('div.folder-showcase').children());
        el.attr('expanded', 'false');
    } else {
        el.parents().siblings('div.folder-showcase').append(el.siblings('div.folder-storage').children());
        el.attr('expanded', 'true');
    }
    outer.attr('expanded', !state ? 'true' : 'false');
    if(globalFolders.docker) {
        globalFolders.docker[id].status.expanded = !state;
    }
    if (dockerDashboardLayout === 'fullwidth' && fv3LayoutReady) {
        fv3FullwidthExpand(id, 'docker');
    }
    fv3InjectExpandToggles();
    fv3UpdateGreyscale();
    fv3UpdateInsetBorders();
    fv3AutoWidthTiles();
    folderEvents.dispatchEvent(new CustomEvent('docker-post-folder-expansion', {detail: { id }}));
};

/**
 * Handle the dropdown expand button of folders
 * @param {string} id the id of the folder
 */
const expandFolderVM = (id) => {
    folderEvents.dispatchEvent(new CustomEvent('vm-pre-folder-expansion', {detail: { id }}));
    const el = $(`tbody#vm_view > tr.updated > td span.outer.vms > span#folder-id-${id}`);
    const state = el.attr('expanded') === "true";
    const outer = $(`.folder-showcase-outer-${id}`);
    if (state) {
        const panel = outer.data('fv3-panel');
        if (panel) {
            el.parents().siblings('div.folder-showcase').append(panel.children());
            panel.remove();
            outer.removeData('fv3-panel');
        }
        el.siblings('div.folder-storage').append(el.parents().siblings('div.folder-showcase').children());
        el.attr('expanded', 'false');
    } else {
        el.parents().siblings('div.folder-showcase').append(el.siblings('div.folder-storage').children());
        el.attr('expanded', 'true');
    }
    outer.attr('expanded', !state ? 'true' : 'false');
    if(globalFolders.vms) {
        globalFolders.vms[id].status.expanded = !state;
    }
    if (vmDashboardLayout === 'fullwidth' && fv3LayoutReady) {
        fv3FullwidthExpand(id, 'vm');
    }
    fv3InjectExpandToggles();
    fv3UpdateGreyscale();
    fv3UpdateInsetBorders();
    fv3AutoWidthTiles();
    folderEvents.dispatchEvent(new CustomEvent('vm-post-folder-expansion', {detail: { id }}));
};

/**
 * Removie the folder
 * @param {string} id the id of the folder
 */
const rmDockerFolder = (id) => {
    // Ask for a confirmation
    swal({
        title: $.i18n('are-you-sure'),
        text: `${$.i18n('remove-folder')}: ${escapeHtml(globalFolders.docker[id].name)}`,
        type: 'warning',
        html: true,
        showCancelButton: true,
        confirmButtonText: $.i18n('yes-delete'),
        cancelButtonText: $.i18n('cancel'),
        showLoaderOnConfirm: true
    },
    async (c) => {
        if (!c) { setTimeout(loadlist); return; }
        $('div.spinner.fixed').show('slow');
        await $.post('/plugins/folder.view3/server/delete.php', { type: 'docker', id: id }).promise();
        loadedFolder = false;
        setTimeout(loadlist(), 500)
    });
};

/**
 * Removie the folder
 * @param {string} id the id of the folder
 */
const rmVMFolder = (id) => {
    // Ask for a confirmation
    swal({
        title: $.i18n('are-you-sure'),
        text: `${$.i18n('remove-folder')}: ${escapeHtml(globalFolders.vms[id].name)}`,
        type: 'warning',
        html: true,
        showCancelButton: true,
        confirmButtonText: $.i18n('yes-delete'),
        cancelButtonText: $.i18n('cancel'),
        showLoaderOnConfirm: true
    },
    async (c) => {
        if (!c) { setTimeout(loadlist); return; }
        $('div.spinner.fixed').show('slow');
        await $.post('/plugins/folder.view3/server/delete.php', { type: 'vm', id: id }).promise();
        loadedFolder = false;
        setTimeout(loadlist(), 500)
    });
};

/**
 * Redirect to the page to edit the folder
 * @param {string} id the id of the folder
 */
const editDockerFolder = (id) => {
    location.href = location.pathname + "/Folder?type=docker&id=" + id;
};

/**
 * Redirect to the page to edit the folder
 * @param {string} id the id of the folder
 */
const editVMFolder = (id) => {
    location.href = location.pathname + "/Folder?type=vm&id=" + id;
};

/**
 * Execute the desired custom action
 * @param {string} id 
 * @param {number} action 
 */
const folderDockerCustomAction = async (id, action) => {
    $('div.spinner.fixed').show('slow');
    const folder = globalFolders.docker[id];
    let act = folder.actions[action];
    let prom = [];
    if(act.type === 0) {
        const cts = act.conatiners.map(e => folder.containers[e]).filter(e => e);
        let ctAction = (e) => {};
        if(act.action === 0) {

            if(act.modes === 0) {
                ctAction = (e) => {
                    if(e.state) {
                        prom.push($.post(eventURL, {action: 'stop', container:e.id}, null,'json').promise());
                    } else {
                        prom.push($.post(eventURL, {action: 'start', container:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e) => {
                    if(e.state) {
                        if(e.pause) {
                            prom.push($.post(eventURL, {action: 'resume', container:e.id}, null,'json').promise());
                        } else {
                            prom.push($.post(eventURL, {action: 'pause', container:e.id}, null,'json').promise());
                        }
                    }
                };
            }

        } else if(act.action === 1) {

            if(act.modes === 0) {
                ctAction = (e) => {
                    if(!e.state) {
                        prom.push($.post(eventURL, {action: 'start', container:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e) => {
                    if(e.state) {
                        prom.push($.post(eventURL, {action: 'stop', container:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 2) {
                ctAction = (e) => {
                    if(e.state && !e.pause) {
                        prom.push($.post(eventURL, {action: 'pause', container:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 3) {
                ctAction = (e) => {
                    if(e.state && e.pause) {
                        prom.push($.post(eventURL, {action: 'resume', container:e.id}, null,'json').promise());
                    }
                };
            }

        } else if(act.action === 2) {

            ctAction = (e) => {
                prom.push($.post(eventURL, {action: 'restart', container:e.id}, null,'json').promise());
            };

        }

        cts.forEach((e) => {
            ctAction(e);
        });
    } else if(act.type === 1) {
        const args = act.script_args || '';
        if(act.script_sync) {
            let scriptVariables = {}
            let rawVars = await $.post("/plugins/user.scripts/exec.php",{action:'getScriptVariables',script:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`}).promise();
            rawVars.trim().split('\n').forEach((e) => { const variable = e.split('='); scriptVariables[variable[0]] = variable[1] });
            if(scriptVariables['directPHP']) {
                $.post("/plugins/user.scripts/exec.php",{action:'directRunScript',path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`},function(data) {if(data) { openBox(data,act.name,800,1200, 'loadlist');}})
            } else {
                $.post("/plugins/user.scripts/exec.php",{action:'convertScript',path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`},function(data) {if(data) {openBox('/plugins/user.scripts/startScript.sh&arg1='+data+'&arg2='+args,act.name,800,1200,true, 'loadlist');}});
            }
        } else {
            const cmd = await $.post("/plugins/user.scripts/exec.php",{action:'convertScript', path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`}).promise();
            prom.push($.get('/logging.htm?cmd=/plugins/user.scripts/backgroundScript.sh&arg1='+cmd+'&arg2='+args+'&csrf_token='+csrf_token+'&done=Done').promise());
        }
    }

    await Promise.all(prom);

    loadlist();
    $('div.spinner.fixed').hide('slow');
};

/**
 * Atach the menu when clicking the folder icon
 * @param {string} id the id of the folder
 */
const addDockerFolderContext = (id) => {
    // get the expanded status, needed to swap expand/ compress
    const exp = $(`tbody#docker_view .folder-showcase-outer-${id}`).attr('expanded') === "true";
    let opts = [];
    context.settings({
        right: false,
        above: false
    });

    opts.push({
        text: exp ? $.i18n('compress') : $.i18n('expand'),
        icon: exp ? 'fa-minus' : 'fa-plus',
        action: (e) => { e.preventDefault(); expandFolderDocker(id); }
    });

    opts.push({
        divider: true
    });

    if (globalFolders.docker[id].settings.folder_webui && globalFolders.docker[id].settings.folder_webui_url) {
        opts.push({
            text: $.i18n('webui'),
            icon: 'fa-globe',
            action: (e) => { e.preventDefault(); window.open(globalFolders.docker[id].settings.folder_webui_url, '_blank'); }
        });
        opts.push({ divider: true });
    }

    if(globalFolders.docker[id].settings.override_default_actions && globalFolders.docker[id].actions && globalFolders.docker[id].actions.length) {
        opts.push(
            ...globalFolders.docker[id].actions.map((e, i) => {
                return {
                    text: e.name,
                    icon: e.script_icon || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderCustomAction(id, i); }
                }
            })
        );
    
        opts.push({
            divider: true
        });

    } else if(!globalFolders.docker[id].settings.default_action) {
        opts.push({
            text: $.i18n('start'),
            icon: 'fa-play',
            action: (e) => { e.preventDefault(); actionFolderDocker(id, "start"); }
        });
        opts.push({
            text: $.i18n('stop'),
            icon: 'fa-stop',
            action: (e) => { e.preventDefault(); actionFolderDocker(id, "stop"); }
        });
        
        opts.push({
            text: $.i18n('pause'),
            icon: 'fa-pause',
            action: (e) => { e.preventDefault(); actionFolderDocker(id, "pause"); }
        });
    
        opts.push({
            text: $.i18n('resume'),
            icon: 'fa-play-circle',
            action: (e) => { e.preventDefault(); actionFolderDocker(id, "resume"); }
        });
    
        opts.push({
            text: $.i18n('restart'),
            icon: 'fa-refresh',
            action: (e) => { e.preventDefault(); actionFolderDocker(id, "restart"); }
        });
    
        opts.push({
            divider: true
        });
    }

    if(globalFolders.docker[id].status.managed > 0) {
        if(!globalFolders.docker[id].status.upToDate) {
            opts.push({
                text: $.i18n('update'),
                icon: 'fa-cloud-download',
                action: (e) => { e.preventDefault();  updateFolderDocker(id); }
            });
        } else {
            opts.push({
                text: $.i18n('update-force'),
                icon: 'fa-cloud-download',
                action: (e) => { e.preventDefault(); forceUpdateFolderDocker(id); }
            });
        }
        
        opts.push({
            divider: true
        });
    }

    opts.push({
        text: $.i18n('edit'),
        icon: 'fa-wrench',
        action: (e) => { e.preventDefault(); editDockerFolder(id); }
    });

    opts.push({
        text: $.i18n('remove'),
        icon: 'fa-trash',
        action: (e) => { e.preventDefault(); rmDockerFolder(id); }
    });

    if(!globalFolders.docker[id].settings.override_default_actions && globalFolders.docker[id].actions && globalFolders.docker[id].actions.length) {
        opts.push({
            divider: true
        });

        opts.push({
            text: $.i18n('custom-actions'),
            icon: 'fa-bars',
            subMenu: globalFolders.docker[id].actions.map((e, i) => {
                return {
                    text: e.name,
                    icon: e.script_icon || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderDockerCustomAction(id, i); }
                }
            })
        });
    }

    folderEvents.dispatchEvent(new CustomEvent('docker-folder-context', {detail: { id, opts }}));

    context.attach(`#folder-id-${id}`, opts);
};

/**
 * Force update all the containers inside a folder
 * @param {string} id the id of the folder
 */
const forceUpdateFolderDocker = (id) => {
    const folder = globalFolders.docker[id];
    openDocker('update_container ' + Object.entries(folder.containers).filter(([k, v]) => v.managed).map(e => e[0]).join('*'), $.i18n('updating', folder.name),'','loadlist');
};

/**
 * Update all the updatable containers inside a folder
 * @param {string} id the id of the folder
 */
const updateFolderDocker = (id) => {
    const folder = globalFolders.docker[id];
    openDocker('update_container ' + Object.entries(folder.containers).filter(([k, v]) => v.managed && v.update).map(e => e[0]).join('*'), $.i18n('updating', folder.name),'','loadlist');
};

/**
 * Perform an action for the entire folder
 * @param {string} id The id of the folder
 * @param {string} action the desired action
 */
const actionFolderDocker = async (id, action) => {
    const folder =  globalFolders.docker[id];
    const cts = Object.keys(folder.containers);
    let proms = [];
    let errors;

    $(`i#load-folder-${id}`).removeClass('fa-play fa-square fa-pause').addClass('fa-refresh fa-spin');
    $('div.spinner.fixed').show('slow');

    for (let index = 0; index < cts.length; index++) {
        const ct = folder.containers[cts[index]];
        const cid = ct.id;
        let pass;
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
            case "resume":
                pass = true;
                break;
            default:
                pass = false;
                break;
        }
        if(pass) {
            proms.push($.post(eventURL, {action: action, container:cid}, null,'json').promise());
        }
    }

    proms = await Promise.all(proms);
    errors = proms.filter(e => e.success !== true);
    errors = errors.map(e => e.success);

    if(errors.length > 0) {
        swal({
            title: $.i18n('exec-error'),
            text:errors.join('<br>'),
            type:'error',
            html:true,
            confirmButtonText:'Ok'
        }, loadlist);
    }

    loadlist();
    $('div.spinner.fixed').hide('slow');
}

/**
 * Execute the desired custom action
 * @param {string} id 
 * @param {number} action 
 */
const folderVMCustomAction = async (id, action) => {
    $('div.spinner.fixed').show('slow');
    const eventURL = '/plugins/dynamix.vm.manager/include/VMajax.php';
    const folder = globalFolders.vms[id];
    let act = folder.actions[action];
    let prom = [];
    if(act.type === 0) {
        const cts = act.conatiners.map(e => folder.containers[e]).filter(e => e);
        let ctAction = (e) => {};
        if(act.action === 0) {

            if(act.modes === 0) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push($.post(eventURL, {action: 'stop', uuid:e.id}, null,'json').promise());
                    } else if(e.state !== "running" && e.state !== "pmsuspended" && e.state !== "paused" && e.state !== "unknown"){
                        prom.push($.post(eventURL, {action: 'domain-start', uuid:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push($.post(eventURL, {action: 'domain-pause', uuid:e.id}, null,'json').promise());
                    } else if(e.state === "paused" || e.state === "unknown") {
                        prom.push($.post(eventURL, {action: 'domain-resume', uuid:e.id}, null,'json').promise());
                    }
                };
            }

        } else if(act.action === 1) {

            if(act.modes === 0) {
                ctAction = (e) => {
                    if(e.state !== "running" && e.state !== "pmsuspended" && e.state !== "paused" && e.state !== "unknown") {
                        prom.push($.post(eventURL, {action: 'domain-start', uuid:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push($.post(eventURL, {action: 'domain-stop', uuid:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 2) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push($.post(eventURL, {action: 'domain-pause', uuid:e.id}, null,'json').promise());
                    }
                };
            } else if(act.modes === 3) {
                ctAction = (e) => {
                    if(e.state === "paused" || e.state === "unknown") {
                        prom.push($.post(eventURL, {action: 'domain-restart', uuid:e.id}, null,'json').promise());
                    }
                };
            }

        } else if(act.action === 2) {

            ctAction = (e) => {
                if(e.state === "running") {
                    prom.push($.post(eventURL, {action: 'domain-pause', uuid:e.id}, null,'json').promise());
                }
            };

        }

        cts.forEach((e) => {
            ctAction(e);
        });
    } else if(act.type === 1) {
        const args = act.script_args || '';
        if(act.script_sync) {
            let scriptVariables = {}
            let rawVars = await $.post("/plugins/user.scripts/exec.php",{action:'getScriptVariables',script:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`}).promise();
            rawVars.trim().split('\n').forEach((e) => { const variable = e.split('='); scriptVariables[variable[0]] = variable[1] });
            if(scriptVariables['directPHP']) {
                $.post("/plugins/user.scripts/exec.php",{action:'convertScript',path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`},function(data) {if(data) {openBox('/plugins/user.scripts/startScript.sh&arg1='+data+'&arg2='+args,act.name,800,1200,true, 'loadlist');}});
            } else {
                $.post("/plugins/user.scripts/exec.php",{action:'convertScript',path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`},function(data) {if(data) {openBox('/plugins/user.scripts/startScript.sh&arg1='+data+'&arg2=',act.name,800,1200,true, 'loadlist');}});
            }
        } else {
            const cmd = await $.post("/plugins/user.scripts/exec.php",{action:'convertScript', path:`/boot/config/plugins/user.scripts/scripts/${act.script}/script`}).promise();
            prom.push($.get('/logging.htm?cmd=/plugins/user.scripts/backgroundScript.sh&arg1='+cmd+'&arg2='+args+'&csrf_token='+csrf_token+'&done=Done').promise());
        }
    }

    await Promise.all(prom);

    loadlist();
    $('div.spinner.fixed').hide('slow');
};

/**
 * Atach the menu when clicking the folder icon
 * @param {string} id the id of the folder
 */
const addVMFolderContext = (id) => {
    // get the expanded status, needed to swap expand/ compress
    const exp = $(`tbody#vm_view .folder-showcase-outer-${id}`).attr('expanded') === "true";
    let opts = [];
    context.settings({
        right: false,
        above: false
    });

    opts.push({
        text: exp ? $.i18n('compress') : $.i18n('expand'),
        icon: exp ? 'fa-minus' : 'fa-plus',
        action: (e) => { e.preventDefault(); expandFolderVM(id); }
    });

    opts.push({
        divider: true
    });

    if(globalFolders.vms[id].settings.override_default_actions && globalFolders.vms[id].actions && globalFolders.vms[id].actions.length) {
        opts.push(
            ...globalFolders.vms[id].actions.map((e, i) => {
                return {
                    text: e.name,
                    icon: e.script_icon || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderCustomAction(id, i); }
                }
            })
        );
    
        opts.push({
            divider: true
        });

    } else if(!globalFolders.vms[id].settings.default_action) {
        opts.push({
            text: $.i18n('start'),
            icon: "fa-play",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-start'); }
        });
    
        opts.push({
            text: $.i18n('stop'),
            icon: "fa-stop",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-stop'); }
        });
    
        opts.push({
            text: $.i18n('pause'),
            icon: "fa-pause",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-pause'); }
        });
    
        opts.push({
            text: $.i18n('resume'),
            icon: "fa-play-circle",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-resume'); }
        });
    
        opts.push({
            text: $.i18n('restart'),
            icon: "fa-refresh",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-restart'); }
        });
    
        opts.push({
            text: $.i18n('hibernate'),
            icon: "fa-bed",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-pmsuspend'); }
        });
    
        opts.push({
            text: $.i18n('force-stop'),
            icon: "fa-bomb",
            action: (e) => { e.preventDefault(); actionFolderVM(id, 'domain-destroy'); }
        });
    
        opts.push({
            divider: true
        });
    }


    opts.push({
        text: $.i18n('edit'),
        icon: 'fa-wrench',
        action: (e) => { e.preventDefault(); editVMFolder(id); }
    });

    opts.push({
        text: $.i18n('remove'),
        icon: 'fa-trash',
        action: (e) => { e.preventDefault(); rmVMFolder(id); }
    });

    if(!globalFolders.vms[id].settings.override_default_actions && globalFolders.vms[id].actions && globalFolders.vms[id].actions.length) {
        opts.push({
            divider: true
        });

        opts.push({
            text: $.i18n('custom-actions'),
            icon: 'fa-bars',
            subMenu: globalFolders.vms[id].actions.map((e, i) => {
                return {
                    text: e.name,
                    icon: e.script_icon || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderVMCustomAction(id, i); }
                }
            })
        });
    }

    folderEvents.dispatchEvent(new CustomEvent('vm-folder-context', {detail: { id, opts }}));

    context.attach(`#folder-id-${id}`, opts);
};

/**
 * Perform an action for the entire folder
 * @param {string} id The id of the folder
 * @param {string} action the desired action
 */
const actionFolderVM = async (id, action) => {
    const folder =  globalFolders.vms[id];
    const cts = Object.keys(folder.containers);
    let proms = [];
    let errors;
    const oldAction = action;

    $(`i#load-folder-${id}`).removeClass('fa-play fa-square fa-pause').addClass('fa-refresh fa-spin');
    $('div.spinner.fixed').show('slow');

    for (let index = 0; index < cts.length; index++) {
        const ct = folder.containers[cts[index]];
        const cid = ct.id;
        let pass;
        action = oldAction;
        switch (action) {
            case "domain-start":
                pass = ct.state !== "running" && ct.state !== "pmsuspended" && ct.state !== "paused" && ct.state !== "unknown";
                break;
            case "domain-stop":
            case "domain-pause":
            case "domain-restart":
            case "domain-pmsuspend":
                pass = ct.state === "running";
                break;
            case "domain-resume":
                pass = ct.state === "paused" || ct.state === "unknown";
                if(!pass) {
                    pass = ct.state === "pmsuspended";
                    action = "domain-pmwakeup";
                }
                break;
            case "domain-destroy":
                pass = ct.state === "running" || ct.state === "pmsuspended" || ct.state === "paused" || ct.state === "unknown";
                break;
            default:
                pass = false;
                break;
        }
        if(pass) {
            proms.push($.post('/plugins/dynamix.vm.manager/include/VMajax.php', {action: action, uuid: cid}, null,'json').promise());
        }
    }

    proms = await Promise.all(proms);
    errors = proms.filter(e => e.success !== true);
    errors = errors.map(e => e.success);

    if(errors.length > 0) {
        swal({
            title: $.i18n('exec-error'),
            text:errors.join('<br>'),
            type:'error',
            html:true,
            confirmButtonText:'Ok'
        }, loadlist);
    }

    loadlist();
    $('div.spinner.fixed').hide('slow');
}

// Global variables
let loadedFolder = false;
let globalFolders = {};
const folderRegex = /^folder-/;
let folderDebugMode = false;
let folderDebugModeWindow = [];
let dockerDashboardLayout = 'classic';
let vmDashboardLayout = 'classic';
let fv3DockerExpandToggle = false;
let fv3VmExpandToggle = false;
let fv3DockerGreyscale = false;
let fv3VmGreyscale = false;
let fv3DockerShowLabel = true;
let fv3VmShowLabel = true;
let fv3LayoutReady = false;
const fv3SettingsReq = $.get('/plugins/folder.view3/server/read_settings.php').promise().then(r => {
    try {
        const s = JSON.parse(r);
        if (s.dashboard_docker_layout) dockerDashboardLayout = s.dashboard_docker_layout;
        if (s.dashboard_vm_layout) vmDashboardLayout = s.dashboard_vm_layout;
        fv3DockerExpandToggle = s.dashboard_docker_expand_toggle === 'yes';
        fv3VmExpandToggle = s.dashboard_vm_expand_toggle === 'yes';
        fv3DockerGreyscale = s.dashboard_docker_greyscale === 'yes';
        fv3VmGreyscale = s.dashboard_vm_greyscale === 'yes';
        fv3DockerShowLabel = s.dashboard_docker_folder_label !== 'no';
        fv3VmShowLabel = s.dashboard_vm_folder_label !== 'no';
    } catch(e) {}
});

const applyDashboardLayouts = () => {
    const layouts = ['fv3-layout-classic', 'fv3-layout-fullwidth', 'fv3-layout-accordion', 'fv3-layout-inset'];
    const dockerTd = $('tbody#docker_view > tr.updated > td');
    const vmTd = $('tbody#vm_view > tr.updated > td');
    dockerTd.removeClass(layouts.join(' ')).addClass('fv3-layout-' + dockerDashboardLayout);
    vmTd.removeClass(layouts.join(' ')).addClass('fv3-layout-' + vmDashboardLayout);
    dockerTd.toggleClass('fv3-label-hidden', !fv3DockerShowLabel);
    vmTd.toggleClass('fv3-label-hidden', !fv3VmShowLabel);
};

const fv3InjectExpandToggles = () => {
    document.querySelectorAll('.folder-showcase-outer').forEach(outer => {
        const expanded = outer.getAttribute('expanded') === 'true';
        const tab = outer.querySelector(':scope > span.outer');
        if (!tab) return;
        const isDocker = outer.querySelector('.folder-appname-docker') !== null;
        const enabled = isDocker ? fv3DockerExpandToggle : fv3VmExpandToggle;
        const isInset = outer.closest('.fv3-layout-inset') !== null;
        const isClassic = outer.closest('.fv3-layout-classic') !== null;
        const isFullwidth = outer.closest('.fv3-layout-fullwidth') !== null;
        const inner = tab.querySelector('span.inner');
        tab.classList.toggle('fv3-expanded-tab', expanded);
        if (expanded && enabled && !isClassic && !isFullwidth) {
            if (inner) {
                inner.style.width = 'auto';
                inner.style.whiteSpace = 'nowrap';
            }
            if (!isInset) {
                tab.style.display = 'inline-flex';
                tab.style.alignItems = 'center';
            }
        } else {
            if (inner) {
                inner.style.width = '';
                inner.style.whiteSpace = '';
            }
            if (!isInset) {
                tab.style.display = '';
                tab.style.alignItems = '';
            }
        }
        if (!enabled || !expanded || isClassic) {
            outer.querySelectorAll('.fv3-expand-toggle').forEach(el => el.remove());
            return;
        }
        if (outer.querySelector('.fv3-expand-toggle')) return;
        const idEl = outer.querySelector('[id^="folder-id-"]');
        if (!idEl) return;
        const id = idEl.id.replace('folder-id-', '');
        const btn = document.createElement('button');
        btn.className = 'fv3-expand-toggle';
        btn.innerHTML = '<i class="fa fa-chevron-up" aria-hidden="true"></i>';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isDocker) expandFolderDocker(id);
            else expandFolderVM(id);
        });
        if (isInset) {
            tab.appendChild(btn);
        } else {
            if (inner) inner.after(btn);
        }
    });
    requestAnimationFrame(() => {
        fv3PositionChevrons();
        fv3UpdateInsetBorders();
    });
};

const fv3PositionChevrons = () => {
    document.querySelectorAll('.fv3-layout-inset .fv3-expand-toggle').forEach(btn => {
        const tab = btn.closest('span.outer');
        if (!tab) return;
        const appname = tab.querySelector('.fv3-folder-appname');
        const state = tab.querySelector('.state');
        if (!appname) return;
        const tabRect = tab.getBoundingClientRect();
        const nameRect = appname.getBoundingClientRect();
        const stateRect = state?.getBoundingClientRect();
        const contentRight = Math.max(nameRect.right, stateRect?.right || 0) - tabRect.left;
        btn.style.left = (contentRight + 10) + 'px';
        btn.style.right = 'auto';
        btn.style.top = (tab.offsetHeight / 2) + 'px';
        btn.style.transform = 'translateY(-50%)';
    });
    document.querySelectorAll('.fv3-layout-fullwidth .fv3-expand-toggle').forEach(btn => {
        const tab = btn.closest('span.outer');
        if (!tab) return;
        const appname = tab.querySelector('.fv3-folder-appname');
        if (!appname) return;
        const tabRect = tab.getBoundingClientRect();
        const nameRect = appname.getBoundingClientRect();
        const ideal = nameRect.right - tabRect.left + 10;
        const max = tabRect.width - 24;
        btn.style.left = Math.min(ideal, max) + 'px';
        btn.style.right = 'auto';
        btn.style.top = (nameRect.top - tabRect.top + nameRect.height / 2) + 'px';
        btn.style.transform = 'translateY(-50%)';
    });
};

const fv3UpdateGreyscale = () => {
    const dockerTd = $('tbody#docker_view > tr.updated > td');
    const vmTd = $('tbody#vm_view > tr.updated > td');
    if (!fv3DockerGreyscale) {
        dockerTd.removeClass('fv3-greyscale-active');
    } else {
        dockerTd.toggleClass('fv3-greyscale-active', dockerTd.find('.folder-showcase-outer[expanded="true"]').length > 0);
    }
    if (!fv3VmGreyscale) {
        vmTd.removeClass('fv3-greyscale-active');
    } else {
        vmTd.toggleClass('fv3-greyscale-active', vmTd.find('.folder-showcase-outer[expanded="true"]').length > 0);
    }
};

const fv3UpdateInsetBorders = () => {
    requestAnimationFrame(() => {
        document.querySelectorAll('.fv3-inset-border').forEach(el => el.remove());
        document.querySelectorAll('.fv3-layout-inset .folder-showcase-outer[expanded="true"]').forEach(outer => {
            const tab = outer.querySelector(':scope > span.outer');
            const showcase = outer.querySelector('.folder-showcase');
            const visibleChildren = showcase.querySelectorAll(':scope > span.outer:not([style*="display: none"])');
            if (!tab || !showcase || visibleChildren.length === 0) return;

            outer.style.border = 'none';
            outer.style.outline = 'none';
            showcase.style.border = 'none';
            showcase.style.outline = 'none';

            const W = outer.offsetWidth;
            const outerRect = outer.getBoundingClientRect();
            const chevron = outer.querySelector('.fv3-expand-toggle');
            const appname = tab.querySelector('.fv3-folder-appname');
            const state = tab.querySelector('.state');
            const icon = tab.querySelector('[id^="folder-id-"]');
            const candidates = [icon, appname, state, chevron].filter(Boolean);
            const tabEndX = Math.max(...candidates.map(el => el.getBoundingClientRect().right - outerRect.left)) + 4;
            const jointY = showcase.offsetTop;
            const H = jointY + showcase.offsetHeight;
            if (W <= 0 || H <= 0) return;
            const r1 = 6;
            const r2 = 8;

            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.classList.add('fv3-inset-border');
            svg.setAttribute('width', W + 1);
            svg.setAttribute('height', H);

            const lShape = document.createElementNS(ns, 'path');
            lShape.classList.add('fv3-inset-lshape');
            lShape.setAttribute('d', [
                `M ${r1} 0`,
                `H ${tabEndX - r1}`,
                `A ${r1} ${r1} 0 0 1 ${tabEndX} ${r1}`,
                `V ${jointY}`,
                `H ${W - r2}`,
                `A ${r2} ${r2} 0 0 1 ${W} ${jointY + r2}`,
                `V ${H - r2}`,
                `A ${r2} ${r2} 0 0 1 ${W - r2} ${H}`,
                `H ${r2}`,
                `A ${r2} ${r2} 0 0 1 0 ${H - r2}`,
                `V ${r1}`,
                `A ${r1} ${r1} 0 0 1 ${r1} 0`,
                'Z'
            ].join(' '));
            lShape.setAttribute('fill', 'none');
            lShape.setAttribute('stroke', 'rgba(128,128,128,0.3)');
            lShape.setAttribute('stroke-width', '1');
            lShape.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(lShape);

            const inset = 6;
            const ir = 4;
            const innerBox = document.createElementNS(ns, 'rect');
            innerBox.classList.add('fv3-inset-innerbox');
            innerBox.setAttribute('x', inset);
            innerBox.setAttribute('y', jointY + inset);
            innerBox.setAttribute('width', W - inset * 2);
            innerBox.setAttribute('height', H - jointY - inset * 2);
            innerBox.setAttribute('rx', ir);
            innerBox.setAttribute('ry', ir);
            innerBox.setAttribute('fill', 'none');
            innerBox.setAttribute('stroke', 'rgba(128,128,128,0.2)');
            innerBox.setAttribute('stroke-width', '1');
            svg.appendChild(innerBox);

            outer.appendChild(svg);
        });
    });
};

let fv3FullwidthRaf = null;
const fv3FullwidthReflow = () => {
    if (fv3FullwidthRaf || !fv3LayoutReady) return;
    fv3FullwidthRaf = requestAnimationFrame(() => {
        fv3FullwidthRaf = null;
        ['docker', 'vm'].forEach(type => {
            const layout = type === 'docker' ? dockerDashboardLayout : vmDashboardLayout;
            if (layout !== 'fullwidth') return;
            const tbody = type === 'docker' ? 'docker_view' : 'vm_view';
            $(`tbody#${tbody} .folder-showcase-outer[expanded="true"]`).each(function() {
                const id = ($(this).attr('class') || '').match(/folder-showcase-outer-(\S+)/)?.[1];
                if (!id) return;
                const panel = $(this).data('fv3-panel');
                if (panel) {
                    $(this).find('.folder-showcase').append(panel.children());
                    panel.remove();
                    $(this).removeData('fv3-panel');
                }
            });
            $(`tbody#${tbody} .folder-showcase-outer[expanded="true"]`).each(function() {
                const id = ($(this).attr('class') || '').match(/folder-showcase-outer-(\S+)/)?.[1];
                if (id) fv3FullwidthExpand(id, type);
            });
        });
    });
};

const fv3InsetObserver = new ResizeObserver(() => {
    fv3PositionChevrons();
    fv3UpdateInsetBorders();
    fv3FullwidthReflow();
});
fv3InsetObserver.observe(document.documentElement);

const fv3ShowcaseObserver = new ResizeObserver(() => fv3UpdateInsetBorders());

const fv3UpdateHidden = () => {
    const dockerChecked = $('input#apps').is(':checked');
    $('tbody#docker_view .folder-showcase-outer').each(function() {
        const isStopped = $(this).children('span.outer').hasClass('stopped');
        $(this).toggleClass('fv3-hidden', dockerChecked && isStopped);
    });
    $('tbody#docker_view .folder-showcase > span.outer, .fv3-fullwidth-panel > span.outer').each(function() {
        const isStopped = $(this).hasClass('stopped');
        $(this).toggle(!(dockerChecked && isStopped));
    });
    const vmChecked = $('input#vms').is(':checked');
    $('tbody#vm_view .folder-showcase-outer').each(function() {
        const isStopped = $(this).children('span.outer').hasClass('stopped');
        $(this).toggleClass('fv3-hidden', vmChecked && isStopped);
    });
    $('tbody#vm_view .folder-showcase > span.outer').each(function() {
        const isStopped = $(this).hasClass('stopped');
        $(this).toggle(!(vmChecked && isStopped));
    });
};

const fv3AutoWidthTiles = () => {
    document.querySelectorAll('.folder-showcase:not(:empty), .fv3-fullwidth-panel').forEach(panel => {
        const children = panel.querySelectorAll('span.outer.solid, span.outer.apps, span.outer.vms');
        if (children.length <= 3) {
            children.forEach(el => {
                el.style.width = 'auto';
                el.style.overflow = 'visible';
            });
        } else {
            children.forEach(el => {
                el.style.width = '';
                el.style.overflow = '';
            });
        }
    });
};

$(document).on('change', 'input#apps, input#vms', () => {
    fv3UpdateHidden();
    fv3InjectExpandToggles();
    fv3UpdateGreyscale();
    fv3AutoWidthTiles();
    fv3UpdateInsetBorders();
});

const fv3FullwidthExpand = (id, type) => {
    const tbody = type === 'docker' ? 'docker_view' : 'vm_view';
    const outer = $(`.folder-showcase-outer-${id}`);
    const showcase = outer.find('.folder-showcase');
    const expanded = outer.attr('expanded') === 'true';

    if (expanded && showcase.children().length > 0) {
        showcase.css('display', 'none');
        const parentTd = $(`tbody#${tbody} > tr.updated > td`);
        const folderTile = outer.children('span.outer').first()[0];
        if (!folderTile) { showcase.css('display', ''); return; }
        const folderTop = Math.round(folderTile.getBoundingClientRect().top);

        let lastInRow = outer;
        parentTd.children('.folder-showcase-outer, span.outer:not(:empty)').each(function() {
            if (this.classList.contains('fv3-fullwidth-panel')) return;
            let visualEl;
            if (this.classList.contains('folder-showcase-outer')) {
                visualEl = this.querySelector(':scope > span.outer');
            } else {
                visualEl = this;
            }
            if (!visualEl) return;
            if (visualEl.offsetParent === null) return;
            if (Math.round(visualEl.getBoundingClientRect().top) === folderTop) {
                lastInRow = $(this);
            }
        });

        const folderName = showcase.attr('data-folder-name') || '';
        const panel = $(`<div class="fv3-fullwidth-panel" data-folder-name="${escapeHtml(folderName)}"></div>`);
        if (!fv3LayoutReady) panel.css('display', 'none');
        lastInRow.after(panel);
        panel.append(showcase.children());
        outer.data('fv3-panel', panel);
    } else {
        const panel = outer.data('fv3-panel');
        if (panel) {
            showcase.append(panel.children());
            panel.remove();
            outer.removeData('fv3-panel');
        }
    }
};
let folderReq = {
    docker: [],
    vm: []
};

// Patching the original function to make sure the containers are rendered before insering the folder
window.loadlist_original = loadlist;
window.loadlist = (x) => {
    loadedFolder = false;
    if($('tbody#docker_view').length > 0) { 
        folderReq.docker = [
            // Get the folders
            $.get('/plugins/folder.view3/server/read.php?type=docker').promise(),
            // Get the order as unraid sees it
            $.get('/plugins/folder.view3/server/read_order.php?type=docker').promise(),
            // Get the info on containers, needed for autostart, update and started
            $.get('/plugins/folder.view3/server/read_info.php?type=docker').promise(),
            // Get the order that is shown in the webui
            $.get('/plugins/folder.view3/server/read_unraid_order.php?type=docker').promise()
        ];
    }

    if($('tbody#vm_view').length > 0) {
        folderReq.vm = [
            // Get the folders
            $.get('/plugins/folder.view3/server/read.php?type=vm').promise(),
            // Get the order as unraid sees it
            $.get('/plugins/folder.view3/server/read_order.php?type=vm').promise(),
            // Get the info on VMs, needed for autostart and started
            $.get('/plugins/folder.view3/server/read_info.php?type=vm').promise(),
            // Get the order that is shown in the webui
            $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise()
        ];
    }
    loadlist_original(x);
};

// this is needed to trigger the funtion to create the folders
$.ajaxPrefilter((options, originalOptions, jqXHR) => {
    if (options.url === "/webGui/include/DashboardApps.php" && !loadedFolder) {
        jqXHR.promise().then(async () => {
            await fv3SettingsReq;
            createFolders();
            applyDashboardLayouts();
            requestAnimationFrame(() => { requestAnimationFrame(() => {
                if (dockerDashboardLayout === 'fullwidth') {
                    $('tbody#docker_view .folder-showcase').css('display', 'none');
                    $('tbody#docker_view .folder-showcase-outer[expanded="true"]').each(function() {
                        const id = ($(this).attr('class') || '').match(/folder-showcase-outer-(\S+)/)?.[1];
                        if (id) fv3FullwidthExpand(id, 'docker');
                    });
                    $('tbody#docker_view .folder-showcase').css('display', '');
                    $('tbody#docker_view .fv3-fullwidth-panel').css('display', '');
                }
                if (vmDashboardLayout === 'fullwidth') {
                    $('tbody#vm_view .folder-showcase').css('display', 'none');
                    $('tbody#vm_view .folder-showcase-outer[expanded="true"]').each(function() {
                        const id = ($(this).attr('class') || '').match(/folder-showcase-outer-(\S+)/)?.[1];
                        if (id) fv3FullwidthExpand(id, 'vm');
                    });
                    $('tbody#vm_view .folder-showcase').css('display', '');
                    $('tbody#vm_view .fv3-fullwidth-panel').css('display', '');
                }
                fv3LayoutReady = true;
            }); });
            $('div.spinner.fixed').hide();
            loadedFolder = !loadedFolder
        });
    }
});

// activate debug mode
addEventListener("keydown", (e) => {
    if (e.isComposing || e.key.length !== 1) { // letter X FOR TESTING
        return;
    }
    folderDebugModeWindow.push(e.key);
    if(folderDebugModeWindow.length > 5) {
        folderDebugModeWindow.shift();
    }
    if(folderDebugModeWindow.join('').toLowerCase() === "debug") {
        folderDebugMode = true;
        loadlist();
    }
})