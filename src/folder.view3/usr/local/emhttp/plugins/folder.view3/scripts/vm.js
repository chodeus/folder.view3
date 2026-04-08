const applyVmZebra = () => {
    let visibleIndex = 0;
    $('#kvm_table tbody tr').each(function() {
        if ($(this).is(':visible')) {
            this.style.backgroundColor = (visibleIndex % 2 === 1)
                ? 'var(--fv3-row-alt-bg, var(--dynamix-tablesorter-tbody-row-alt-bg-color))'
                : 'var(--fv3-row-bg, transparent)';
            visibleIndex++;
        }
    });
};

/**
 * Handles the creation of all folders
 */
const createFolders = async () => {
    await fv3LoadFolderDefaults();
    const prom = await Promise.all(folderReq);
    let folders = fv3SafeParseWithRecovery(prom[0], 'vm-folders', {});
    const unraidOrder = Object.values(fv3SafeParse(prom[1], {}));
    const vmInfo = fv3SafeParse(prom[2], {});
    let order = Object.values(fv3SafeParse(prom[3], {}));

    fv3ResolveRenamedContainers(folders, vmInfo, 'vm');
    Object.values(folders).forEach(f => fv3ApplyDefaults(f));


    
    let newOnes = order.filter(x => !unraidOrder.includes(x));

    for (let index = 0; index < unraidOrder.length; index++) {
        const element = unraidOrder[index];
        if((folderRegex.test(element) && folders[element.slice(7)])) {
            order.splice(index+newOnes.length, 0, element);
        }
    }

    if(folderDebugMode) {
        const debugData = JSON.stringify({
            version: (await $.get('/plugins/folder.view3/server/version.php').promise()).trim(),
            folders,
            unraidOrder,
            originalOrder: fv3SafeParse(await $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise(), []),
            newOnes,
            order,
            vmInfo
        });
        fv3DownloadDebugJSON('debug-VM.json', debugData);
        fv3Debug('vm', 'Order:', [...order]);
    }

    let foldersDone = {};

    folderEvents.dispatchEvent(new CustomEvent('vm-pre-folders-creation', {detail: {
        folders: folders,
        order: order,
        vmInfo: vmInfo
    }}));

    for (let key = 0; key < order.length; key++) {
        const container = order[key];
        if (container && folderRegex.test(container)) {
            let id = container.replace(folderRegex, '');
            if (folders[id]) {
                key -= createFolder(folders[id], id, key, order, vmInfo, Object.keys(foldersDone));
                key -= newOnes.length;
                foldersDone[id] = folders[id];
                delete folders[id];
            }
        }
    }

    for (const [id, value] of Object.entries(folders)) {
        order.unshift(`folder-${id}`);
        createFolder(value, id, 0, order, vmInfo, Object.keys(foldersDone));
        foldersDone[id] = folders[id];
        delete folders[id];
    }

    for (const [id, value] of Object.entries(foldersDone)) {
        if((globalFolders[id] && globalFolders[id].status.expanded) || value.settings.expand_tab) {
            value.status.expanded = true;
            dropDownButton(id);
        }
    }

    folderEvents.dispatchEvent(new CustomEvent('vm-post-folders-creation', {detail: {
        folders: folders,
        order: order,
        vmInfo: vmInfo
    }}));

    globalFolders = foldersDone;

    // Adopt VM detail rows that Unraid injects after createFolders (vmshow cookie)
    const kvmList = document.querySelector('#kvm_list');
    if (kvmList) {
        const adoptDetailRows = () => {
            const orphans = kvmList.querySelectorAll(':scope > tr[id^="name-"]:not(.fv3-adopted)');
            orphans.forEach(tr => {
                tr.classList.add('fv3-adopted');
                const nameId = tr.id;
                const vmRow = document.querySelector(`tr:not(.folder) a[onclick*='toggle_id("${nameId}")']`)?.closest('tr');
                if (!vmRow) return;
                const folderMatch = vmRow.className.match(/folder-(\S+?)-element/);
                if (folderMatch) {
                    const folderId = folderMatch[1];
                    tr.classList.add(`folder-${folderId}-element`, 'folder-element');
                    const isExpanded = document.querySelector(`.dropDown-${folderId}`)?.getAttribute('active') === 'true';
                    if (isExpanded) {
                        vmRow.after(tr);
                    } else {
                        const storage = document.querySelector(`tr.folder-id-${folderId} .folder-storage`);
                        if (storage) storage.appendChild(tr);
                    }
                } else {
                    vmRow.after(tr);
                }
            });
            if (orphans.length) applyVmZebra();
        };
        const mo = new MutationObserver(adoptDetailRows);
        mo.observe(kvmList, { childList: true });
        fv3Cleanups.push(() => mo.disconnect());
        adoptDetailRows();
    }

    document.getElementById('kvm_table')?.addEventListener('click', (e) => {
        if (e.target.closest('a[onclick*="toggle_id"]')) {
            setTimeout(applyVmZebra, 400);
        }
    });

    requestAnimationFrame(() => fv3SyncPreviewHeights());

    applyVmZebra();

    let maxNameWidth = 0;
    let nameExtra = 80;
    document.querySelectorAll('td.vm-name').forEach(td => {
        const inner = td.querySelector('.inner') || td.querySelector('.folder-inner');
        if (!inner || !inner.scrollWidth) return;
        if (inner.scrollWidth > maxNameWidth) {
            maxNameWidth = inner.scrollWidth;
            const outer = td.querySelector('.outer') || td.querySelector('.folder-outer');
            const tdStyle = getComputedStyle(td);
            const tdPad = parseFloat(tdStyle.paddingLeft) + parseFloat(tdStyle.paddingRight);
            nameExtra = (outer ? outer.scrollWidth - inner.scrollWidth : 36) + tdPad;
        }
    });
    const nameColWidth = Math.min(maxNameWidth + nameExtra, 300);
    document.querySelectorAll('#vm_list th.th1').forEach(th => { th.style.width = nameColWidth + 'px'; });

    folderDebugMode  = false;
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
const createFolder = (folder, id, position, order, vmInfo, foldersDone) => {

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

    if (folder.regex && typeof folder.regex === 'string' && folder.regex.trim() !== "") {
        try {
            const regex = new RegExp(folder.regex);
            const regexMatches = order.filter(el => vmInfo[el] && regex.test(el) && !folder.containers.includes(el));
            folder.containers = folder.containers.concat(regexMatches);
        } catch (e) {
            console.warn(`folder.view3: Invalid regex "${folder.regex}" in VM folder "${folder.name}"`);
        }
    }

    // the HTML template for the folder
    const totalCols = document.querySelector("#kvm_table > thead > tr").childElementCount;
    const colspan = totalCols - 2; // minus name + autostart columns
    const fld = `<tr parent-id="${id}" class="sortable folder-id-${id} ${folder.settings.preview_hover ? 'hover' : ''} folder"><td class="vm-name folder-name"><div class="folder-name-sub"><i class="fa fa-arrows-v mover orange-text"></i><span class="outer folder-outer"><span id="${id}" onclick='addVMFolderContext("${id}")' class="hand folder-hand"><img src="${escapeHtml(folder.icon)}" class="img folder-img" onerror='this.src="/plugins/dynamix.docker.manager/images/question.png"'></span><span class="inner folder-inner"><a class="folder-appname" href="#" onclick='editFolder("${id}")'>${escapeHtml(folder.name)}</a><a class="folder-appname-id">folder-${id}</a><br><i id="load-folder-${id}" class="fa fa-square stopped red-text folder-load-status"></i><span class="state folder-state"> ${$.i18n('stopped')}</span></span></span><button class="dropDown-${id} folder-dropdown" onclick='dropDownButton("${id}")'><i class="fa fa-chevron-down" aria-hidden="true"></i></button></div></td><td colspan="${colspan}"><div class="folder-storage"></div><div class="folder-preview"></div></td><td class="folder-autostart"><input class="autostart" type="checkbox" id="folder-${id}-auto" style="display:none"></td></tr>`;

    // insertion at position of the folder
    if (position === 0) {
        $('#kvm_list > tr.sortable').eq(position).before($(fld));
    } else {
        $('#kvm_list > tr.sortable').eq(position - 1).next().after($(fld));
    }

    // NOTE: switchButton initialization is deferred until after autostart state is known (see below).
    // This avoids the bug where initializing with checked:false then clicking ON could
    // fire a change event that resets VM autostart settings.

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
    }

    $(`tr.folder-id-${id} div.folder-preview`).addClass(`folder-preview-${folder.settings.preview}`);

    // select the preview function to use
    let addPreview;
    switch (folder.settings.preview) {
        case 1:
            addPreview = (id, autostart) => {
                $(`tr.folder-id-${id} div.folder-preview`).append($(`tr.folder-id-${id} div.folder-storage > tr > td.vm-name > span.outer:last`).clone().addClass(`${autostart ? 'autostart' : ''}`));
            };
            break;
        case 2:
            addPreview = (id, autostart) => {
                $(`tr.folder-id-${id} div.folder-preview`).append($(`tr.folder-id-${id} div.folder-storage > tr > td.vm-name > span.outer > span.hand:last`).clone().addClass(`${autostart ? 'autostart' : ''}`));
            };
            break;
        case 3:
            addPreview = (id, autostart) => {
                $(`tr.folder-id-${id} div.folder-preview`).append($(`tr.folder-id-${id} div.folder-storage > tr > td.vm-name > span.outer > span.inner:last`).clone().addClass(`${autostart ? 'autostart' : ''}`));
            };
            break;
        case 4:
            addPreview = (id, autostart) => {
                let lstSpan = $(`tr.folder-id-${id} div.folder-preview > span.outer:last`);
                if(!lstSpan[0] || lstSpan.children().length >= 2) {
                    $(`tr.folder-id-${id} div.folder-preview`).append($('<span class="outer"></span>'));
                    lstSpan = $(`tr.folder-id-${id} div.folder-preview > span.outer:last`);
                }
                lstSpan.append($('<span class="inner"></span>'));
                lstSpan.children('span.inner:last').append($(`tr.folder-id-${id} div.folder-storage > tr > td.vm-name > span.outer > span.inner > a:last`).clone().addClass(`${autostart ? 'autostart' : ''}`))
            };
            break;
        default:
            addPreview = (id) => { };
            break;
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
            container: container,
            vm: vmInfo[container],
            index: index,
            offsetIndex: offsetIndex
        }}));

        if (index > -1) {

            const ct = vmInfo[container];
            if (!ct) {
                continue;
            }

            // Keep track of removed elements before the folder to set back the for loop for creating folders, otherwise folder will be skipped
            if(offsetIndex < position) {
                remBefore += 1;
            }

            // remove the containers from the order
            cutomOrder.splice(index, 1);
            order.splice(offsetIndex, 1);

            // add the id to the container name
            newFolder[container] = {};
            newFolder[container].id = ct.uuid;
            newFolder[container].state = ct.state;

            // grab the container by name and put it onto the storage
            let $vmTR = $('#kvm_list > tr.sortable').filter(function() {
                return $(this).find('td.vm-name span.outer span.inner a').first().text().trim() === container;
            }).first();
            let $detailRows = $vmTR.nextUntil('tr.sortable');
            $(`tr.folder-id-${id} div.folder-storage`).append($vmTR.addClass(`folder-${id}-element`).addClass(`folder-element`).removeClass('sortable'));
            if ($detailRows.length) {
                $(`tr.folder-id-${id} div.folder-storage`).append($detailRows.addClass(`folder-${id}-element folder-element`));
            }
            $vmTR.find('input:not([name]):not([id])').each(function() {
                $(this).attr('name', `fv3-${$(this).attr('class') || 'input'}-${container}`);
            });

            if(folderDebugMode) {
                fv3Debug('vm', `${newFolder[container].id}(${offsetIndex}, ${index}) => ${id}`);
            }
            
            const isHiddenFromPreview = (folder.hidden_preview || []).includes(container);
            if (!isHiddenFromPreview) {
                addPreview(id, ct.autostart);
                $(`tr.folder-id-${id} div.folder-preview span.inner > a`).css("width", folder.settings.preview_text_width || '');

                // element to set the preview options
                const element = $(`tr.folder-id-${id} div.folder-preview > span:last`);

                //temp var
                let sel;

                //set the preview option

                if (folder.settings.preview_grayscale) {
                    sel = element.children('span.hand').children('img.img');
                    if (!sel.length) {
                        sel = element.children('img.img');
                    }
                    sel.css('filter', 'grayscale(100%)');
                }

                if (folder.settings.preview_console && ct.vnc_port > 0) {
                    sel = element.children('span.inner').last();
                    if (!sel.length) {
                        sel = element;
                    }
                    sel.append($(`<span class="folder-element-custom-btn folder-element-console"><a href="#" onclick="event.preventDefault(); window.open('/plugins/dynamix.vm.manager/vnc.html?autoconnect=true&resize=scale&host=' + location.hostname + '&port=&path=/wsproxy/${escapeHtml(ct.vnc_port)}/', '_blank');"><i class="fa fa-desktop" aria-hidden="true"></i></a></span>`));
                }

                if (folder.settings.preview_logs && ct.logs) {
                    sel = element.children('span.inner').last();
                    if (!sel.length) {
                        sel = element;
                    }
                    sel.append($(`<span class="folder-element-custom-btn folder-element-logs"><a href="#" onclick="openTerminal('log', '${escapeHtml(container)}', '${escapeHtml(ct.logs)}')"><i class="fa fa-bars" aria-hidden="true"></i></a></span>`));
                }
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

    // set the border on the last element
    $(`.folder-${id}-element:last`).css('border-bottom', '1px solid rgba(128, 128, 128, 0.3)');

    // replace the old containers array with the newFolder object
    folder.containers = newFolder;

    // wrap the preview with a div
    $(`tr.folder-id-${id} div.folder-preview > span`).wrap('<div class="folder-preview-wrapper"></div>');

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
    }

    //set tehe status of a folder

    if (started) {
        $(`tr.folder-id-${id} i#load-folder-${id}`).attr('class', 'fa fa-play started green-text folder-load-status');
        $(`tr.folder-id-${id} span.folder-state`).text(`${started}/${Object.entries(folder.containers).length} ${$.i18n('started')}`);
    }

    const folderHasAutostart = autostart > 0;
    $(`#folder-${id}-auto`).switchButton({ labels_placement: 'right', off_label: $.i18n('off'), on_label: $.i18n('on'), checked: folderHasAutostart });

    if(autostart === 0) {
        $(`tr.folder-id-${id}`).addClass('no-autostart');
    } else if (autostart > 0 && autostartStarted === 0) {
        $(`tr.folder-id-${id}`).addClass('autostart-off');
    } else if (autostart > 0 && autostartStarted > 0 && autostart !== autostartStarted) {
        $(`tr.folder-id-${id}`).addClass('autostart-partial');
    } else if (autostart > 0 && autostartStarted > 0 && autostart === autostartStarted) {
        $(`tr.folder-id-${id}`).addClass('autostart-full');
    }

    // set the status
    folder.status = {};
    folder.status.started = started;
    folder.status.autostart = autostart;
    folder.status.autostartStarted = autostartStarted;
    folder.status.expanded = false;

    $(`#folder-${id}-auto`).off("change", folderAutostart).on("change", folderAutostart);

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
 * Hanled the click of the autostart button and changes the container to reflect the status of the folder
 * @param {*} el element passed by the event caller
 */
const folderAutostart = (el) => {
    const status = el.target.checked;
    const id = el.target.id.split('-')[1];
    const containers = $(`tr.folder-${id}-element`);
    for (const container of containers) {
        const el = $(container).children().last();
        const cstatus = el.children('.autostart')[0].checked;
        if ((status && !cstatus) || (!status && cstatus)) {
            el.children('.switch-button-background').click();
        }
    }
};

const dropDownButton = (id) => fv3DropDownButton('vm', globalFolders, id, applyVmZebra);
const rmFolder = (id) => fv3RmFolder('vm', globalFolders, loadlist, id);
const editFolder = (id) => fv3EditFolder('vm', '/VMs/Folder', id);

/**
 * 
 * @param {string} id The id of the folder
 * @param {string} action the desired action
 */
const actionFolder = async (id, action) => {
    const folder = globalFolders[id];
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
            case "domain-reset":
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
            proms.push(fv3VmAction(action, cid));
        }
    }

    proms = await Promise.all(proms);
    errors = proms.filter(e => e.success !== true);
    const errorMessages = errors.map(e => escapeHtml(e.text || JSON.stringify(e)));

    if(errors.length > 0) {
        swal({
            title: $.i18n('exec-error'),
            text:errorMessages.join('<br>'),
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
const folderCustomAction = async (id, action) => {
    $('div.spinner.fixed').show('slow');

    const folder = globalFolders[id];
    let act = folder.actions[action];
    let prom = [];
    if(act.type === 0) {
        const cts = act.conatiners.map(e => folder.containers[e]).filter(e => e);
        let ctAction = (e) => {};
        if(act.action === 0) {

            if(act.modes === 0) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push(fv3VmAction('domain-stop', e.id));
                    } else if(e.state !== "running" && e.state !== "pmsuspended" && e.state !== "paused" && e.state !== "unknown"){
                        prom.push(fv3VmAction('domain-start', e.id));
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push(fv3VmAction('domain-pause', e.id));
                    } else if(e.state === "paused" || e.state === "unknown") {
                        prom.push(fv3VmAction('domain-resume', e.id));
                    }
                };
            }

        } else if(act.action === 1) {

            if(act.modes === 0) {
                ctAction = (e) => {
                    if(e.state !== "running" && e.state !== "pmsuspended" && e.state !== "paused" && e.state !== "unknown") {
                        prom.push(fv3VmAction('domain-start', e.id));
                    }
                };
            } else if(act.modes === 1) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push(fv3VmAction('domain-stop', e.id));
                    }
                };
            } else if(act.modes === 2) {
                ctAction = (e) => {
                    if(e.state === "running") {
                        prom.push(fv3VmAction('domain-pause', e.id));
                    }
                };
            } else if(act.modes === 3) {
                ctAction = (e) => {
                    if(e.state === "paused" || e.state === "unknown") {
                        prom.push(fv3VmAction('domain-restart', e.id));
                    }
                };
            }

        } else if(act.action === 2) {

            ctAction = (e) => {
                if(e.state === "running") {
                    prom.push(fv3VmAction('domain-pause', e.id));
                }
            };

        }

        cts.forEach((e) => {
            ctAction(e);
        });
    } else if(act.type === 1) {
        await fv3RunUserScript(act, prom);
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
    if (!globalFolders[id]) {
        return;
    }
    let opts = [];
    context.settings({
        right: false,
        above: false
    });

    if(globalFolders[id].settings.override_default_actions && globalFolders[id].actions && globalFolders[id].actions.length) {
        opts.push(
            ...globalFolders[id].actions.map((e, i) => {
                return {
                    text: escapeHtml(e.name),
                    icon: e.script_icon || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderCustomAction(id, i); }
                }
            })
        );
    
        opts.push({
            divider: true
        });

    } else if(!globalFolders[id].settings.default_action) {
        opts.push({
            text:$.i18n('start'),
            icon:"fa-play",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-start'); }
        });
    
        opts.push({
            text:$.i18n('stop'),
            icon:"fa-stop",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-stop'); }
        });
    
        opts.push({
            text:$.i18n('pause'),
            icon:"fa-pause",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-pause'); }
        });
    
        opts.push({
            text:$.i18n('resume'),
            icon:"fa-play-circle",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-resume'); }
        });
    
        opts.push({
            text:$.i18n('restart'),
            icon:"fa-refresh",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-restart'); }
        });
    
        opts.push({
            text:$.i18n('hibernate'),
            icon:"fa-bed",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-pmsuspend'); }
        });
    
        opts.push({
            text:$.i18n('force-stop'),
            icon:"fa-bomb",
            action:(e) => { e.preventDefault(); actionFolder(id, 'domain-destroy'); }
        });

        if (fv3ApiAvailable) {
            opts.push({
                text:$.i18n('reset'),
                icon:"fa-bolt",
                action:(e) => { e.preventDefault(); actionFolder(id, 'domain-reset'); }
            });
        }

        opts.push({
            divider: true
        });
    }


    opts.push({
        text: $.i18n('edit'),
        icon: 'fa-wrench',
        action: (e) => { e.preventDefault(); editFolder(id); }
    });

    opts.push({
        text: $.i18n('remove'),
        icon: 'fa-trash',
        action: (e) => { e.preventDefault(); rmFolder(id); }
    });

    if(!globalFolders[id].settings.override_default_actions && globalFolders[id].actions && globalFolders[id].actions.length) {
        opts.push({
            divider: true
        });

        opts.push({
            text: $.i18n('custom-actions'),
            icon: 'fa-bars',
            subMenu: globalFolders[id].actions.map((e, i) => {
                return {
                    text: escapeHtml(e.name),
                    icon: e.script_icon || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderCustomAction(id, i); }
                }
            })
        });
    }

    folderEvents.dispatchEvent(new CustomEvent('vm-folder-context', {detail: { id, opts }}));

    context.attach('#' + id, opts);
};

