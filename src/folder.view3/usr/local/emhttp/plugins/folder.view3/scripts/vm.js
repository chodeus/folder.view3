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

// Render all VM folders.
const createFolders = async () => {
    await fv3LoadFolderDefaults();
    const prom = await Promise.all(folderReq);
    let folders = fv3SafeParseWithRecovery(prom[0], 'vm-folders', {});
    const unraidOrder = Object.values(fv3SafeParse(prom[1], {}));
    const vmInfo = fv3SafeParse(prom[2], {});
    let order = Object.values(fv3SafeParse(prom[3], {}));

    fv3ResolveRenamedContainers(folders, vmInfo, 'vm');
    Object.values(folders).forEach(f => fv3ApplyDefaults(f));

    // Explicit members of ANY folder beat regex matches elsewhere (issue #46)
    const fv3AssignedElsewhere = Object.values(folders).flatMap(f => Array.isArray(f.containers) ? f.containers : []);
    Object.values(folders).forEach(f => { f.fv3AssignedElsewhere = fv3AssignedElsewhere; });

    let newOnes = order.filter(x => !unraidOrder.includes(x));

    for (let index = 0; index < unraidOrder.length; index++) {
        const element = unraidOrder[index];
        if((folderRegex.test(element) && folders[element.slice(7)])) {
            order.splice(index+newOnes.length, 0, element);
        }
    }

    if(window.FV3_DEBUG) {
        window.fv3DebugPayloads['VM'] = JSON.stringify({
            version: (await $.get('/plugins/folder.view3/server/version.php').promise()).trim(),
            folders,
            unraidOrder,
            originalOrder: fv3SafeParse(await $.get('/plugins/folder.view3/server/read_unraid_order.php?type=vm').promise(), []),
            newOnes,
            order,
            vmInfo,
            cssDebug: await fv3CollectCssDebug()
        });
        fv3Debug('vm', 'Debug payload stored for VM; click the FV3 Debug pill to download. Order:', [...order]);
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
                try {
                    key -= createFolder(folders[id], id, key, order, vmInfo, Object.keys(foldersDone));
                    key -= newOnes.length;
                    foldersDone[id] = folders[id];
                } catch (e) {
                    console.error(`[FV3] VM: folder "${folders[id].name}" failed to render:`, e);
                    fv3ShowBanner(`FolderView3: folder "${folders[id].name}" failed to render — check its regex/settings (browser console has details).`, 'error');
                }
                delete folders[id];
            }
        }
    }

    for (const [id, value] of Object.entries(folders)) {
        order.unshift(`folder-${id}`);
        try {
            createFolder(value, id, 0, order, vmInfo, Object.keys(foldersDone));
            foldersDone[id] = folders[id];
        } catch (e) {
            console.error(`[FV3] VM: folder "${value.name}" failed to render:`, e);
            fv3ShowBanner(`FolderView3: folder "${value.name}" failed to render — check its regex/settings (browser console has details).`, 'error');
        }
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
            nameExtra = (outer ? outer.scrollWidth - inner.scrollWidth : 36) + tdPad + 10;
        }
    });
    const nameColWidth = Math.min(maxNameWidth + nameExtra, 300);
    document.querySelectorAll('#kvm_table th.th1').forEach(th => { th.style.width = nameColWidth + 'px'; });

    folderDebugMode  = false;
};

