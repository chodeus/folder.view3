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

// Convert a byte count to a human-readable memory string (B/KiB/MiB/...).
window.bToMem = window.bToMem || ((b) => {
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

// Variables tab helpers; .github/scripts/variables_tab_test.js runs them outside the page
(() => {
    const COMMON = ['PUID', 'PGID', 'UMASK', 'TZ', 'HOST_OS', 'HOST_HOSTNAME', 'HOST_CONTAINERNAME'];
    // Over-masking costs one click; a miss puts a secret in someone's screenshot
    const SECRET_NAME = /pass|secret|token|key|auth|credential|claim|webhook|private|cookie|session|salt|(?:^|[_-])pwd?(?:$|[_-])/i;
    const DOTS = '••••••••';
    const imageEnvCache = new Map();
    const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const byKey = (a, b) => a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' });
    const redacts = (s) => typeof fv3RedactString === 'function' && fv3RedactString(s) !== s;

    window.fv3EnvIsSecret = (key, value, templateMask) => templateMask === true || SECRET_NAME.test(key) || redacts(value);

    // Any secret-looking NAME= or --flag hides the whole text: quoted values make partial masking leak
    window.fv3EnvParamsSecret = (text) => {
        const s = String(text);
        const names = [...s.matchAll(/([A-Za-z0-9_.-]+)=/g), ...s.matchAll(/(?:^|[\s'"=])--?([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1]);
        return names.some((n) => SECRET_NAME.test(n)) || redacts(s);
    };

    // Set for this container (template order first), Common (pinned last), and values identical to the image's own
    window.fv3EnvGroups = (env, imageEnv, templateVars) => {
        const tpl = Array.isArray(templateVars) ? templateVars : [];
        const order = new Map(tpl.map((v, i) => [v.target, i]));
        const fromImage = new Set(Array.isArray(imageEnv) ? imageEnv : []);
        const groups = { main: [], common: [], image: [] };
        for (const entry of Array.isArray(env) ? env : []) {
            if (typeof entry !== 'string') continue;
            const eq = entry.indexOf('=');
            const key = eq < 0 ? entry : entry.slice(0, eq);
            const value = eq < 0 ? '' : entry.slice(eq + 1);
            const t = order.has(key) ? tpl[order.get(key)] : null;
            const row = { key, value, label: t?.name && squash(t.name) !== squash(key) ? t.name : '', secret: fv3EnvIsSecret(key, value, t?.mask) };
            if (COMMON.includes(key)) groups.common.push(row);
            else if (t || !fromImage.has(entry)) groups.main.push(row);
            else groups.image.push(row);
        }
        groups.main.sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity) || byKey(a, b));
        groups.common.sort((a, b) => COMMON.indexOf(a.key) - COMMON.indexOf(b.key));
        groups.image.sort(byKey);
        return groups;
    };

    // From the labels Compose puts on every container it creates (docker/compose pkg/api/labels.go)
    window.fv3EnvComposeRows = (labels) => {
        const l = labels && typeof labels === 'object' ? labels : {};
        if (!l['com.docker.compose.project']) return [];
        const list = (v) => String(v ?? '').split(',').map((s) => s.trim());
        return [
            { key: 'compose-project', fallback: 'Project', values: [l['com.docker.compose.project']] },
            { key: 'compose-service', fallback: 'Service', values: [l['com.docker.compose.service']] },
            { key: 'compose-files', fallback: 'Compose files', values: list(l['com.docker.compose.project.config_files']) },
            { key: 'compose-env-files', fallback: 'Env files', values: list(l['com.docker.compose.project.environment_file']) },
            { key: 'compose-folder', fallback: 'Folder', values: [l['com.docker.compose.project.working_dir']] },
            // "service:condition:restart,…" (docker/compose pkg/compose/create.go)
            { key: 'compose-depends-on', fallback: 'Depends on', values: list(l['com.docker.compose.depends_on']).map((d) => d.split(':')[0]) }
        ].map((r) => ({ ...r, values: r.values.filter((v) => typeof v === 'string' && v !== '') })).filter((r) => r.values.length);
    };

    // Every attached network (NetworkMode's first); everything else only when it differs from Docker's default
    window.fv3EnvRuntimeRows = (info) => {
        const hc = info?.HostConfig || {};
        const rows = [];
        const mode = typeof hc.NetworkMode === 'string' ? hc.NetworkMode : '';
        const nets = info?.NetworkSettings?.Networks && typeof info.NetworkSettings.Networks === 'object' ? info.NetworkSettings.Networks : {};
        const names = [...new Set([mode, ...Object.keys(nets).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))])].filter(Boolean);
        if (names.length) {
            rows.push({ key: 'runtime-network', fallback: 'Network', values: names.map((n) => (nets[n]?.IPAddress ? `${n} · ${nets[n].IPAddress}` : n)), personal: true });
        }
        const gpus = (Array.isArray(hc.DeviceRequests) ? hc.DeviceRequests : [])
            .filter((r) => Array.isArray(r?.Capabilities) && r.Capabilities.some((c) => Array.isArray(c) && c.includes('gpu')))
            .map((r) => r.Count === -1 ? fv3I18nOr('runtime-gpu-all', 'All GPUs') : (Array.isArray(r.DeviceIDs) && r.DeviceIDs.length ? r.DeviceIDs.join(', ') : String(r.Count)));
        if (hc.Runtime === 'nvidia') gpus.unshift('nvidia');
        if (gpus.length) rows.push({ key: 'runtime-gpu', fallback: 'GPU', values: gpus });
        if (typeof hc.Runtime === 'string' && hc.Runtime !== '' && !['runc', 'nvidia'].includes(hc.Runtime)) rows.push({ key: 'runtime-oci', fallback: 'OCI runtime', values: [hc.Runtime] });
        if (typeof hc.CpusetCpus === 'string' && hc.CpusetCpus !== '') rows.push({ key: 'runtime-cpu-pinning', fallback: 'CPU pinning', values: [hc.CpusetCpus] });
        const devices = (Array.isArray(hc.Devices) ? hc.Devices : []).map((d) => d.PathOnHost === d.PathInContainer ? String(d.PathOnHost) : `${d.PathOnHost} → ${d.PathInContainer}`);
        if (devices.length) rows.push({ key: 'runtime-devices', fallback: 'Devices', values: devices });
        if (hc.Privileged === true) rows.push({ key: 'runtime-privileged', fallback: 'Privileged', values: [fv3I18nOr('yes', 'Yes')] });
        if (hc.Memory > 0) rows.push({ key: 'runtime-memory', fallback: 'Memory limit', values: [bToMem(hc.Memory)] });
        if (Array.isArray(hc.CapAdd) && hc.CapAdd.length) rows.push({ key: 'runtime-capabilities', fallback: 'Capabilities', values: [hc.CapAdd.join(', ')] });
        const restart = hc.RestartPolicy?.Name;
        if (typeof restart === 'string' && restart !== '' && restart !== 'no') {
            const retries = hc.RestartPolicy.MaximumRetryCount;
            rows.push({ key: 'runtime-restart', fallback: 'Restart policy', values: [restart === 'on-failure' && retries > 0 ? `${restart} (${retries})` : restart] });
        }
        return rows;
    };

    // Masked values are never written into the page until revealed
    window.fv3EnvPanelHtml = (ct, state) => {
        const text = (s) => escapeHtml(String(s));
        if (state.loading) return `<div class="fv3-env-note">${text(fv3I18nOr('env-loading', 'Loading…'))}</div>`;
        const incognito = state.incognito === true;
        const hidden = fv3I18nOr('incognito-hidden', '[hidden]');
        const heading = (label) => `<div class="fv3-env-heading">${text(label)}</div>`;
        const reveal = (id, open) => {
            const label = text(open ? fv3I18nOr('env-hide-value', 'Hide value') : fv3I18nOr('env-show-value', 'Show value'));
            return `<a href="#" class="fv3-env-reveal" data-fv3-env-reveal="${text(id)}" role="button" aria-label="${label}" title="${label}"><i class="fa fa-${open ? 'eye-slash' : 'eye'}" aria-hidden="true"></i></a>`;
        };
        const row = (r, dim) => {
            const masked = incognito || (r.secret && !state.revealed.has(`env:${r.key}`));
            const value = masked ? DOTS : r.value === '' ? fv3I18nOr('env-empty', '(empty)') : r.value;
            return `<div class="fv3-env-row${dim ? ' fv3-env-dim' : ''}"><div class="fv3-env-name"><span class="fv3-env-key">${text(r.key)}</span>`
                + (r.label ? `<span class="fv3-env-label">${text(r.label)}</span>` : '')
                + `</div><div class="fv3-env-cell"><span class="fv3-env-value${masked || r.value === '' ? ' fv3-env-muted' : ''}">${text(value)}</span>`
                + (r.secret && !incognito ? reveal(`env:${r.key}`, !masked) : '') + '</div></div>';
        };
        const params = (label, value, id) => {
            const secret = value !== '' && fv3EnvParamsSecret(value);
            const masked = secret && !state.revealed.has(`params:${id}`);
            const shown = value === '' ? fv3I18nOr('env-params-none', 'None') : incognito ? hidden : masked ? DOTS : value;
            return heading(label) + `<div class="fv3-env-cell"><div class="fv3-env-code${value === '' || masked || incognito ? ' fv3-env-muted' : ''}">${text(shown)}</div>`
                + (secret && !incognito ? reveal(`params:${id}`, !masked) : '') + '</div>';
        };
        const props = (rows, personal) => rows.map((r) => `<div class="fv3-env-row"><span class="fv3-env-prop">${text(fv3I18nOr(r.key, r.fallback))}</span>`
            + `<span class="fv3-env-value">${(incognito && (personal || r.personal) ? [hidden] : r.values).map(text).join('<br>')}</span></div>`).join('');

        const groups = fv3EnvGroups(ct.info?.Config?.Env, state.imageEnv, ct.info?.template?.variables);
        let html = heading(fv3I18nOr('variables', 'Variables'));
        if (!groups.main.length && !groups.common.length && !groups.image.length) html += `<div class="fv3-env-note">${text(fv3I18nOr('env-none', 'No variables set'))}</div>`;
        html += groups.main.map((r) => row(r, false)).join('');
        if (groups.common.length) html += `<div class="fv3-env-group">${text(fv3I18nOr('env-common', 'Common'))}</div>` + groups.common.map((r) => row(r, true)).join('');
        if (groups.image.length) {
            const label = state.showImage ? fv3I18nOr('env-image-hide', 'Hide image defaults') : fv3I18nOr('env-image-show', 'Show $1 image defaults', groups.image.length);
            html += `<a href="#" class="fv3-env-more" role="button" aria-expanded="${state.showImage === true}"><i class="fa fa-chevron-${state.showImage ? 'down' : 'right'}" aria-hidden="true"></i> ${text(label)}</a>`;
            if (state.showImage) html += groups.image.map((r) => row(r, true)).join('');
        }
        const tpl = ct.info?.template;
        if (tpl) {
            html += params(fv3I18nOr('extra-parameters', 'Extra Parameters'), typeof tpl.extraParams === 'string' ? tpl.extraParams : '', 'extra');
            if (typeof tpl.postArgs === 'string' && tpl.postArgs !== '') html += params(fv3I18nOr('post-arguments', 'Post Arguments'), tpl.postArgs, 'post');
        }
        const compose = fv3EnvComposeRows(ct.Labels ?? ct.info?.Config?.Labels);
        if (compose.length) html += heading(fv3I18nOr('compose', 'Compose')) + props(compose, true);
        const runtime = fv3EnvRuntimeRows(ct.info);
        if (runtime.length) html += heading(fv3I18nOr('runtime', 'Runtime')) + props(runtime, false);
        return html;
    };

    // One request per image per page; a failed one leaves the cache so the next view asks again
    window.fv3ImageEnv = (imageId) => {
        if (!imageEnvCache.has(imageId)) {
            const request = Promise.resolve($.get('/plugins/folder.view3/server/read_image_env.php', { image: imageId })).then((raw) => {
                const env = fv3SafeParse(raw, null)?.env;
                if (!Array.isArray(env)) throw new Error('read_image_env.php returned no env list');
                return env;
            });
            request.catch(() => imageEnvCache.delete(imageId));
            imageEnvCache.set(imageId, request);
        }
        return imageEnvCache.get(imageId);
    };

    // One per popup: the tab's state, its redraws and its clicks
    window.fv3EnvTab = (ct) => {
        const state = { revealed: new Set(), showImage: false, imageEnv: undefined, loading: false };
        let $panel = null;
        const render = () => { if ($panel) $panel.html(fv3EnvPanelHtml(ct, { ...state, incognito: !!window.fv3Incognito })); };
        const show = () => {
            if (state.imageEnv === undefined && !state.loading && typeof ct.ImageID === 'string') {
                state.loading = true;
                fv3ImageEnv(ct.ImageID)
                    .then((env) => { state.imageEnv = env; }, (e) => fv3DebugWarn('variablesTab', ct.shortId, 'image defaults unavailable:', fv3FailReason(e)))
                    .then(() => { state.loading = false; render(); });
            }
            render();
        };
        return {
            bind($el) {
                $panel = $el;
                // stopPropagation: the redraw detaches the clicked link, so tooltipster's click-outside check would close the popup
                $panel.on('click', '.fv3-env-reveal', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.fv3Incognito) return;
                    const id = this.getAttribute('data-fv3-env-reveal');
                    if (state.revealed.has(id)) state.revealed.delete(id); else state.revealed.add(id);
                    render();
                    $panel.find(`[data-fv3-env-reveal="${CSS.escape(id)}"]`).trigger('focus');
                }).on('click', '.fv3-env-more', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    state.showImage = !state.showImage;
                    render();
                    $panel.find('.fv3-env-more').trigger('focus');
                });
            },
            show,
            // Redrawn on re-open only while it is the active tab: incognito may have changed meanwhile
            refresh() { if ($panel && $panel.attr('aria-hidden') === 'false') show(); },
            // A revealed value never outlives the popup
            close() { if (state.revealed.size) { state.revealed.clear(); render(); } }
        };
    };
})();

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

    const envTab = fv3EnvTab(ct);

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
                    actionItems.push(`<li><a onclick="event.preventDefault(); openTerminal('docker', ${fv3JsArg(ct.info.Name)}, ${fv3JsArg(ct.info.Shell)});"><i class="fa fa-terminal" aria-hidden="true"></i> ${$.i18n('console')}</a></li>`);
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
                actionItems.push(`<li><a onclick="event.preventDefault(); openTerminal('docker', ${fv3JsArg(ct.info.Name)}, '.log');"><i class="fa fa-navicon" aria-hidden="true"></i> ${$.i18n('logs')}</a></li>`);
                if (ct.info.template) actionItems.push(`<li><a onclick="event.preventDefault(); editContainer(${fv3JsArg(ct.info.Name)}, ${fv3JsArg(ct.info.template.path)});"><i class="fa fa-wrench" aria-hidden="true"></i> ${$.i18n('edit')}</a></li>`);
                actionItems.push(`<li><a onclick="event.preventDefault(); rmContainer(${fv3JsArg(ct.info.Name)}, '${ct.shortImageId}', '${ct.shortId}');"><i class="fa fa-trash" aria-hidden="true"></i> ${$.i18n('remove')}</a></li>`);
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
                            data: { datasets: [ { label: fv3I18nOr('mem', 'MEM'), data: MEM, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), tension: 0.4, pointRadius: 0, borderWidth: 1 } ] },
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
                            data: { datasets: [ { label: fv3I18nOr('mem', 'MEM'), data: MEM, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), tension: 0.4, pointRadius: 0, borderWidth: 1 } ] },
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
                                    { label: fv3I18nOr('mem', 'MEM'), data: MEM, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--folder-view3-graph-mem'), tension: 0.4, pointRadius: 0, borderWidth: 1 }
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
                envTab.bind($(`.preview-outbox-${ct.shortId} .info-env`, tooltipDomEl));
                $(`.preview-outbox-${ct.shortId} .info-section`, tooltipDomEl).tabs({
                    heightStyle: 'auto',
                    disabled: diabled,
                    active: active,
                    activate: (event, ui) => { if (ui.newPanel.hasClass('info-env')) envTab.show(); }
                });
                $(`.preview-outbox-${ct.shortId} table > tbody div.status-autostart > input[type="checkbox"]`, tooltipDomEl).on("change", advancedAutostart);
            } else {
                 fv3DebugWarn('tooltipster', ct.shortId, 'Autostart switch placeholder not found as expected in tooltip.');
            }
            envTab.refresh();

            if (window.innerWidth <= 768) {
                fv3Debug('tooltipster', ct.shortId, 'Mobile detected — applying hybrid accordion layout.');
                const $secondRow = $(`.preview-outbox-${ct.shortId} .second-row`, tooltipDomEl);
                const $actionInfo = $secondRow.children('.action-info');
                const $infoSection = $secondRow.children('.info-section');
                const $infoCt = $actionInfo.children('.info-ct');

                const $actionsDetails = $(`<details class="fv3-mobile-details" open><summary>${fv3I18nOr('quick-actions', 'Quick Actions')}</summary></details>`);
                $actionInfo.before($actionsDetails);
                $actionsDetails.append($actionInfo);

                const $graphDetails = $(`<details class="fv3-mobile-details"><summary>${fv3I18nOr('graph-details', 'Graph & Details')}</summary></details>`);
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
            envTab.close();
        },
       content: $(`
            <div class="preview-outbox preview-outbox-${ct.shortId}">
                <div class="first-row">
                    <div class="preview-name">
                        <div class="preview-img"><img src="${escapeHtml(ct.Labels?.['net.unraid.docker.icon'] || '/plugins/dynamix.docker.manager/images/question.png')}" class="img folder-img" onerror='this.onerror=null;this.src="/plugins/dynamix.docker.manager/images/question.png"'></div>
                        <div class="preview-actual-name">
                            <span class="blue-text appname">${escapeHtml(ct.info.Name)}</span><br>
                            <i class="fa fa-${ct.info.State.Running ? (ct.info.State.Paused ? 'pause' : 'play') : 'square'} ${ct.info.State.Running ? (ct.info.State.Paused ? 'paused' : 'started') : 'stopped'} ${ct.info.State.Running ? (ct.info.State.Paused ? 'orange-text' : 'green-text') : 'red-text'}"></i>
                            <span class="state"> ${ct.info.State.Running ? (ct.info.State.Paused ? $.i18n('paused') : $.i18n('started')) : $.i18n('stopped')}</span>
                        </div>
                    </div>
                    <table class="preview-status">
                        <thead class="status-header"><tr><th class="status-header-version">${$.i18n('version')}</th><th class="status-header-stats">${fv3I18nOr('cpu-mem', 'CPU/MEM')}</th><th class="status-header-autostart">${$.i18n('autostart')}</th></tr></thead>
                        <tbody><tr>
                            <td><div class="status-version">${ct.info.State.manager === 'composeman' ? `<span class="folder-update-text"><i class="fa fa-docker fa-fw"></i> ${$.i18n('compose')}</span>` : ct.info.State.manager !== 'dockerman' ? `<span class="folder-update-text"><i class="fa fa-docker fa-fw"></i> ${$.i18n('third-party')}</span>` : !fv3HasUpdate(ct) ? `<span class="green-text folder-update-text"><i class="fa fa-check fa-fw"></i>${$.i18n('up-to-date')}</span><br><a class="exec" onclick="hideAllTips(); updateContainer(${fv3JsArg(ct.info.Name)});"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i>${$.i18n('force-update')}</span></a>` : `<span class="orange-text folder-update-text" style="white-space:nowrap;"><i class="fa fa-flash fa-fw"></i>${$.i18n('update-ready')}</span><br><a class="exec" onclick="hideAllTips(); updateContainer(${fv3JsArg(ct.info.Name)});"><span style="white-space:nowrap;"><i class="fa fa-cloud-download fa-fw"></i>${$.i18n('apply-update')}</span></a>`}<br><i class="fa fa-info-circle fa-fw"></i> ${escapeHtml(ct.info.Config.Image.split(':').pop())}</div></td>
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
                                         <li><a onclick="event.preventDefault(); openTerminal('docker', ${fv3JsArg(ct.info.Name)}, ${fv3JsArg(ct.info.Shell)});"><i class="fa fa-terminal" aria-hidden="true"></i> ${$.i18n('console')}</a></li>`
                                    : ''}
                                    ${!ct.info.State.Running ? `<li><a onclick="event.preventDefault(); eventControl({action:'start', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-play" aria-hidden="true"></i> ${$.i18n('start')}</a></li>` :
                                        `${ct.info.State.Paused ? `<li><a onclick="event.preventDefault(); eventControl({action:'resume', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-play" aria-hidden="true"></i> ${$.i18n('resume')}</a></li>` :
                                            `<li><a onclick="event.preventDefault(); eventControl({action:'stop', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-stop" aria-hidden="true"></i> ${$.i18n('stop')}</a></li>
                                             <li><a onclick="event.preventDefault(); eventControl({action:'pause', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-pause" aria-hidden="true"></i> ${$.i18n('pause')}</a></li>`}
                                    <li><a onclick="event.preventDefault(); eventControl({action:'restart', container:'${ct.shortId}'}, 'loadlist');"><i class="fa fa-refresh" aria-hidden="true"></i> ${$.i18n('restart')}</a></li>`}
                                    <li><a onclick="event.preventDefault(); openTerminal('docker', ${fv3JsArg(ct.info.Name)}, '.log');"><i class="fa fa-navicon" aria-hidden="true"></i> ${$.i18n('logs')}</a></li>
                                    ${ct.info.template ? `<li><a onclick="event.preventDefault(); editContainer(${fv3JsArg(ct.info.Name)}, ${fv3JsArg(ct.info.template.path)});"><i class="fa fa-wrench" aria-hidden="true"></i> ${$.i18n('edit')}</a></li>` : ''}
                                    <li><a onclick="event.preventDefault(); rmContainer(${fv3JsArg(ct.info.Name)}, '${ct.shortImageId}', '${ct.shortId}');"><i class="fa fa-trash" aria-hidden="true"></i> ${$.i18n('remove')}</a></li>
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
                            <li><a class="tabs-env localURL" href="#info-env-${ct.shortId}">${fv3I18nOr('variables', 'Variables')}</a></li>
                        </ul>
                        <div class="comb-graph-${ct.shortId} comb-stat-graph" id="comb-graph-${ct.shortId}" style="display: none;"><canvas></canvas></div>
                        <div class="cpu-graph-${ct.shortId} cpu-stat-graph" id="cpu-graph-${ct.shortId}" style="display: none;"><canvas></canvas></div>
                        <div class="mem-graph-${ct.shortId} mem-stat-graph" id="mem-graph-${ct.shortId}" style="display: none;"><canvas></canvas></div>
                        <div class="info-ports" id="info-ports-${ct.shortId}" style="display: none;">${ct.info.Ports?.length > 10 ? (`<span class="info-ports-more" style="display: none;">${ct.info.Ports?.map(e=>`${e.PrivateIP ? escapeHtml(e.PrivateIP) + ':' : ''}${escapeHtml(e.PrivatePort)}/${escapeHtml((e.Type||'').toUpperCase())} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? escapeHtml(e.PublicIP) + ':' : ''}${escapeHtml(e.PublicPort)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-ports-less').css('display', 'inline')">${$.i18n('compress')}</a></span><span class="info-ports-less">${ct.info.Ports?.slice(0,10).map(e=>`${e.PrivateIP ? escapeHtml(e.PrivateIP) + ':' : ''}${escapeHtml(e.PrivatePort)}/${escapeHtml((e.Type||'').toUpperCase())} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? escapeHtml(e.PublicIP) + ':' : ''}${escapeHtml(e.PublicPort)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-ports-more').css('display', 'inline')">${$.i18n('expand')}</a></span>`) : (`<span class="info-ports-mono">${ct.info.Ports?.map(e=>`${e.PrivateIP ? escapeHtml(e.PrivateIP) + ':' : ''}${escapeHtml(e.PrivatePort)}/${escapeHtml((e.Type||'').toUpperCase())} <i class="fa fa-arrows-h"></i> ${e.PublicIP ? escapeHtml(e.PublicIP) + ':' : ''}${escapeHtml(e.PublicPort)}`).join('<br>') || ''}</span>`)}</div>
                        <div class="info-volumes" id="info-volumes-${ct.shortId}" style="display: none;">${ct.Mounts?.filter(e => e.Type==='bind').length > 10 ? (`<span class="info-volumes-more" style="display: none;">${ct.Mounts?.filter(e => e.Type==='bind').map(e=>`${escapeHtml(e.Destination)} <i class="fa fa-arrows-h"></i> ${escapeHtml(e.Source)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-volumes-less').css('display', 'inline')">${$.i18n('compress')}</a></span><span class="info-volumes-less">${ct.Mounts?.filter(e => e.Type==='bind').slice(0,10).map(e=>`${escapeHtml(e.Destination)} <i class="fa fa-arrows-h"></i> ${escapeHtml(e.Source)}`).join('<br>') || ''}<br><a onclick="event.preventDefault(); $(this).parent().css('display', 'none').siblings('.info-volumes-more').css('display', 'inline')">${$.i18n('expand')}</a></span>`) : (`<span class="info-volumes-mono">${ct.Mounts?.filter(e => e.Type==='bind').map(e=>`${escapeHtml(e.Destination)} <i class="fa fa-arrows-h"></i> ${escapeHtml(e.Source)}`).join('<br>') || ''}</span>`)}</div>
                        <div class="info-env" id="info-env-${ct.shortId}" style="display: none;"></div>
                    </div>
                </div>
            </div>
        `)
    });
};
