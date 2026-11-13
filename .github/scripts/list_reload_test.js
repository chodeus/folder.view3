// node .github/scripts/list_reload_test.js — list reloads that overlap on the Docker, VMs and Dashboard pages: every list Unraid renders
// gets its folders, once, from the newest folder data (npm ci in this folder first)
'use strict';
const { makePage, drawDocker, check, done } = require('./preview_pages_harness.js');

const folder = (name, containers) => ({ name, containers, regex: '' });
// The page's draw record; a page from before it has none, and the checks on it then fail
const record = (t) => t.p.w.fv3DrawLog || [];
const FOLDERS = { f: folder('F', ['m']), g: folder('G', ['x']) };

// The Docker page with Unraid's side of a reload held by the test: land(i) renders list i and calls listview(), as Unraid's
// loadlist callback does. read.php answers are held too when `hold` is set: answer(i, folders) gives request i its answer
const docker = async ({ hold = false, setup = { folders: FOLDERS, containers: ['a', 'm', 'x'], prefs: ['folder-f', 'm', 'folder-g', 'x', 'a'] } } = {}) => {
    const page = await drawDocker(setup);
    const { p } = page;
    const lists = [];
    p.w.loadlist_original = () => { lists.push(() => { page.render(); p.g('listview()'); }); };
    const reads = [];
    const get = p.$.get;
    p.$.get = (url) => {
        if (!hold || !url.includes('read.php')) return get(url);
        const d = p.$.Deferred();
        reads.push(d);
        return d;
    };
    const draws = [];
    p.w.folderEvents.addEventListener('docker-post-folders-creation', () => draws.push(1));
    const folders = () => p.$('#docker_list > tr.folder').toArray().map((tr) => tr.className.match(/folder-id-(\S+)/)[1]).sort().join();
    const def = (set) => JSON.stringify(Object.fromEntries(Object.entries(set).map(([id, f]) => [id, { ...f, icon: '', settings: {}, hidden_preview: [], actions: [] }])));
    return {
        p, draws, folders,
        // How many lists Unraid was asked for, the page's own reloads included
        asked: () => lists.length,
        reload: () => p.g('loadlist()'),
        // A list the page never asked for cannot land: the checks after it then fail
        land: async (i) => { if (lists[i]) lists[i](); await p.tick(300); },
        // A request the page never sent has no answer to give: the checks after it then fail
        answer: async (i, set) => {
            if (!reads[i]) return;
            if (set instanceof Error) reads[i].reject({ status: 500 }); else reads[i].resolve(JSON.parse(def(set)));
            await p.tick(300);
        },
    };
};

// The VMs page with Unraid's own list request sent through jQuery's ajax (the page draws from that request): land(i) lands
// list i. The server holds one VM and one folder with that VM in it; `hold` keeps the read.php answers for the test
const VM_LIST = '/plugins/dynamix.vm.manager/include/VMMachines.php';
const VM_FOLDERS = { lab: { name: 'Lab', icon: '', regex: '', containers: ['vm-x'], settings: {}, hidden_preview: [], actions: [] } };
// Unraid's rows for one VM (VMMachines.php), cut to the cells vm.js reads
const vmRows = (n) => '<tr parent-id="0" class="sortable"><td class="vm-name"><span class="outer"><span id="vm-u1" class="hand"><img class="img" src=""></span>' +
    `<span class="inner"><a>vm-x</a><br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span></td><td class="list">${n}</td>` +
    '<td><input class="autostart" type="checkbox" uuid="u1"></td></tr><tr child-id="0" id="name-0" style="display:none"><td colspan="3"></td></tr>';
