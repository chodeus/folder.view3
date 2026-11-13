// node .github/scripts/dashboard_reload_test.js — the Dashboard's Docker and VM tiles when list reloads overlap, a folder request hangs or
// fails: every list Unraid renders ends with its folder tiles, or with Unraid's own tiles and one banner (npm ci in this folder first)
'use strict';
const { makePage, check, done } = require('./preview_pages_harness.js');

const DASH_LIST = '/webGui/include/DashboardApps.php';
const DOCKER_FOLDERS = { apps: { name: 'Apps', icon: '', regex: '', containers: ['web'], settings: {}, hidden_preview: [], actions: [] } };
const VM_FOLDERS = { lab: { name: 'Lab', icon: '', regex: '', containers: ['vm1'], settings: {}, hidden_preview: [], actions: [] } };
// Unraid's tile rows (DashboardApps.php), cut to what dashboard.js reads
const dockerRow = (n) => `<tr class="updated" data-list="${n}"><td><span class="outer solid apps started"><span id="aaaaaaaaaaaa" class="hand"><img class="img" src=""></span>` +
    '<span class="inner"><span>web</span><br><i class="fa fa-play started green-text"></i><span class="state">started</span></span></span></td></tr>';
const vmRow = (n) => `<tr class="updated" data-list="${n}"><td><span class="outer solid vms stopped"><span id="vm-u1" class="hand"><img class="img" src=""></span>` +
    '<span class="inner">vm1<br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span></td></tr>';

// The Dashboard with the tiles asked for. Unraid's list request goes through jQuery's own ajax and land(i) answers request i; the
// read.php answers of each type are held until answer(type, i, folders | Error)
const dashboard = async ({ docker = true, vms = true } = {}) => {
    const info = {};
    const p = await makePage({ page: 'dashboard', api: false, answers: {
        'read_order.php': () => '[]', 'read_unraid_order.php': (url) => JSON.stringify(['web']), 'docker_load.php': () => '',
        'read_info.php': () => JSON.stringify(info),
    } });
    info.web = p.ct('aaaaaaaaaaaa', 'web');
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
        p.$('#docker_view').append(dockerRow(rendered));
        p.$('#vm_view').append(vmRow(rendered));
    } });
    const reads = { docker: [], vm: [] };
    const get = p.$.get;
    p.$.get = (url) => {
        const read = url.match(/\/read\.php\?type=(docker|vm)/);
        if (read) {
            const d = p.$.Deferred();
            reads[read[1]].push(d);
            return d;
        }
        if (url.includes('read_info.php?type=vm')) return p.$.Deferred().resolve({ vm1: { uuid: 'u1', state: 'shutoff', autostart: false } });
        if (url.includes('read_unraid_order.php?type=vm')) return p.$.Deferred().resolve(['vm1']);
        return get(url);
    };
    // The folder tiles in a tile with the names drawn into each, as `id:name`
    const tiles = (tbody) => p.$(`#${tbody} .folder-showcase-outer`).toArray().map((el) => `${el.className.match(/folder-showcase-outer-(\S+)/)[1]}:` +
        p.$(el).find('div.folder-storage span.inner').toArray().map((inner) => p.$(inner).contents().first().text().trim()).join()).join(' ');
    return {
        p, sent,
        docker: () => tiles('docker_view'),
        vms: () => tiles('vm_view'),
        list: () => p.$('#docker_view tr.updated, #vm_view tr.updated').first().attr('data-list'),
        banners: () => p.errors.filter((e) => /Banner:/.test(e)),
        log: () => (p.w.fv3DrawLog || []).map((d) => `${d.outcome}:${d.folders}`).join(),
        reload: () => p.g('loadlist()'),
        land: async (i) => { if (sent[i]) { Object.assign(sent[i], { status: 200, statusText: 'OK', responseText: 'rows', readyState: 4 }); sent[i].onload(); } await p.tick(300); },
        answer: async (type, i, set) => {
            if (!reads[type][i]) return;
            if (set instanceof Error) reads[type][i].reject({ status: 500, statusText: 'error' }); else reads[type][i].resolve(JSON.parse(JSON.stringify(set)));
            await p.tick(300);
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
        check('both tiles, one reload: the draw record counts the two folder tiles', t.log() === 'drawn:2', t.log());
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
        check('both tiles, a list lands while the VM data is still on its way: nothing is drawn before all the data is in', beforeVmData === '', beforeVmData);
        check('both tiles, a list lands while the VM data is still on its way: that list has both folder tiles', t.list() === '2' && t.docker() === 'apps:web' && t.vms() === 'lab:vm1',
            { list: t.list(), docker: t.docker(), vms: t.vms(), log: t.log() });
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
        check('a replaced request fails: no draw failed on the way (no console error), one draw in the record', t.p.errors.length === 0 && t.log() === 'running:0,drawn:2', { errors: t.p.errors, log: t.log() });
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
        // Only one tile, and neither: each reload is drawn, with no errors
        const d = await dashboard({ vms: false });
        d.reload();
        await d.land(0);
        await d.answer('docker', 0, DOCKER_FOLDERS);
        d.reload();
        await d.land(1);
        await d.answer('docker', 1, DOCKER_FOLDERS);
        check('Docker tile only: two reloads drawn, each with its folder', d.log() === 'drawn:1,drawn:1' && d.docker() === 'apps:web' && d.p.errors.length === 0, { log: d.log(), errors: d.p.errors });
        const v = await dashboard({ docker: false });
        v.reload();
        await v.land(0);
        await v.answer('vm', 0, VM_FOLDERS);
        v.reload();
        await v.land(1);
        await v.answer('vm', 1, VM_FOLDERS);
        check('VM tile only: two reloads drawn, each with its folder', v.log() === 'drawn:1,drawn:1' && v.vms() === 'lab:vm1' && v.p.errors.length === 0, { log: v.log(), errors: v.p.errors });
        const n = await dashboard({ docker: false, vms: false });
        n.reload();
        await n.land(0);
        n.reload();
        await n.land(1);
        check('no tiles: two reloads drawn, no errors', n.log() === 'drawn:0,drawn:0' && n.p.errors.length === 0, { log: n.log(), errors: n.p.errors });
    }
    done();
})();
