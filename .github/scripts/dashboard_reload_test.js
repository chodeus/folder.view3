// node .github/scripts/dashboard_reload_test.js — the Dashboard's Docker and VM tiles when list reloads overlap, a folder request hangs or
// fails: every list Unraid renders ends with its folder tiles, or with Unraid's own tiles and one banner (npm ci in this folder first)
'use strict';
const { makePage, check, done } = require('./preview_pages_harness.js');

const DASH_LIST = '/webGui/include/DashboardApps.php';
const DOCKER_FOLDERS = { apps: { name: 'Apps', icon: '', regex: '', containers: ['web'], settings: {}, hidden_preview: [], actions: [] } };
const VM_FOLDERS = { lab: { name: 'Lab', icon: '', regex: '', containers: ['vm1'], settings: {}, hidden_preview: [], actions: [] } };
// Unraid's tile rows (DashboardApps.php), cut to what dashboard.js reads
const dockerRow = (n, state = 'started') => `<tr class="updated" data-list="${n}"><td><span class="outer solid apps ${state}"><span id="aaaaaaaaaaaa" class="hand"><img class="img" src=""></span>` +
    `<span class="inner"><span>web</span><br><i class="fa ${state === 'started' ? 'fa-play started green-text' : 'fa-square stopped red-text'}"></i><span class="state">${state}</span></span></span></td></tr>`;
const vmRow = (n) => `<tr class="updated" data-list="${n}"><td><span class="outer solid vms stopped"><span id="vm-u1" class="hand"><img class="img" src=""></span>` +
    '<span class="inner">vm1<br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span></td></tr>';

