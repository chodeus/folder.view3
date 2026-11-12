// node .github/scripts/list_reload_test.js — list reloads that overlap on the Docker and VMs pages: every list Unraid renders
// gets its folders, once, from the newest folder data (npm ci in this folder first)
'use strict';
const { makePage, drawDocker, check, done } = require('./preview_pages_harness.js');

const folder = (name, containers) => ({ name, containers, regex: '' });
const FOLDERS = { f: folder('F', ['m']), g: folder('G', ['x']) };

// The Docker page with Unraid's side of a reload held by the test: land(i) renders list i and calls listview(), as Unraid's
// loadlist callback does. read.php answers are held too when `hold` is set: answer(i, folders) gives request i its answer
const docker = async ({ hold = false } = {}) => {
    const page = await drawDocker({ folders: FOLDERS, containers: ['a', 'm', 'x'], prefs: ['folder-f', 'm', 'folder-g', 'x', 'a'] });
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
        reload: () => p.g('loadlist()'),
        land: async (i) => { lists[i](); await p.tick(300); },
        // A request the page never sent has no answer to give: the checks after it then fail
        answer: async (i, set) => {
            if (!reads[i]) return;
            if (set instanceof Error) reads[i].reject({ status: 500 }); else reads[i].resolve(JSON.parse(def(set)));
            await p.tick(300);
        },
    };
};

// The VMs page with Unraid's own list request sent through jQuery's ajax (the page draws from that request): answer(i) lands list i
const VM_LIST = '/plugins/dynamix.vm.manager/include/VMMachines.php';
const vms = async ({ hold = false } = {}) => {
    const p = await makePage({ page: 'vm', api: false, answers: {
        'read.php': () => '{}', 'read_order.php': () => '[]', 'read_info.php': () => '{}', 'read_unraid_order.php': () => '[]',
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
    p.w.loadlist_original = () => p.realAjax({ url: VM_LIST, data: { show: '' }, success: () => {
        rendered++;
        p.$('#kvm_list').html(`<tr parent-id="0" class="sortable"><td class="vm-name">vm ${rendered}</td></tr><tr child-id="0" id="name-0"><td></td></tr>`);
    } });
    const reads = [];
    const get = p.$.get;
    p.$.get = (url) => {
        if (!hold || !url.includes('read.php')) return get(url);
        const d = p.$.Deferred();
        reads.push(d);
        return d;
    };
    const draws = [];
    p.w.folderEvents.addEventListener('vm-post-folders-creation', () => draws.push(p.$('#kvm_list .vm-name').text()));
    // The folders a draw works from, as extensions get them
    const used = [];
    p.w.folderEvents.addEventListener('vm-pre-folders-creation', (e) => used.push(Object.keys(e.detail.folders).join()));
    return {
        p, draws, used, sent,
        reload: () => p.g('loadlist()'),
        land: (i) => { Object.assign(sent[i], { status: 200, statusText: 'OK', responseText: 'rows', readyState: 4 }); sent[i].onload(); },
        answer: async (i, set) => { if (reads[i]) reads[i].resolve(JSON.parse(JSON.stringify(set))); await p.tick(300); },
    };
};

(async () => {
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
        await t.land(1);
        check('Docker, view switch during a reload: the reloaded list is drawn', t.folders() === 'f,g' && t.draws.length === 2, { folders: t.folders(), draws: t.draws.length });
    }
    {
        // A folder is deleted between two reloads: the answer asked for before the delete must not draw it back
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        await t.answer(0, FOLDERS);
        const early = t.draws.length;
        await t.answer(1, { f: FOLDERS.f });
        check('Docker, newer folder data asked for: the draw waits for it', early === 0 && t.draws.length === 1, { early, draws: t.draws.length });
        check('Docker, newer folder data asked for: the deleted folder is not drawn', t.folders() === 'f', t.folders());
        await t.land(1);
        check('Docker, newer folder data asked for: the second list shows the same', t.folders() === 'f' && t.draws.length === 2, { folders: t.folders(), draws: t.draws.length });
    }
    {
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        await t.answer(0, new Error('500'));
        check('Docker, folder data fails: Unraid\'s own list is shown', t.folders() === '' && t.p.w.document.documentElement.classList.contains('fv3-docker-ready'), t.folders());
        t.reload();
        await t.land(1);
        await t.answer(1, FOLDERS);
        check('Docker, folder data fails: the next reload draws the folders', t.folders() === 'f,g', t.folders());
    }
    {
        // The first folder request fails after a second reload asked again: the draw takes the second answer, with no failure shown
        const t = await docker({ hold: true });
        t.reload();
        await t.land(0);
        t.reload();
        await t.answer(0, new Error('500'));
        const failed = t.p.w.document.documentElement.classList.contains('fv3-docker-ready');
        await t.answer(1, FOLDERS);
        check('Docker, a replaced folder request fails: the newer answer is drawn', !failed && t.folders() === 'f,g' && t.draws.length === 1, { failed, folders: t.folders(), draws: t.draws.length });
        check('Docker, a replaced folder request fails: only the request\'s own banner is shown', t.p.errors.length === 1 && /Could not load folder data/.test(t.p.errors[0]), t.p.errors);
    }
    {
        const vmFolder = { name: 'Lab', icon: '', regex: '', containers: ['vm-x'], settings: {}, hidden_preview: [], actions: [] };
        const t = await vms({ hold: true });
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.reload();
        await t.answer(0, { old: vmFolder, gone: vmFolder });
        const early = t.used.length;
        await t.answer(1, { old: vmFolder });
        check('VMs, newer folder data asked for: the draw waits for it and uses it', early === 0 && t.used.join('|') === 'old', { early, used: t.used });
    }
    {
        const t = await vms();
        t.reload();
        t.reload();
        t.land(0);
        await t.p.tick(300);
        t.land(1);
        await t.p.tick(300);
        check('VMs, two reloads at once: each list is drawn', t.draws.join() === 'vm 1,vm 2', t.draws);
        check('VMs, two reloads at once: no page errors', t.p.errors.length === 0, t.p.errors);
    }
    {
        const t = await vms();
        t.reload();
        t.reload();
        t.land(0);
        t.land(1);
        await t.p.tick(300);
        check('VMs, both lists land together: the list on the page is drawn once', t.draws.join() === 'vm 2', t.draws);
    }
    done();
})();
