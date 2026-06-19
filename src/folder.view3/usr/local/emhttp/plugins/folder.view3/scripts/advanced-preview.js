// Shared globals used by docker.js, dashboard.js, and the advanced preview helper below.
// Defined here so Dashboard can use them too without loading docker.js.

window.fv3UsingWebSocket = window.fv3UsingWebSocket || false;

window.memToB = window.memToB || ((mem) => {
    if (typeof mem !== 'string') return 0;
    const unitMatch = mem.match(/[a-zA-Z]+/);
    const unit = unitMatch ? unitMatch[0] : 'B';
    const numPart = parseFloat(mem.replace(unit, ''));
    if (isNaN(numPart)) return 0;
    let multiplier = 1;
    switch (unit) {
        case 'Bytes': case 'B': multiplier = 1; break;
        case 'KiB': multiplier = 2 ** 10; break;
        case 'MiB': multiplier = 2 ** 20; break;
        case 'GiB': multiplier = 2 ** 30; break;
        case 'TiB': multiplier = 2 ** 40; break;
        case 'PiB': multiplier = 2 ** 50; break;
        case 'EiB': multiplier = 2 ** 60; break;
        case 'ZiB': multiplier = 2 ** 70; break;
        case 'YiB': multiplier = 2 ** 80; break;
        default: multiplier = 1;
    }
    return numPart * multiplier;
});

window.hideAllTips = window.hideAllTips || (() => {
    if (!$.tooltipster) return;
    $.each($.tooltipster.instances(), (i, instance) => instance.close());
});

window.advancedAutostart = window.advancedAutostart || ((el) => {
    const outbox = $(el.target).parents('.preview-outbox')[0];
    if (!outbox) return;
    const m = outbox.className.match(/preview-outbox-([a-zA-Z0-9]+)/);
    if (!m) return;
    $(`#${m[1]}`).parents('.folder-element').find('.switch-button-background').click();
});

/**
 * Attaches the FolderView3 advanced preview (tooltipster popup with CPU/MEM graphs)
 * to a given trigger element. Called from docker.js and dashboard.js.
 */