// The Dashboard with the tiles asked for. Unraid's list request goes through jQuery's own ajax and land(i) answers request i; the
// read.php answers of each type are held until answer(type, i, folders | Error)
// debug: FV3's debug mode on; failingDebugOrder: the type whose debug-mode read_unraid_order.php request fails (the reload's own
// read of that URL comes first and succeeds); layout: both tiles' Dashboard layout; hideStopped: both "hide stopped" boxes are ticked
// and the container is stopped, as the VM is. Animation frames run on the harness clock
const dashboard = async ({ docker = true, vms = true, debug = false, failingDebugOrder = null, layout = 'classic', hideStopped = false } = {}) => {
    const info = {};
    const p = await makePage({ page: 'dashboard', api: false, answers: {
        'read_order.php': () => '[]', 'read_unraid_order.php': (url) => JSON.stringify(['web']), 'docker_load.php': () => '',
        'read_info.php': () => JSON.stringify(info), 'version.php': () => '2026.11.13.1',
        'list_themes.php': () => '[]', 'read_css_config.php': () => '{}',
        'read_settings.php': () => JSON.stringify({ dashboard_context: '2', dashboard_docker_layout: layout, dashboard_vm_layout: layout }),
    } });
    p.w.requestAnimationFrame = (fn) => p.w.setTimeout(() => fn(p.w.Date.now()), 16);
    p.w.cancelAnimationFrame = (id) => p.w.clearTimeout(id);
    // At each folder opening: how many full-width panels its tile had right then (an extension listening sees the same)
    const opened = { docker: [], vm: [] };
    ['docker', 'vm'].forEach((type) => p.w.folderEvents.addEventListener(`${type}-post-folder-expansion`, () => opened[type].push(p.$(`#${type}_view .fv3-fullwidth-panel`).length)));
    // When the page reports a tile's folders built: how many full-width panels it had right then
    const built = { docker: [], vm: [] };
    ['docker', 'vm'].forEach((type) => p.w.folderEvents.addEventListener(`${type}-post-folders-creation`, () => built[type].push(p.$(`#${type}_view .fv3-fullwidth-panel`).length)));
    p.w.FV3_DEBUG = debug;
    info.web = p.ct('aaaaaaaaaaaa', 'web');
    if (hideStopped) {
        info.web.info.State.Running = false;
        p.$('body').append('<input id="apps" type="checkbox" checked><input id="vms" type="checkbox" checked>');
    }
    if (!docker) p.$('tbody#docker_view').remove();
    if (vms) p.$('div.Dashboard table').append('<tbody id="vm_view"></tbody>');
    const sent = [];
    p.w.XMLHttpRequest = class {
        open(method, url) { this.url = url; }
        setRequestHeader() {}
        getAllResponseHeaders() { return 'Content-Type: text/html\r\n'; }
        send() { sent.push(this); }
        abort() {}
    };
    let rendered = 0;
    // Unraid's callback: both tiles' tr.updated rows go, the new ones are appended
    p.w.loadlist_original = () => p.realAjax({ url: DASH_LIST, type: 'POST', data: {}, success: () => {
        rendered++;
        p.$('#docker_view tr.updated').remove();
        p.$('#vm_view tr.updated').remove();
        p.$('#docker_view').append(dockerRow(rendered, hideStopped ? 'stopped' : 'started'));
        p.$('#vm_view').append(vmRow(rendered));
    } });
    const reads = { docker: [], vm: [] };
    // Every URL the page asked for, in order
    const urls = [];
    const orderReads = { docker: 0, vm: 0 };
    const get = p.$.get;
    p.$.get = (url) => {
        urls.push(url);
        const order = url.match(/read_unraid_order\.php\?type=(docker|vm)/);
        if (order) orderReads[order[1]]++;
        const read = url.match(/\/read\.php\?type=(docker|vm)/);
        if (read) {
            const d = p.$.Deferred();
            reads[read[1]].push(d);
            return d;
        }
        if (order && order[1] === failingDebugOrder && orderReads[order[1]] > 1) return p.$.Deferred().reject({ status: 500, statusText: 'error' });
        if (url.includes('read_info.php?type=vm')) return p.$.Deferred().resolve({ vm1: { uuid: 'u1', state: 'shutoff', autostart: false } });
        if (url.includes('read_unraid_order.php?type=vm')) return p.$.Deferred().resolve(['vm1']);
        return get(url);
    };
    // The folder tiles in a tile with the names drawn into each, as `id:name`
    const tiles = (tbody) => p.$(`#${tbody} .folder-showcase-outer`).toArray().map((el) => `${el.className.match(/folder-showcase-outer-(\S+)/)[1]}:` +
        p.$(el).find('div.folder-storage span.inner').toArray().map((inner) => p.$(inner).contents().first().text().trim()).join()).join(' ');
    return {
        p, sent, urls,
        docker: () => tiles('docker_view'),
        vms: () => tiles('vm_view'),
        list: () => p.$('#docker_view tr.updated, #vm_view tr.updated').first().attr('data-list'),
        banners: () => p.errors.filter((e) => /Banner:/.test(e)),
        // The draw record of one tile's drawer, or of both when no type is given
        log: (type) => (p.w.fv3DrawLog || []).filter((d) => !type || d.list.includes(`${type}_view`)).map((d) => `${d.outcome}:${d.folders}`).join(),
        opened: (type) => opened[type].join(),
        built: (type) => built[type].join(),
        panels: (type) => p.$(`#${type}_view .fv3-fullwidth-panel`).length,
        laidOut: (type) => p.$(`#${type}_view > tr.updated > td`).hasClass(`fv3-layout-${layout}`),
        hidden: (type) => p.$(`#${type}_view .folder-showcase-outer`).hasClass('fv3-hidden'),
        shownPanels: (type) => p.$(`#${type}_view .fv3-fullwidth-panel`).toArray().filter((el) => el.style.display !== 'none').length,
        // The names shown in a tile's full-width panels
        inPanels: (type) => p.$(`#${type}_view .fv3-fullwidth-panel span.outer`).toArray().filter((el) => el.style.display !== 'none')
            .map((el) => p.$(el).find('span.inner').contents().first().text().trim()).join(),
        reload: () => p.g('loadlist()'),
        land: async (i) => { if (sent[i]) { Object.assign(sent[i], { status: 200, statusText: 'OK', responseText: 'rows', readyState: 4 }); sent[i].onload(); } await p.tick(300); },
        // wait: how far the clock moves after the answer (0 holds the next animation frames)
        answer: async (type, i, set, wait = 300) => {
            if (!reads[type][i]) return;
            if (set instanceof Error) reads[type][i].reject({ status: 500, statusText: 'error' }); else reads[type][i].resolve(JSON.parse(JSON.stringify(set)));
            await p.tick(wait);
        },
    };
};