// Render one folder. Returns the number of elements removed before the folder's position.
const createFolder = (folder, id, position, order, vmInfo, foldersDone) => {

    folderEvents.dispatchEvent(new CustomEvent('vm-pre-folder-creation', {detail: {
        folder: folder,
        id: id,
        position: position,
        order: order,
        vmInfo: vmInfo,
        foldersDone: foldersDone
    }}));

    let started = 0;
    let paused = 0;
    let autostart = 0;
    let autostartStarted = 0;
    let remBefore = 0;

    if (folder.regex && typeof folder.regex === 'string' && folder.regex.trim() !== "") {
        try {
            const regex = new RegExp(folder.regex);
            const regexMatches = order.filter(el => vmInfo[el] && regex.test(el) && !folder.containers.includes(el) && !(folder.fv3AssignedElsewhere || []).includes(el));
            folder.containers = folder.containers.concat(regexMatches);
        } catch (e) {
            console.warn(`folder.view3: Invalid regex "${folder.regex}" in VM folder "${folder.name}"`);
        }
    }

    const totalCols = document.querySelector("#kvm_table > thead > tr").childElementCount;
    const colspan = totalCols - 2;
    const fld = `<tr parent-id="${id}" class="sortable folder-id-${id} ${folder.settings.preview_hover ? 'hover' : ''} folder"><td class="vm-name folder-name"><div class="folder-name-sub"><i class="fa fa-arrows-v mover orange-text"></i><span class="outer folder-outer"><span id="${id}" onclick='addVMFolderContext("${id}")' class="hand folder-hand"><img src="${escapeHtml(folder.icon || '/plugins/dynamix.docker.manager/images/question.png')}" class="img folder-img" onerror='this.onerror=null;this.src="/plugins/dynamix.docker.manager/images/question.png"'></span><span class="inner folder-inner"><a class="folder-appname" href="#" onclick='editFolder("${id}")'>${escapeHtml(folder.name)}</a><a class="folder-appname-id">folder-${id}</a><br><i id="load-folder-${id}" class="fa fa-square stopped red-text folder-load-status"></i><span class="state folder-state"> ${$.i18n('stopped')}</span></span></span><button class="dropDown-${id} folder-dropdown" onclick='dropDownButton("${id}")'><i class="fa fa-chevron-down" aria-hidden="true"></i></button></div></td><td colspan="${colspan}"><div class="folder-storage"></div><div class="folder-preview"></div></td><td class="folder-autostart"><input class="autostart" type="checkbox" id="folder-${id}-auto" style="display:none"></td></tr>`;

    if (position === 0) {
        $('#kvm_list > tr.sortable').eq(position).before($(fld));
    } else {
        $('#kvm_list > tr.sortable').eq(position - 1).next().after($(fld));
    }

    // switchButton init deferred until autostart state is known — early init can reset VM autostart.

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
    if (folder.settings.preview === 2 && folder.settings.preview_status && folder.settings.preview_status !== 'none') {
        $(`tr.folder-id-${id}`).attr('data-fv3-preview-status', folder.settings.preview_status);
    } else {
        $(`tr.folder-id-${id}`).removeAttr('data-fv3-preview-status');
    }

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

    let newFolder = {};

    foldersDone = foldersDone.map(e => 'folder-'+e);

    const cutomOrder = order.filter((e) => {
        return e && (foldersDone.includes(e) || !(folderRegex.test(e) && e !== `folder-${id}`));
    });

    for (const container of folder.containers) {

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

            if(offsetIndex < position) {
                remBefore += 1;
            }

            cutomOrder.splice(index, 1);
            order.splice(offsetIndex, 1);

            newFolder[container] = {};
            newFolder[container].id = ct.uuid;
            newFolder[container].state = ct.state;

            let $vmTR = $('#kvm_list > tr.sortable:not(.folder)').filter(function() {
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

                const element = $(`tr.folder-id-${id} div.folder-preview > span:last`);

                let sel;

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
                    sel.append($(`<span class="folder-element-custom-btn folder-element-console"><a href="#" onclick="event.preventDefault(); event.stopPropagation(); window.open('/plugins/dynamix.vm.manager/vnc.html?autoconnect=true&resize=scale&host=' + location.hostname + '&port=&path=/wsproxy/${escapeHtml(ct.vnc_port)}/', '_blank');"><i class="fa fa-desktop" aria-hidden="true"></i></a></span>`));
                }

                if (folder.settings.preview_logs && ct.logs) {
                    sel = element.children('span.inner').last();
                    if (!sel.length) {
                        sel = element;
                    }
                    sel.append($(`<span class="folder-element-custom-btn folder-element-logs"><a href="#" onclick="event.preventDefault(); event.stopPropagation(); openTerminal('log', '${escapeHtml(container)}', '${escapeHtml(ct.logs)}')"><i class="fa fa-bars" aria-hidden="true"></i></a></span>`));
                }

                const isVmRunning = ct.state !== 'shutoff';
                element.attr('data-fv3-state', isVmRunning ? 'running' : 'stopped');
                if (folder.settings.preview === 2) {
                    const fv3StatusIconCls = isVmRunning
                        ? 'fa fa-play started green-text fv3-status-icon'
                        : 'fa fa-square stopped red-text fv3-status-icon';
                    let target = element.children('span.inner').last();
                    if (!target.length) target = element;
                    if (target.length) {
                        target.append('<br class="fv3-status-line">');
                        target.append(`<i class="${fv3StatusIconCls}" aria-hidden="true"></i>`);
                    }
                }
            }

            started += ct.state!=="shutoff" ? 1 : 0;
            paused += (ct.state === "paused" || ct.state === "pmsuspended") ? 1 : 0;
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

    $(`.folder-${id}-element:last`).css('border-bottom', '1px solid rgba(128, 128, 128, 0.3)');

    folder.containers = newFolder;

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

    if (started) {
        const allPaused = paused > 0 && paused === started;
        const iconCls = allPaused
            ? 'fa fa-pause started orange-text folder-load-status'
            : 'fa fa-play started green-text folder-load-status';
        const stateKey = allPaused ? 'paused' : 'started';
        $(`tr.folder-id-${id} i#load-folder-${id}`).attr('class', iconCls);
        $(`tr.folder-id-${id} span.folder-state`).text(`${started}/${Object.entries(folder.containers).length} ${$.i18n(stateKey)}`);
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

    folder.status = {};
    folder.status.started = started;
    folder.status.paused = paused;
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

// Autostart toggle handler: syncs each VM's autostart to the folder's new state.
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

// Run a bulk libvirt action (start/stop/pause/restart/etc.) across all VMs in the folder.
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

    const settled = await Promise.allSettled(proms);
    proms = settled.map(s => s.status === 'fulfilled' ? s.value : { success: false, text: (s.reason && (s.reason.statusText || s.reason.message)) || 'Request failed' });
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

// Execute a user-defined custom action (built-in mode or user script) for the folder.
const folderCustomAction = async (id, action) => {
    $('div.spinner.fixed').show('slow');

    const folder = globalFolders[id];
    if (!folder || !folder.actions || !folder.actions[action]) { $('div.spinner.fixed').hide('slow'); loadlist(); return; }
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
                    if(e.state === "running") {
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

    await Promise.allSettled(prom);

    loadlist();
    $('div.spinner.fixed').hide('slow');
};

// Build and attach the right-click/icon context menu for the folder.
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
                    icon: String(e.script_icon || "fa-bolt").replace(/[^a-zA-Z0-9 _-]/g, '') || "fa-bolt",
                    action: (e) => { e.preventDefault(); folderCustomAction(id, i); }
                }
            })
        );
    
        opts.push({
            divider: true
        });

    } else if(!globalFolders[id].settings.default_action) {
        const _cts = Object.values(globalFolders[id].containers || {});
        const _running = _cts.filter(c => c.state === "running").length;
        const _shutoff = _cts.filter(c => c.state === "shutoff").length;
        const _resumable = _cts.filter(c => c.state === "paused" || c.state === "pmsuspended" || c.state === "unknown").length;
        const _destroyable = _running + _resumable;
        let _added = false;
        if (_shutoff > 0) {
            opts.push({
                text:$.i18n('start'),
                icon:"fa-play",
                action:(e) => { e.preventDefault(); actionFolder(id, 'domain-start'); }
            });
            _added = true;
        }
        if (_running > 0) {
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
            _added = true;
        }
        if (_resumable > 0) {
            opts.push({
                text:$.i18n('resume'),
                icon:"fa-play-circle",
                action:(e) => { e.preventDefault(); actionFolder(id, 'domain-resume'); }
            });
            _added = true;
        }
        if (_running > 0) {
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
            _added = true;
        }
        if (_destroyable > 0) {
            opts.push({
                text:$.i18n('force-stop'),
                icon:"fa-bomb",
                action:(e) => { e.preventDefault(); actionFolder(id, 'domain-destroy'); }
            });
            _added = true;
        }
        if (fv3ApiAvailable && _running > 0) {
            opts.push({
                text:$.i18n('reset'),
                icon:"fa-bolt",
                action:(e) => { e.preventDefault(); actionFolder(id, 'domain-reset'); }
            });
            _added = true;
        }
        if (_added) opts.push({ divider: true });
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
                    icon: String(e.script_icon || "fa-bolt").replace(/[^a-zA-Z0-9 _-]/g, '') || "fa-bolt",
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
window.fv3DebugSource = 'VM';
let folderReq = [];

// Unraid loadlist patch — inject folder rendering after VMs render
window.loadlist_original = window.loadlist;
let fv3FolderReqPending = false;
window.loadlist = (x) => {
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
    if (typeof window.loadlist_original === 'function') { loadlist_original(x); }
};

fv3SetupResizeListeners(() => globalFolders, 'vm_listview_mode');

const createFolderBtn = () => fv3CreateFolderBtn('vm', '/VMs/Folder');


// Intercept Unraid's UserPrefs request to rewrite folder/order numbers — required for autostart and draw order.
$.ajaxPrefilter((options, originalOptions, jqXHR) => {
    if (options.url === "/plugins/dynamix.vm.manager/include/UserPrefs.php") {
        const data = new URLSearchParams(options.data);
        if (!data.has('names')) {
            // Reset Order POST has only {reset:true} — nothing to renumber, let it through.
            return;
        }
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
        jqXHR.promise().then(async () => {
            loadedFolder = true;
            try { await createFolders(); }
            catch (e) {
                console.error('[FV3] VM: folder rendering failed:', e);
                // Reveal the anti-FOUC-hidden native list — only FV3 grouping failed
                document.documentElement.classList.add('fv3-vm-ready');
                loadedFolder = false;
            }
            $('div.spinner.fixed').hide();
        });
    }
});