// Global variables
let loadedFolder = false;
let globalFolders = {};
const folderRegex = /^folder-/;
let folderDebugMode = !!window.FV3_DEBUG;
let folderReq = [];

// Patching the original function to make sure the containers are rendered before insering the folder
window.loadlist_original = loadlist;
let fv3FolderReqPending = false;
window.loadlist = (x) => {
    // Only create new PHP requests if previous ones have been consumed
    if (!fv3FolderReqPending) {
        fv3FolderReqPending = true;
        loadedFolder = false;
        folderReq = [
            $.get('/plugins/folder.view3/server/read.php?type=vm').fail(() => fv3ShowBanner('Could not load folder data. Try refreshing the page.', 'error')).promise(),
            $.get('/plugins/folder.view3/server/read_order.php?type=vm').promise(),
            $.get('/plugins/folder.view3/server/read_info.php?type=vm').fail(() => fv3ShowBanner('Could not load VM details. Try refreshing the page.', 'error')).promise(),
            $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise()
        ];
        Promise.all(folderReq).finally(() => { fv3FolderReqPending = false; });
    }
    loadlist_original(x);
};

fv3SetupResizeListeners(() => globalFolders, 'vm_listview_mode');

// Add the button for creating a folder
const createFolderBtn = () => fv3CreateFolderBtn('vm', '/VMs/Folder');


$.ajaxPrefilter((options, originalOptions, jqXHR) => {
    // This is needed because unraid don't like the folder and the number are set incorrectly, this intercept the request and change the numbers to make the order appear right, this is important for the autostart and to draw the folders
    if (options.url === "/plugins/dynamix.vm.manager/include/UserPrefs.php") {
        const data = new URLSearchParams(options.data);
        const containers = data.get('names').split(';');
        const folderFixRegex = /^(.*?)(?=folder-)/g;
        let num = "";
        for (let index = 0; index < containers.length - 1; index++) {
            containers[index] = containers[index].replace(folderFixRegex, '');
            num += index + ';'
        }
        data.set('names', containers.join(';'));
        data.set('index', num);
        options.data = data.toString();
        $('.unhide').show();
    } else if (options.url === "/plugins/dynamix.vm.manager/include/VMMachines.php" && !loadedFolder) {
        jqXHR.promise().then(() => {
            createFolders();
            $('div.spinner.fixed').hide();
            loadedFolder = true;
        });
    }
});