const vms = async ({ hold = false, empty = false } = {}) => {
    const p = await makePage({ page: 'vm', api: false, answers: {
        'read.php': () => JSON.stringify(VM_FOLDERS), 'read_order.php': () => '[]', 'read_unraid_order.php': () => JSON.stringify(['vm-x']),
        'read_info.php': () => JSON.stringify({ 'vm-x': { uuid: 'u1', state: 'shutoff', autostart: false } }),
    } });
    const sent = [];
    p.w.XMLHttpRequest = class {
        open(method, url) { this.url = url; }
        setRequestHeader() {}
        getAllResponseHeaders() { return 'Content-Type: text/html\r\n'; }
        send() { sent.push(this); }
        abort() {}
    };
    let rendered = 0;
    p.w.loadlist_original = () => p.realAjax({ url: VM_LIST, data: { show: '' }, success: () => { p.$('#kvm_list').html(empty ? '' : vmRows(++rendered)); } });
    const reads = [];
    const get = p.$.get;
    p.$.get = (url) => {
        if (!hold || !url.includes('read.php')) return get(url);
        const d = p.$.Deferred();
        reads.push(d);
        return d;
    };
    // Each draw, by the list it was made on
    const draws = [];
    p.w.folderEvents.addEventListener('vm-post-folders-creation', () => draws.push(`list ${p.$('#kvm_list td.list').first().text()}`));
    // The folders on the page with the VMs drawn into each, as `id:vm,vm`
    const folders = () => p.$('#kvm_list > tr.folder').toArray().map((tr) => `${tr.className.match(/folder-id-(\S+)/)[1]}:` +
        p.$(tr).find('div.folder-storage > tr td.vm-name span.inner a').toArray().map((a) => a.textContent).join()).join(' ');
    return {
        p, draws, folders, sent,
        reload: () => p.g('loadlist()'),
        land: (i) => { if (sent[i]) { Object.assign(sent[i], { status: 200, statusText: 'OK', responseText: 'rows', readyState: 4 }); sent[i].onload(); } },
        answer: async (i, set) => {
            if (!reads[i]) return;
            if (set instanceof Error) reads[i].reject({ status: 500 }); else reads[i].resolve(JSON.parse(JSON.stringify(set)));
            await p.tick(300);
        },
    };
};

// The Dashboard with Unraid's own list request sent through jQuery's ajax (the page draws from that request): land(i) lands
// list i. The server holds one container in one folder; `hold` keeps the read.php answers for the test
const DASH_LIST = '/webGui/include/DashboardApps.php';
const DASH_FOLDERS = { apps: { name: 'Apps', icon: '', regex: '', containers: ['web'], settings: {}, hidden_preview: [], actions: [] } };
// Unraid's Docker tile row (DashboardApps.php), cut to what dashboard.js reads
const dashRow = (n) => `<tr class="updated" data-list="${n}"><td><span class="outer solid apps started"><span id="aaaaaaaaaaaa" class="hand"><img class="img" src=""></span>` +
    '<span class="inner"><span>web</span><br><i class="fa fa-play started green-text"></i><span class="state">started</span></span></span></td></tr>';
const dashboard = async ({ hold = false, empty = false } = {}) => {
    const info = {};
    const p = await makePage({ page: 'dashboard', api: false, answers: {
        'read.php': () => JSON.stringify(DASH_FOLDERS), 'read_order.php': () => '[]', 'read_unraid_order.php': () => JSON.stringify(['web']),
        'read_info.php': () => JSON.stringify(info), 'docker_load.php': () => '',
    } });
    info.web = p.ct('aaaaaaaaaaaa', 'web');
    const sent = [];
    p.w.XMLHttpRequest = class {
        open(method, url) { this.url = url; }
        setRequestHeader() {}
        getAllResponseHeaders() { return 'Content-Type: text/html\r\n'; }
        send() { sent.push(this); }
        abort() {}
    };
    let rendered = 0;
    p.w.loadlist_original = () => p.realAjax({ url: DASH_LIST, type: 'POST', data: { docker: 'yes' }, success: () => {
        p.$('#docker_view tr.updated').remove();
        if (!empty) p.$('#docker_view').append(dashRow(++rendered));
    } });
    const reads = [];
    const get = p.$.get;
    p.$.get = (url) => {
        if (!hold || !url.includes('read.php')) return get(url);
        const d = p.$.Deferred();
        reads.push(d);
        return d;
    };
    // Each draw, by the list it was made on
    const draws = [];
    p.w.folderEvents.addEventListener('docker-post-folders-creation', () => draws.push(`list ${p.$('#docker_view tr.updated').attr('data-list') || '-'}`));
    // The folder tiles on the page with the containers drawn into each, as `id:name,name`
    const folders = () => p.$('#docker_view .folder-showcase-outer').toArray().map((el) => `${el.className.match(/folder-showcase-outer-(\S+)/)[1]}:` +
        p.$(el).find('div.folder-storage span.inner').toArray().map((inner) => p.$(inner).contents().first().text().trim()).join()).join(' ');
    return {
        p, draws, folders, sent,
        reload: () => p.g('loadlist()'),
        land: (i) => { if (sent[i]) { Object.assign(sent[i], { status: 200, statusText: 'OK', responseText: 'rows', readyState: 4 }); sent[i].onload(); } },
        answer: async (i, set) => {
            if (!reads[i]) return;
            if (set instanceof Error) reads[i].reject({ status: 500 }); else reads[i].resolve(JSON.parse(JSON.stringify(set)));
            await p.tick(300);
        },
    };
};