window.fv3AttachAdvancedPreview = function({ triggerEl, ct, folder, id, container_name_in_folder, cpus }) {
    if (!triggerEl || (triggerEl.length !== undefined && triggerEl.length === 0)) { return; }
    if (!$.fn.tooltipster) {
        fv3DebugWarn('fv3AttachAdvancedPreview', 'tooltipster plugin not loaded on this page; aborting');
        return;
    }

    let CPU = []; let MEM = []; let charts = []; let tootltipObserver; let tooltipResizeObserver; let chartHeightGuards = [];
    // Tracks which stats listener (if any) is currently attached. Prevents duplicate adds
    // (e.g. hover trigger firing functionReady multiple times) and ensures functionAfter
    // removes the same listener it added, even if fv3UsingWebSocket flipped in between.
    let attachedListener = null; // 'ws' | 'sse' | null
    fv3Debug('createFolder', id, container_name_in_folder, 'Initialized CPU, MEM, charts, tootltipObserver for tooltip.');

    const pushChartData = (cpuVal, memVal) => {
        const now = Date.now();
        CPU.push({ x: now, y: cpuVal });
        MEM.push({ x: now, y: memVal });
        // Defensive: chartjs-plugin-streaming can throw when called on a destroyed chart
        // (race between WS event arrival and tooltipster's functionAfter cleanup, or
        // stale listener from a previous popup). Skip silently.
        for (const chart of charts) {
            try {
                if (chart && chart.canvas && document.body.contains(chart.canvas)) {
                    chart.update('quiet');
                }
            } catch (e) { /* chart was destroyed during the update tick */ }
        }
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
            let cpuVal = detail.stat.cpuPercent / cpus;
            let memVal = memToB(detail.stat.mem[0]) / memToB(detail.stat.mem[1]) * 100;
            pushChartData(cpuVal, memVal);
        } catch (error) {
            pushChartData(0, 0);
        }
    };

    fv3Debug('createFolder', id, ct.shortId, 'tooltip_trigger_element is valid. Initializing tooltipster.');
    $(triggerEl).tooltipster({
        interactive: true,
        theme: ['tooltipster-docker-folder'],
        trigger: (folder.settings.context_trigger===1 ? 'hover' : 'click') || 'click',
        zIndex: 99998,
        functionBefore: function(instance, helper) {
            const origin = helper.origin;

            fv3Debug('tooltipster', ct.shortId, 'functionBefore', instance, helper, origin);
            fv3Debug('tooltipster', ct.shortId, 'folder settings', {...folder.settings});

            fv3Debug('tooltipster', ct.shortId, 'Dispatching docker-tooltip-before event.');
            folderEvents.dispatchEvent(new CustomEvent('docker-tooltip-before', {detail: {
                folder: folder,
                id: id,
                containerInfo: ct,
                origin: origin,
                charts: charts,
                stats: {
                    CPU: CPU,
                    MEM: MEM
                }
            }}));

            fv3Debug('tooltipster', ct.shortId, 'functionBefore completed. Allowing tooltip to proceed by default.');
        },
        functionReady: function(instance, helper) {
            const triggerOriginEl = helper.origin;
            const tooltipDomEl = helper.tooltip;

            const $loadIcon = $(`i#load-${ct.info.Name}`);
            if ($loadIcon.length) {
                const liveRunning = $loadIcon.hasClass('started') || $loadIcon.hasClass('paused');
                const livePaused = $loadIcon.hasClass('paused');
                const iconName = liveRunning ? (livePaused ? 'pause' : 'play') : 'square';
                const stateClass = liveRunning ? (livePaused ? 'paused' : 'started') : 'stopped';
                const colorClass = liveRunning ? (livePaused ? 'orange-text' : 'green-text') : 'red-text';
                const stateText = liveRunning ? (livePaused ? $.i18n('paused') : $.i18n('started')) : $.i18n('stopped');
                $(`.preview-outbox-${ct.shortId} .preview-actual-name i`, tooltipDomEl)
                    .attr('class', `fa fa-${iconName} ${stateClass} ${colorClass}`);
                $(`.preview-outbox-${ct.shortId} .preview-actual-name .state`, tooltipDomEl)
                    .text(' ' + stateText);

                const actionItems = [];
                if (liveRunning && !livePaused) {
                    if (ct.info.State.WebUi) actionItems.push(`<li><a href="${escapeHtml(ct.info.State.WebUi)}" target="_blank"><i class="fa fa-globe" aria-hidden="true"></i> ${$.i18n('webui')}</a></li>`);
                    if (ct.info.State.TSWebUi) actionItems.push(`<li><a href="${escapeHtml(ct.info.State.TSWebUi)}" target="_blank"><i class="fa fa-shield" aria-hidden="true"></i> ${$.i18n('tailscale-webui')}</a></li>`);
                    actionItems.push(`<li><a onclick="event.preventDefault(); openTerminal('docker', '${escapeHtml(ct.info.Name)}', '${escapeHtml(ct.info.Shell)}');"><i class="fa fa-terminal" aria-hidden="true"></i> ${$.i18n('console')}</a></li>`);
                }
                if (!liveRunning) {
                    actionItems.push(`<li><a onclick="event.preventDefault(); eventControl({action:'start', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-play" aria-hidden="true"></i> ${$.i18n('start')}</a></li>`);
                } else if (livePaused) {
                    actionItems.push(`<li><a onclick="event.preventDefault(); eventControl({action:'resume', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-play" aria-hidden="true"></i> ${$.i18n('resume')}</a></li>`);
                } else {
                    actionItems.push(`<li><a onclick="event.preventDefault(); eventControl({action:'stop', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-stop" aria-hidden="true"></i> ${$.i18n('stop')}</a></li>`);
                    actionItems.push(`<li><a onclick="event.preventDefault(); eventControl({action:'pause', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-pause" aria-hidden="true"></i> ${$.i18n('pause')}</a></li>`);
                }
                if (liveRunning) {
                    actionItems.push(`<li><a onclick="event.preventDefault(); eventControl({action:'restart', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-refresh" aria-hidden="true"></i> ${$.i18n('restart')}</a></li>`);
                }
                actionItems.push(`<li><a onclick="event.preventDefault(); openTerminal('docker', '${escapeHtml(ct.info.Name)}', '.log');"><i class="fa fa-navicon" aria-hidden="true"></i> ${$.i18n('logs')}</a></li>`);
                if (ct.info.template) actionItems.push(`<li><a onclick="event.preventDefault(); editContainer('${escapeHtml(ct.info.Name)}', '${escapeHtml(ct.info.template.path)}');"><i class="fa fa-wrench" aria-hidden="true"></i> ${$.i18n('edit')}</a></li>`);
                actionItems.push(`<li><a onclick="event.preventDefault(); rmContainer('${escapeHtml(ct.info.Name)}', '${ct.shortImageId}', '${ct.shortId}');"><i class="fa fa-trash" aria-hidden="true"></i> ${$.i18n('remove')}</a></li>`);
                $(`.preview-outbox-${ct.shortId} .action-left ul.fa-ul`, tooltipDomEl).html(actionItems.join(''));
            }

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

            if (window.innerWidth <= 768) {
                fv3Debug('tooltipster', ct.shortId, 'Mobile detected — applying hybrid accordion layout.');
                const $secondRow = $(`.preview-outbox-${ct.shortId} .second-row`, tooltipDomEl);
                const $actionInfo = $secondRow.children('.action-info');
                const $infoSection = $secondRow.children('.info-section');
                const $infoCt = $actionInfo.children('.info-ct');

                const $actionsDetails = $(`<details class="fv3-mobile-details" open><summary>${$.i18n('quick-actions') || 'Quick Actions'}</summary></details>`);
                $actionInfo.before($actionsDetails);
                $actionsDetails.append($actionInfo);

                const $graphDetails = $(`<details class="fv3-mobile-details"><summary>${$.i18n('graph-details') || 'Graph & Details'}</summary></details>`);
                $infoSection.before($graphDetails);
                $graphDetails.append($infoSection);

                $secondRow.append($infoCt);

                const $allDetails = $secondRow.find('.fv3-mobile-details');
                $allDetails.on('toggle', function () {
                    chartHeightGuards.forEach(id => clearTimeout(id));
                    chartHeightGuards = [];

                    if (this.open) {
                        $allDetails.not(this).each(function () { this.open = false; });
                        $(this).find('canvas').each(function () {
                            const canvas = this;
                            const container = canvas.parentElement;
                            requestAnimationFrame(() => {
                                if (!document.body.contains(canvas)) return;
                                const chart = Chart.getChart(canvas);
                                if (chart) {
                                    chart.resize();
                                    chart.update();
                                }
                                container.style.height = 'auto';
                                const guardId = setTimeout(() => {
                                    if (document.body.contains(container)) {
                                        container.style.height = 'auto';
                                    }
                                }, 1100);
                                chartHeightGuards.push(guardId);
                            });
                        });
                    }
                });

                let resizeTimer;
                tooltipResizeObserver = new ResizeObserver(() => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        try {
                            $(triggerEl).tooltipster('reposition');
                        } catch(e) {}
                    }, 150);
                });
                tooltipResizeObserver.observe($(`.preview-outbox-${ct.shortId}`, tooltipDomEl).get(0));
            }

            if (attachedListener) {
                fv3Debug('tooltipster', ct.shortId, `Stats listener already attached (${attachedListener}); skipping duplicate add.`);
            } else if (fv3UsingWebSocket) {
                folderEvents.addEventListener('fv3-stats-update', graphListenerWS);
                attachedListener = 'ws';
                fv3Debug('tooltipster', ct.shortId, 'Added graphListener via WebSocket events.');
            } else if (typeof dockerload !== 'undefined') {
                dockerload.addEventListener('message', graphListenerSSE);
                attachedListener = 'sse';
                fv3Debug('tooltipster', ct.shortId, 'Added graphListener to dockerload SSE.');
            } else {
                fv3DebugWarn('tooltipster', ct.shortId, 'No stats source on this page (no WS, no dockerload). Graphs will not update.');
            }

            if (fv3Incognito) fv3IncognitoScrubTooltip($(tooltipDomEl)[0], ct.info.Name);

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
            // Use the tracked listener type, not the current fv3UsingWebSocket flag
            // (which may have flipped between attach and detach).
            if (attachedListener === 'ws') {
                folderEvents.removeEventListener('fv3-stats-update', graphListenerWS);
            } else if (attachedListener === 'sse' && typeof dockerload !== 'undefined') {
                dockerload.removeEventListener('message', graphListenerSSE);
            }
            attachedListener = null;
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
            if (tooltipResizeObserver) {
                tooltipResizeObserver.disconnect();
                tooltipResizeObserver = undefined;
            }
            chartHeightGuards.forEach(id => clearTimeout(id));
            chartHeightGuards = [];
        },
       content: $(`
            <div class="preview-outbox preview-outbox-${ct.shortId}">
                <div class="first-row">
                    <div class="preview-name">
                        <div class="preview-img"><img src="${escapeHtml(ct.Labels['net.unraid.docker.icon'] || '')}" class="img folder-img" onerror='this.src="/plugins/dynamix.docker.manager/images/question.png"'></div>
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
                        <div class="info-ports" id="info-ports-${ct.shortId}" style="display: none;">${ct.info.Ports?.length > 10 ? (`<span class="info-ports-more" style="display: none;">${ct.info.Ports?.map(e=>`${e.PrivateIP ? escapeHtml(e.PrivateIP) + ':' : ''}${escapeHtml(e.PrivatePort)}/${escapeHtml((e.Type||'').toUpperCase())} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? escapeHtml(e.PublicIP) + ':' : ''}${escapeHtml(e.PublicPort)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-ports-less').css('display', 'inline')">${$.i18n('compress')}</a></span><span class="info-ports-less">${ct.info.Ports?.slice(0,10).map(e=>`${e.PrivateIP ? escapeHtml(e.PrivateIP) + ':' : ''}${escapeHtml(e.PrivatePort)}/${escapeHtml((e.Type||'').toUpperCase())} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? escapeHtml(e.PublicIP) + ':' : ''}${escapeHtml(e.PublicPort)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-ports-more').css('display', 'inline')">${$.i18n('expand')}</a></span>`) : (`<span class="info-ports-mono">${ct.info.Ports?.map(e=>`${e.PrivateIP ? escapeHtml(e.PrivateIP) + ':' : ''}${escapeHtml(e.PrivatePort)}/${escapeHtml((e.Type||'').toUpperCase())} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? escapeHtml(e.PublicIP) + ':' : ''}${escapeHtml(e.PublicPort)}`).join('<br>') || ''}</span>`)}</div>
                        <div class="info-volumes" id="info-volumes-${ct.shortId}" style="display: none;">${ct.Mounts?.filter(e => e.Type==='bind').length > 10 ? (`<span class="info-volumes-more" style="display: none;">${ct.Mounts?.filter(e => e.Type==='bind').map(e=>`${escapeHtml(e.Destination)} <i class="fa fa-arrows-h"></i> ${escapeHtml(e.Source)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-volumes-less').css('display', 'inline')">${$.i18n('compress')}</a></span><span class="info-volumes-less">${ct.Mounts?.filter(e => e.Type==='bind').slice(0,10).map(e=>`${escapeHtml(e.Destination)} <i class="fa fa-arrows-h"></i> ${escapeHtml(e.Source)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-volumes-more').css('display', 'inline')">${$.i18n('expand')}</a></span>`) : (`<span class="info-volumes-mono">${ct.Mounts?.filter(e => e.Type==='bind').map(e=>`${escapeHtml(e.Destination)} <i class="fa fa-arrows-h"></i> ${escapeHtml(e.Source)}`).join('<br>') || ''}</span>`)}</div>
                    </div>
                </div>
            </div>
        `)
    });
};