(async () => {
    {
        const t = await dashboard();
        t.reload();
        await t.land(0);
        await t.answer('docker', 0, DOCKER_FOLDERS);
        await t.answer('vm', 0, VM_FOLDERS);
        check('both tiles, one reload: each tile has its folder with its member', t.docker() === 'apps:web' && t.vms() === 'lab:vm1', { docker: t.docker(), vms: t.vms() });
        check('both tiles, one reload: each tile\'s draw record counts its folder tile', t.log('docker') === 'drawn:1' && t.log('vm') === 'drawn:1', t.log());
        check('both tiles, one reload: no page errors or banners', t.p.errors.length === 0, t.p.errors);
    }
    {
        // The Docker data is in, the VM data is not, and list 2 lands in that wait: list 2 must end with both folder tiles
        const t = await dashboard();
        t.reload();
        t.reload();
        await t.land(0);
        await t.answer('docker', 0, DOCKER_FOLDERS);
        await t.answer('docker', 1, DOCKER_FOLDERS);
        const beforeVmData = t.docker();
        await t.land(1);
        await t.answer('vm', 0, VM_FOLDERS);
        await t.answer('vm', 1, VM_FOLDERS);
        check('both tiles, a list lands while the VM data is still on its way: the Docker tile is drawn without waiting for it', beforeVmData === 'apps:web', beforeVmData);
        check('both tiles, a list lands while the VM data is still on its way: that list has both folder tiles', t.list() === '2' && t.docker() === 'apps:web' && t.vms() === 'lab:vm1',
            { list: t.list(), docker: t.docker(), vms: t.vms(), log: t.log() });
    }
    {
        // A VM read that never answers (libvirt stuck): the Docker tile is drawn from its own data all the same
        const t = await dashboard();
        t.reload();
        await t.land(0);
        await t.answer('docker', 0, DOCKER_FOLDERS);
        check('both tiles, the VM read hangs: the Docker tile has its folder', t.docker() === 'apps:web' && t.log('docker') === 'drawn:1', { docker: t.docker(), log: t.log() });
        check('both tiles, the VM read hangs: the VM tile waits, with no error', t.vms() === '' && t.p.errors.length === 0, { vms: t.vms(), errors: t.p.errors });
    }
    {
        // A folder request that never answers: the next reload's answers are drawn on its list
        const t = await dashboard();
        t.reload();
        await t.land(0);
        t.reload();
        await t.land(1);
        await t.answer('docker', 1, DOCKER_FOLDERS);
        await t.answer('vm', 1, VM_FOLDERS);
        check('a folder request that never answers: the next reload\'s list is drawn', t.list() === '2' && t.docker() === 'apps:web' && t.vms() === 'lab:vm1',
            { list: t.list(), docker: t.docker(), vms: t.vms(), log: t.log() });
    }
    {
        // A request that fails after a newer reload asked again: no banner, the newer data is drawn
        const t = await dashboard();
        t.reload();
        await t.land(0);
        t.reload();
        await t.answer('docker', 0, new Error('500'));
        await t.answer('vm', 0, new Error('500'));
        await t.land(1);
        await t.answer('docker', 1, DOCKER_FOLDERS);
        await t.answer('vm', 1, VM_FOLDERS);
        check('a replaced request fails: no banner, and the newer data is drawn', t.banners().length === 0 && t.docker() === 'apps:web' && t.vms() === 'lab:vm1',
            { banners: t.banners(), docker: t.docker(), vms: t.vms() });
        check('a replaced request fails: no draw failed on the way (no console error), one draw per tile in the record', t.p.errors.length === 0
            && t.log('docker') === 'running:0,drawn:1' && t.log('vm') === 'running:0,drawn:1', { errors: t.p.errors, log: t.log() });
    }
    {
        // The Docker request asked last fails: Unraid's own Docker tile and one banner; the VM tile still gets its folder
        const t = await dashboard();
        t.reload();
        await t.land(0);
        await t.answer('docker', 0, new Error('500'));
        await t.answer('vm', 0, VM_FOLDERS);
        check('the last Docker request fails: one banner, which names the folder data', t.banners().length === 1 && /Docker folder data/.test(t.banners()[0]), t.banners());
        check('the last Docker request fails: the Docker tile keeps Unraid\'s own list, the failure is logged, and the VM tile has its folder',
            t.docker() === '' && t.p.errors.some((e) => /Docker folder rendering failed/.test(e)) && t.vms() === 'lab:vm1', { docker: t.docker(), vms: t.vms(), errors: t.p.errors });
    }
    {
        // List 2 is drawn from list 1's data. List 2's VM data then arrives and its Docker data hangs: the list is loaded again
        const t = await dashboard();
        t.reload();
        await t.land(0);
        t.reload();
        await t.land(1);
        await t.answer('docker', 0, DOCKER_FOLDERS);
        await t.answer('vm', 0, {});
        const bare = t.vms();
        await t.answer('vm', 1, VM_FOLDERS);
        check('both tiles, a list drawn from older data whose newer Docker request hangs: the newer VM data loads the list again',
            bare === '' && t.sent.length === 3 && /refresh/.test(t.log()), { bare, sent: t.sent.length, log: t.log() });
        // The same with the newer Docker request failing: the list is loaded again too
        const f = await dashboard();
        f.reload();
        await f.land(0);
        f.reload();
        await f.land(1);
        await f.answer('docker', 0, DOCKER_FOLDERS);
        await f.answer('vm', 0, {});
        await f.answer('docker', 1, new Error('500'));
        await f.answer('vm', 1, VM_FOLDERS);
        check('both tiles, the newer Docker request fails and the newer VM data arrives: the list is loaded again', f.sent.length === 3, { sent: f.sent.length, log: f.log() });
        // Both newer requests fail: nothing newer to show, so no extra load
        const n = await dashboard();
        n.reload();
        await n.land(0);
        n.reload();
        await n.land(1);
        await n.answer('docker', 0, DOCKER_FOLDERS);
        await n.answer('vm', 0, VM_FOLDERS);
        await n.answer('docker', 1, new Error('500'));
        await n.answer('vm', 1, new Error('500'));
        check('both tiles, both newer requests fail: no extra load', n.sent.length === 2 && !/refresh/.test(n.log()), { sent: n.sent.length, log: n.log() });
    }
    {
        // Debug mode: a debug read that fails for one tile must not cost the other tile its folders
        const t = await dashboard({ debug: true, failingDebugOrder: 'vm' });
        t.reload();
        await t.land(0);
        await t.answer('docker', 0, DOCKER_FOLDERS);
        await t.answer('vm', 0, VM_FOLDERS);
        const vmOrderReads = t.urls.filter((url) => url.includes('read_unraid_order.php?type=vm')).length;
        check('debug mode, the VM tile\'s debug read fails: its own data was read, then the debug read was made', vmOrderReads === 2, t.urls);
        check('debug mode, the VM tile\'s debug read fails: only the VM tile fails, as before this branch', t.vms() === ''
            && t.p.errors.some((e) => /VM folder rendering failed/.test(e)) && !t.p.errors.some((e) => /Docker folder rendering failed/.test(e)), t.p.errors);
        check('debug mode, the VM tile\'s debug read fails: the Docker tile still has its folder', t.docker() === 'apps:web', { docker: t.docker(), errors: t.p.errors });
        check('debug mode, the VM tile\'s debug read fails: the Docker debug payload is stored', !!(t.p.w.fv3DebugPayloads || {})['DASHBOARD-DOCKER'], Object.keys(t.p.w.fv3DebugPayloads || {}));
        const d = await dashboard({ debug: true, vms: false, failingDebugOrder: 'vm' });
        d.reload();
        await d.land(0);
        await d.answer('docker', 0, DOCKER_FOLDERS);
        check('debug mode, Docker tile only: no VM debug read is made and the tile has its folder', d.docker() === 'apps:web' && d.p.errors.length === 0
            && !d.urls.some((url) => url.includes('type=vm')) && d.urls.some((url) => url.includes('read_unraid_order.php?type=docker')), { docker: d.docker(), errors: d.p.errors, urls: d.urls });
        const ok = await dashboard({ debug: true });
        ok.reload();
        await ok.land(0);
        await ok.answer('docker', 0, DOCKER_FOLDERS);
        await ok.answer('vm', 0, VM_FOLDERS);
        const payloads = Object.keys(ok.p.w.fv3DebugPayloads || {}).sort().join();
        check('debug mode, both tiles: both folders drawn and both debug payloads stored', ok.docker() === 'apps:web' && ok.vms() === 'lab:vm1' && payloads === 'DASHBOARD-DOCKER,DASHBOARD-VM',
            { docker: ok.docker(), vms: ok.vms(), payloads, errors: ok.p.errors });
    }
    {
        // Only one tile, and neither: each reload is drawn, with no errors
        const d = await dashboard({ vms: false });
        d.reload();
        await d.land(0);
        await d.answer('docker', 0, DOCKER_FOLDERS);
        d.reload();
        await d.land(1);
        await d.answer('docker', 1, DOCKER_FOLDERS);
        check('Docker tile only: two reloads drawn, each with its folder', d.log('docker') === 'drawn:1,drawn:1' && d.docker() === 'apps:web' && d.p.errors.length === 0, { log: d.log(), errors: d.p.errors });
        const v = await dashboard({ docker: false });
        v.reload();
        await v.land(0);
        await v.answer('vm', 0, VM_FOLDERS);
        v.reload();
        await v.land(1);
        await v.answer('vm', 1, VM_FOLDERS);
        check('VM tile only: two reloads drawn, each with its folder', v.log('vm') === 'drawn:1,drawn:1' && v.vms() === 'lab:vm1' && v.p.errors.length === 0, { log: v.log(), errors: v.p.errors });
        const n = await dashboard({ docker: false, vms: false });
        n.reload();
        await n.land(0);
        n.reload();
        await n.land(1);
        check('no tiles: two reloads drawn, no errors', n.log('docker') === 'drawn:0,drawn:0' && n.log('vm') === 'drawn:0,drawn:0' && n.p.errors.length === 0, { log: n.log(), errors: n.p.errors });
    }
    {
        // Full-width layout: an opened folder's panel is measured against the whole drawn tile, so it is placed after the draw
        const open = (set) => Object.fromEntries(Object.entries(set).map(([id, f]) => [id, { ...f, settings: { expand_dashboard: true } }]));
        const t = await dashboard({ layout: 'fullwidth' });
        t.reload();
        await t.land(0);
        await t.answer('docker', 0, open(DOCKER_FOLDERS));
        await t.answer('vm', 0, VM_FOLDERS);
        t.reload();
        await t.land(1);
        await t.answer('docker', 1, open(DOCKER_FOLDERS));
        check('Dashboard full-width, a reload: the opened folder gets its panel after the draw, once, and the tile has its layout class', t.opened('docker') === '0,0' && t.built('docker') === '0,0'
            && t.panels('docker') === 1 && t.laidOut('docker'), { opened: t.opened('docker'), panels: t.panels('docker'), laidOut: t.laidOut('docker') });

        // The VM tile's data lands after the Docker tile is drawn and laid out: the VM tile waits for its own draw too
        const v = await dashboard({ layout: 'fullwidth' });
        v.reload();
        await v.land(0);
        await v.answer('docker', 0, DOCKER_FOLDERS);
        await v.answer('vm', 0, open(VM_FOLDERS));
        check('Dashboard full-width, the VM tile drawn after the Docker tile: its opened folder gets its panel after its own draw', v.opened('vm') === '0'
            && v.panels('vm') === 1, { opened: v.opened('vm'), panels: v.panels('vm') });

        // The mirror: the Docker tile's data lands after the VM tile is drawn and laid out
        const m = await dashboard({ layout: 'fullwidth' });
        m.reload();
        await m.land(0);
        await m.answer('vm', 0, VM_FOLDERS);
        await m.answer('docker', 0, open(DOCKER_FOLDERS));
        check('Dashboard full-width, the Docker tile drawn after the VM tile: its opened folder gets its panel after its own draw', m.opened('docker') === '0'
            && m.panels('docker') === 1, { opened: m.opened('docker'), panels: m.panels('docker') });

        // After the draw a folder the user opens gets its panel at once
        const u = await dashboard({ layout: 'fullwidth' });
        u.reload();
        await u.land(0);
        await u.answer('docker', 0, DOCKER_FOLDERS);
        u.p.g("expandFolderDocker('apps')");
        check('Dashboard full-width, a folder the user opens after the draw: its panel is placed at once', u.opened('docker') === '1', { opened: u.opened('docker') });

        // "Hide stopped" ticked and an opened folder in each tile whose container or VM is stopped: no panel shows for either
        const h = await dashboard({ layout: 'fullwidth', hideStopped: true });
        h.reload();
        await h.land(0);
        await h.answer('docker', 0, open(DOCKER_FOLDERS));
        await h.answer('vm', 0, open(VM_FOLDERS));
        const first = `${h.shownPanels('docker')}${h.shownPanels('vm')}`;
        h.reload();
        await h.land(1);
        await h.answer('docker', 1, open(DOCKER_FOLDERS));
        await h.answer('vm', 1, open(VM_FOLDERS));
        const hidden = { docker: h.hidden('docker'), vm: h.hidden('vm') };
        check('Dashboard full-width, "hide stopped" and opened folders of stopped entries: no panel shows in either tile, also after a reload', hidden.docker && hidden.vm
            && first === '00' && h.shownPanels('docker') === 0 && h.shownPanels('vm') === 0, { hidden, first, docker: h.shownPanels('docker'), vm: h.shownPanels('vm') });
        // Unticked: the folder shows at once, its panel holding its container (or VM), visible
        h.p.$('input#apps').prop('checked', false).trigger('change');
        h.p.$('input#vms').prop('checked', false).trigger('change');
        check('Dashboard full-width, "hide stopped" unticked again: each folder shows at once with a panel holding its entry', !h.hidden('docker') && !h.hidden('vm')
            && h.inPanels('docker') === 'web' && h.inPanels('vm') === 'vm1', { docker: h.inPanels('docker'), vm: h.inPanels('vm') });

        // A newer list lands before the older draw's panel pass runs: that pass leaves the newer tile to its own draw
        const n = await dashboard({ layout: 'fullwidth' });
        n.reload();
        await n.land(0);
        await n.answer('docker', 0, open(DOCKER_FOLDERS), 0);
        n.reload();
        await n.land(1);
        await n.answer('docker', 1, open(DOCKER_FOLDERS));
        check('Dashboard full-width, a newer list before the older panel pass: the newer draw still places its panel after itself, once', n.opened('docker') === '0,0'
            && n.panels('docker') === 1, { opened: n.opened('docker'), panels: n.panels('docker') });

        // One tile is drawn while the other's opened folder waits for that tile's panel pass: the waiting tile gets its panel from its own pass
        const sets = { docker: DOCKER_FOLDERS, vm: VM_FOLDERS };
        const names = { docker: ['Docker', 'web'], vm: ['VM', 'vm1'] };
        for (const [held, other] of [['vm', 'docker'], ['docker', 'vm']]) {
            const r = await dashboard({ layout: 'fullwidth' });
            r.reload();
            await r.land(0);
            await r.answer(held, 0, open(sets[held]), 0);
            await r.answer(other, 0, sets[other], 0);
            const early = r.panels(held);
            await r.p.tick(300);
            check(`Dashboard full-width, the ${names[other][0]} tile drawn while the ${names[held][0]} tile waits for its panel pass: no ${names[held][0]} panel before that pass, one after`,
                early === 0 && r.panels(held) === 1 && r.shownPanels(held) === 1 && r.inPanels(held) === names[held][1],
                { early, panels: r.panels(held), shown: r.shownPanels(held), inPanels: r.inPanels(held) });
        }

        // The page is resized while a tile waits for its panel pass: the resize's reflow leaves that tile to its pass
        const z = await dashboard({ layout: 'fullwidth' });
        z.reload();
        await z.land(0);
        await z.answer('docker', 0, open(DOCKER_FOLDERS), 0);
        z.p.resized();
        await z.p.tick(16);
        const beforePass = z.panels('docker');
        await z.p.tick(300);
        check('Dashboard full-width, the page resized while the Docker tile waits for its panel pass: no panel before that pass, one after',
            beforePass === 0 && z.panels('docker') === 1 && z.shownPanels('docker') === 1 && z.inPanels('docker') === 'web',
            { beforePass, panels: z.panels('docker'), shown: z.shownPanels('docker'), inPanels: z.inPanels('docker') });
    }
    done();
})();