(async () => {
    {
        const t = await dashboard();
        t.reload();
        t.land(0);
        await t.p.tick(300);
        check('Dashboard, one reload: the folder tile is drawn with its container', t.folders() === 'apps:web' && t.draws.join() === 'list 1', { folders: t.folders(), draws: t.draws });
        check('Dashboard, one reload: no page errors', t.p.errors.length === 0, t.p.errors);
    }
    {
        // The case seen on a live server: the second list lands after the first draw, and its draw gets the same answers
        const t = await dashboard();
        t.reload();
        t.reload();
        t.land(0);
        await t.p.tick(300);
        const first = t.folders();
        t.land(1);
        await t.p.tick(300);
        check('Dashboard, two reloads at once: the first list is drawn', first === 'apps:web', first);
        check('Dashboard, two reloads at once: the second list has the folder tile too', t.folders() === 'apps:web' && t.draws.join() === 'list 1,list 2', { folders: t.folders(), draws: t.draws });
    }
    {
        const t = await dashboard();
        t.reload();
        t.reload();
        t.land(0);
        t.land(1);
        await t.p.tick(300);
        check('Dashboard, both lists land together: drawn once, one tile', t.folders() === 'apps:web' && t.draws.join() === 'list 2', { folders: t.folders(), draws: t.draws });
    }
    {
        const t = await dashboard({ hold: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        t.land(1);
        await t.p.tick(300);
        await t.answer(0, {});
        const bare = t.folders();
        await t.answer(1, DASH_FOLDERS);
        const asked = t.sent.length;
        t.land(2);
        await t.p.tick(300);
        await t.answer(2, DASH_FOLDERS);
        check('Dashboard, a list drawn from older folder data: loaded again, then it has its tile', bare === '' && asked === 3 && t.folders() === 'apps:web'
            && record(t).map((d) => d.outcome).join() === 'running,drawn,refresh,drawn', { bare, asked, folders: t.folders(), log: record(t).map((d) => d.outcome) });
    }
    {
        const t = await dashboard({ empty: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        t.land(1);
        await t.p.tick(300);
        check('Dashboard, an empty Docker tile: each reload is drawn', t.draws.length === 2 && record(t).map((d) => d.outcome).join() === 'drawn,drawn', { draws: t.draws.length, log: record(t).map((d) => d.outcome) });
    }
    {
        const t = await docker();
        t.reload();
        await t.land(0);
        check('Docker, one reload: both folders drawn, in one draw', t.folders() === 'f,g' && t.draws.length === 1, { folders: t.folders(), draws: t.draws.length });
    }
    {
        const t = await docker();
        t.reload();
        t.reload();
        await t.land(0);
        const first = t.folders();
        await t.land(1);
        check('Docker, two reloads at once: the first list is drawn', first === 'f,g', first);
        check('Docker, two reloads at once: the second list is drawn too', t.folders() === 'f,g' && t.draws.length === 2, { folders: t.folders(), draws: t.draws.length });
        check('Docker, two reloads at once: no page errors', t.p.errors.length === 0, t.p.errors);
    }
    {
        // Both lists land while the folder data is still on its way: one draw, on the list that is on the page
        const t = await docker({ hold: true });
        t.reload();
        t.reload();
        await t.land(0);
        await t.land(1);
        await t.answer(0, FOLDERS);
        await t.answer(1, FOLDERS);
        check('Docker, lists land before the folder data: drawn once, each folder once', t.folders() === 'f,g' && t.draws.length === 1, { folders: t.folders(), draws: t.draws.length });
        const log = record(t).map((d) => `${d.outcome} ${d.rows}/${d.folders}`).join();
        check('Docker, lists land before the folder data: the draw record names the list that waited and the draw', log === 'running 3/0,drawn 3/2', log);
        check('Docker, lists land before the folder data: the record is in the debug download', (t.p.w.fv3CollectEnv().listDraws || []).length === 2, t.p.w.fv3CollectEnv().listDraws);
    }
    {
        // Unraid's Advanced View switch calls listview() with no new list: a reload in flight must not make that a draw
        const t = await docker();
        t.reload();
        await t.land(0);
        t.reload();
        t.p.g('listview()');
        await t.p.tick(300);
        check('Docker, view switch during a reload: the drawn list is not drawn again', t.folders() === 'f,g' && t.draws.length === 1, { folders: t.folders(), draws: t.draws.length });
        check('Docker, view switch during a reload: the record says the list was kept', record(t).map((d) => d.outcome).join() === 'drawn,kept', t.p.w.fv3DrawLog);
        await t.land(1);
        check('Docker, view switch during a reload: the reloaded list is drawn', t.folders() === 'f,g' && t.draws.length === 2, { folders: t.folders(), draws: t.draws.length });
    }
    {
        // A folder is deleted between two reloads: the draw that was waiting takes the newest answer that is in
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        await t.answer(1, { f: FOLDERS.f });
        const early = t.draws.length;
        await t.answer(0, FOLDERS);
        check('Docker, a newer answer is in first: the draw takes it at once, without waiting for the older batch', early === 1, { early, draws: t.draws.length });
        check('Docker, a newer answer is in first: the draw uses it, so the deleted folder is not drawn', t.folders() === 'f', t.folders());
        await t.land(1);
        check('Docker, a newer answer is in first: the second list shows the same', t.folders() === 'f' && t.draws.length === 2, { folders: t.folders(), draws: t.draws.length });
    }
    {
        // Reloads keep coming while the answers are slow: a draw never waits for a batch asked after it started
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        t.reload();
        await t.answer(0, FOLDERS);
        check('Docker, reloads keep coming: the draw does not wait for their answers', t.folders() === 'f,g' && t.draws.length === 1, { folders: t.folders(), draws: t.draws.length });
        await t.answer(1, { f: FOLDERS.f });
        await t.answer(2, { f: FOLDERS.f });
        await t.land(2);
        check('Docker, reloads keep coming: the last list is drawn from the last answer', t.folders() === 'f' && t.draws.length === 2, { folders: t.folders(), draws: t.draws.length });
        check('Docker, reloads keep coming: no list landed during a draw, so the page asks for no extra reload', t.asked() === 3 && !record(t).some((d) => d.outcome === 'refresh'), { asked: t.asked(), log: record(t).map((d) => d.outcome) });
    }
    {
        const banners = (t) => t.p.errors.filter((e) => /Banner: Could not load folder data/.test(e)).length;
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        await t.answer(0, new Error('500'));
        check('Docker, folder data fails: Unraid\'s own list is shown, with the banner', t.folders() === '' && banners(t) === 1
            && t.p.w.document.documentElement.classList.contains('fv3-docker-ready'), { folders: t.folders(), errors: t.p.errors });
        check('Docker, folder data fails: the record says the draw failed', record(t).map((d) => `${d.outcome} ${d.folders}`).join() === 'failed 0', t.p.w.fv3DrawLog);
        t.reload();
        await t.land(1);
        await t.answer(1, FOLDERS);
        check('Docker, folder data fails: the next reload draws the folders', t.folders() === 'f,g', t.folders());

        // The same failure after a newer reload asked again: no banner, the newer batch decides what is shown
        const r = await docker({ hold: true });
        r.reload();
        await r.land(0);
        r.reload();
        await r.answer(0, new Error('500'));
        await r.land(1);
        await r.answer(1, FOLDERS);
        check('Docker, a replaced folder request fails: no banner, and the next list is drawn', banners(r) === 0 && r.folders() === 'f,g', { folders: r.folders(), errors: r.p.errors });
    }
    {
        const t = await vms({ hold: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        await t.answer(1, {});
        const early = t.draws.length;
        await t.answer(0, VM_FOLDERS);
        check('VMs, a newer answer is in first: the draw takes it at once', early === 1 && t.draws.join() === 'list 1' && t.folders() === '', { early, draws: t.draws, folders: t.folders() });
    }
    {
        // A list lands while a draw waits for folder data that then fails: that list is drawn from its own answer, not left bare
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        await t.land(1);
        await t.answer(0, new Error('500'));
        await t.answer(1, FOLDERS);
        const log = record(t).map((d) => d.outcome).join();
        check('Docker, the first request fails after a newer reload: the list is drawn from the newer data', t.folders() === 'f,g' && log === 'running,drawn', { folders: t.folders(), log });
        t.p.g('listview()');
        await t.p.tick(300);
        check('Docker, the first request fails after a newer reload: a view switch then keeps the list', record(t).map((d) => d.outcome).join() === 'running,drawn,kept', record(t));

        // The same when its own answer fails too: Unraid's list with the banner, and the record does not call it kept
        const b = await docker({ hold: true });
        b.reload();
        await b.land(0);
        b.reload();
        await b.land(1);
        await b.answer(0, new Error('500'));
        await b.answer(1, new Error('500'));
        b.p.g('listview()');
        await b.p.tick(300);
        const outcomes = record(b).map((d) => d.outcome);
        check('Docker, both answers fail: one banner, and no line of the record says kept', b.folders() === '' && !outcomes.includes('kept')
            && b.p.errors.filter((e) => /Banner: Could not load folder data/.test(e)).length === 1, { outcomes, errors: b.p.errors });
    }
    {
        const t = await vms({ hold: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        t.land(1);
        await t.p.tick(300);
        await t.answer(0, new Error('500'));
        await t.answer(1, VM_FOLDERS);
        check('VMs, the first request fails after a newer reload: the list gets its folder, with the VM in it', t.draws.join() === 'list 2' && t.folders() === 'lab:vm-x'
            && record(t).map((d) => d.outcome).join() === 'running,drawn', { draws: t.draws, folders: t.folders(), log: record(t) });
    }
    {
        // The first folder request never answers; the next reload's does: its list is drawn, not stuck behind the hung one
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        await t.land(1);
        await t.answer(1, FOLDERS);
        check('Docker, a folder request that never answers: the next reload\'s list is drawn', t.folders() === 'f,g' && record(t).map((d) => d.outcome).join() === 'running,drawn',
            { folders: t.folders(), log: record(t).map((d) => d.outcome) });
        const v = await vms({ hold: true });
        v.reload();
        v.land(0);
        await v.p.tick(300);
        v.reload();
        v.land(1);
        await v.p.tick(300);
        await v.answer(1, VM_FOLDERS);
        check('VMs, a folder request that never answers: the next reload\'s list is drawn', v.folders() === 'lab:vm-x' && v.draws.join() === 'list 2', { folders: v.folders(), draws: v.draws });
    }
    {
        // No containers and no folders: the list has no rows at all, and a view switch must not draw it again
        const t = await docker({ setup: { folders: {}, containers: [], prefs: [] } });
        t.reload();
        await t.land(0);
        t.p.g('listview()');
        await t.p.tick(300);
        check('Docker, an empty list: drawn once, kept on a view switch', t.draws.length === 1 && record(t).map((d) => d.outcome).join() === 'drawn,kept', { draws: t.draws.length, log: record(t) });
        t.reload();
        await t.land(1);
        check('Docker, an empty list: a reload draws again', t.draws.length === 2, t.draws.length);
    }
    {
        const t = await docker();
        const add = t.p.w.fv3RecordDraw || (() => {});
        for (let i = 0; i < 35; i++) add('#docker_list > tr', 'drawn', i, 0);
        check('the draw record keeps the newest 30 lines', record(t).length === 30 && record(t)[29].rows === 34 && record(t)[0].rows === 5, record(t).length);
    }
    {
        // The second reload's list lands while the first draw waits, and that draw finishes on it with the first reload's data
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        await t.land(1);
        await t.answer(0, {});
        const bare = t.folders();
        await t.answer(1, FOLDERS);
        const asked = t.asked();
        await t.land(2);
        await t.answer(2, FOLDERS);
        const log = record(t).map((d) => d.outcome).join();
        check('Docker, a list drawn from older folder data: the page loads it again once its own data is in', bare === '' && asked === 3, { bare, asked });
        check('Docker, a list drawn from older folder data: it then has its folders', t.folders() === 'f,g' && log === 'running,drawn,refresh,drawn', { folders: t.folders(), log });

        // A newer list lands before that data is in: its own draw covers it, so no extra reload
        const n = await docker({ hold: true });
        n.reload();
        await n.land(0);
        n.reload();
        await n.land(1);
        await n.answer(0, {});
        n.reload();
        await n.land(2);
        await n.answer(2, FOLDERS);
        const before = n.asked();
        await n.answer(1, FOLDERS);
        check('Docker, a list drawn from older folder data: a newer list makes the extra reload needless', before === 3 && n.asked() === 3 && n.folders() === 'f,g'
            && !record(n).some((d) => d.outcome === 'refresh'), { before, asked: n.asked(), folders: n.folders(), log: record(n).map((d) => d.outcome) });

        // That data fails: nothing newer to show, so no extra reload
        const f = await docker({ hold: true });
        f.reload();
        await f.land(0);
        f.reload();
        await f.land(1);
        await f.answer(0, {});
        await f.answer(1, new Error('500'));
        check('Docker, a list drawn from older folder data: no reload when the newer data fails', f.asked() === 2 && !record(f).some((d) => d.outcome === 'refresh'), { asked: f.asked(), log: record(f).map((d) => d.outcome) });

        // A view switch during the draw is not a new list: no extra reload though a newer batch was asked
        const v = await docker({ hold: true });
        v.reload();
        await v.land(0);
        v.reload();
        v.p.g('listview()');
        await v.answer(0, {});
        await v.answer(1, FOLDERS);
        check('Docker, a view switch during a draw: the newer data does not cause an extra reload', v.asked() === 2 && !record(v).some((d) => d.outcome === 'refresh'), { asked: v.asked(), log: record(v).map((d) => d.outcome) });
    }
    {
        // No VMs: the list has no rows, and each reload is still drawn once
        const t = await vms({ empty: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        t.land(1);
        await t.p.tick(300);
        check('VMs, an empty list: each reload is drawn', t.draws.length === 2 && record(t).map((d) => d.outcome).join() === 'drawn,drawn', { draws: t.draws.length, log: record(t).map((d) => d.outcome) });
    }
    {
        // The VMs page: a list drawn from older folder data is loaded again once its own data is in
        const t = await vms({ hold: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        t.land(1);
        await t.p.tick(300);
        await t.answer(0, {});
        const bare = t.folders();
        await t.answer(1, VM_FOLDERS);
        const asked = t.sent.length;
        t.land(2);
        await t.p.tick(300);
        await t.answer(2, VM_FOLDERS);
        check('VMs, a list drawn from older folder data: loaded again, then it has its folder', bare === '' && asked === 3 && t.folders() === 'lab:vm-x'
            && record(t).map((d) => d.outcome).join() === 'running,drawn,refresh,drawn', { bare, asked, folders: t.folders(), log: record(t).map((d) => d.outcome) });
    }
    {
        const t = await vms();
        t.reload();
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.land(1);
        await t.p.tick(300);
        check('VMs, two reloads at once: each list is drawn', t.draws.join() === 'list 1,list 2', t.draws);
        check('VMs, two reloads at once: the list on the page has the folder, with the VM in it', t.folders() === 'lab:vm-x', t.folders());
        check('VMs, two reloads at once: no page errors', t.p.errors.length === 0, t.p.errors);
    }
    {
        const t = await vms();
        t.reload();
        t.reload();
        t.land(0);
        t.land(1);
        await t.p.tick(300);
        check('VMs, both lists land together: the list on the page is drawn once, with its folder', t.draws.join() === 'list 2' && t.folders() === 'lab:vm-x', { draws: t.draws, folders: t.folders() });
    }
    done();
})();
