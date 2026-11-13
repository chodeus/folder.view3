// node .github/scripts/settings_order_test.js — the settings page lists each type's folders in the order the Docker and VMs pages draw
// them: the real settings code and the real page scripts on the same folders and saved order
'use strict';
const fs = require('fs');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makePage, drawDocker, fakeXhr, scriptHelpers, check, done, read, phpServer } = require('./preview_pages_harness.js');

// The settings page's backup panel (the two folder tables) with the shipped code that fills them
const part = (rel, from, to) => {
    const src = read(rel);
    const start = src.indexOf(from);
    const end = start < 0 ? -1 : src.indexOf(to, start);
    if (end < 0) throw new Error(`${rel}: "${from}" up to "${to}" not found`);
    return src.slice(start, end);
};
const settingsPage = () => {
    const panel = part('FolderView3.page', '<div class="fv3-page-panel" id="fv3-panel-backup"', '<div class="fv3-page-panel" id="fv3-panel-dashboard"');
    const dom = new JSDOM(`<!doctype html><html><body>${panel}</body></html>`,
        { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
    const w = dom.window;
    const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
    w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
    w.$.i18n = (key) => key;
    w.swal = () => {};
    run(scriptHelpers(read('langs/script.php')), 'script.php');
    run(read('scripts/debug.js'), 'debug.js');
    const source = read('scripts/folderview3.js');
    const lift = (name) => source.match(new RegExp(`^const ${name} = [\\s\\S]*?^};`, 'm'))[0];
    run([part('scripts/folderview3.js', 'const escapeHtml = ', '// shared.js is not loaded on this page'),
        source.match(/^let dockers = .*$/m)[0], source.match(/^let vms = .*$/m)[0], lift('fv3PageFolderIds'), lift('populateTable'),
        'window.fv3tTable = () => populateTable();'].join('\n'), 'folderview3.js');
    return w;
};
// What the settings page lists for both types, from the server's answers
const settings = async (answers) => {
    const w = settingsPage();
    w.$.get = (url) => {
        const m = url.match(/server\/(\w+)\.php\?type=(docker|vm)/);
        return w.$.Deferred().resolve(JSON.stringify(answers[m[1]][m[2]])).promise();
    };
    await w.fv3tTable();
    const names = (tbody) => w.$(`tbody#${tbody} tr`).toArray().map((tr) => w.$(tr).find('td').eq(1).text().trim());
    return { docker: names('docker'), vm: names('vms') };
};

// The Docker page's folder order, by name as shown (trimmed), top-down
const dockerPage = async ({ folders, names, prefs }) => {
    const page = await drawDocker({ folders, containers: names, prefs });
    await page.draw();
    return page.rows().filter((r) => r.startsWith('folder-')).map((r) => folders[r.slice(7)].name.trim());
};
// The VMs page's folder order, by name as shown (trimmed), top-down: Unraid's rows (VMMachines.php) for the names as VMs
const vmRow = (name, i) => `<tr parent-id="${i}" class="sortable"><td class="vm-name"><span class="outer"><span id="vm-u${i}" class="hand"><img class="img" src=""></span>` +
    `<span class="inner"><a>${name}</a><br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span></td><td></td>` +
    `<td><input class="autostart" type="checkbox" uuid="u${i}"></td></tr><tr child-id="${i}" id="name-${i}" style="display:none"><td colspan="3"></td></tr>`;
const vmPage = async ({ folders, names, prefs }) => {
    const info = Object.fromEntries(names.map((n, i) => [n, { uuid: `u${i}`, state: 'shutoff', autostart: false }]));
    const p = await makePage({ page: 'vm', api: false, answers: {
        'read.php': () => JSON.stringify(folders), 'read_order.php': () => JSON.stringify(prefs),
        'read_unraid_order.php': () => JSON.stringify(names), 'read_info.php': () => JSON.stringify(info),
    } });
    fakeXhr(p.w, () => ({ status: 200, body: '' }));
    p.w.loadlist_original = () => p.$('#kvm_list').html(names.map(vmRow).join(''));
    p.g('loadlist()');
    p.g('fv3DrawList()');
    for (let i = 0; i < 50 && !(p.w.fv3DrawLog || []).some((d) => d.outcome === 'drawn') && !p.errors.length; i++) await p.tick(100);
    if (p.errors.length || !(p.w.fv3DrawLog || []).some((d) => d.outcome === 'drawn')) throw new Error(`VMs page not drawn: ${p.errors.join('; ')}`);
    return p.$('#kvm_list > tr.folder').toArray().map((tr) => folders[tr.className.match(/folder-id-(\S+)/)[1]].name.trim());
};

// Generated setups: saved, partly saved, never saved, stale entries, folders the saved order does not name, all-digit ids
let seed = 7;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const POOL = ['plex', 'radarr', 'sonarr', 'web1', 'web2', 'db', 'app', 'redis', 'nginx'];
const KINDS = ['saved', 'partial', 'none', 'stale', 'folders unsaved'];
const setups = [];
for (let n = 0; n < 40; n++) {
    const kind = KINDS[n % KINDS.length];
    const names = shuffle(POOL).slice(0, int(1, 6));
    const folders = {};
    let free = shuffle(names);
    for (let f = int(1, 4); f > 0; f--) {
        const id = rnd() < 0.25 ? String(int(0, 30)) : `f${n}x${f}`;
        const take = int(0, Math.min(2, free.length));
        folders[id] = { name: `Folder ${String.fromCharCode(65 + int(0, 25))}${f}`, icon: '', regex: '', containers: free.slice(0, take), settings: {}, hidden_preview: [], actions: [] };
        free = free.slice(take);
    }
    const all = shuffle(Object.keys(folders).map((id) => `folder-${id}`).concat(names));
    let prefs = all;
    if (kind === 'partial') { const drop = new Set(shuffle(all).slice(0, int(1, 2))); prefs = all.filter((x) => !drop.has(x)); }
    if (kind === 'none') prefs = [];
    if (kind === 'stale') { prefs = all.slice(); prefs.splice(int(0, prefs.length), 0, 'folder-gone', 'ghost'); }
    if (kind === 'folders unsaved') prefs = all.filter((x) => !x.startsWith('folder-'));
    setups.push({ n, kind, names, folders, prefs });
}

(async () => {
    const mismatches = { docker: [], vm: [] };
    // Setups whose page shows every folder in an order other than the file's, so a table in file order cannot pass
    const reordered = { docker: 0, vm: 0 };
    for (const s of setups) {
        const answers = { read: { docker: s.folders, vm: s.folders }, read_order: { docker: s.prefs, vm: s.prefs } };
        const table = await settings(answers);
        const pages = { docker: await dockerPage(s), vm: await vmPage(s) };
        const fileOrder = Object.values(s.folders).map((f) => f.name);
        for (const type of ['docker', 'vm']) {
            if (JSON.stringify(table[type]) !== JSON.stringify(pages[type])) mismatches[type].push({ n: s.n, kind: s.kind, table: table[type], page: pages[type] });
            if (pages[type].length === fileOrder.length && JSON.stringify(pages[type]) !== JSON.stringify(fileOrder)) reordered[type]++;
        }
    }
    check(`${setups.length} setups: the settings page lists Docker folders in the Docker page's order`, mismatches.docker.length === 0, mismatches.docker.slice(0, 2));
    check(`${setups.length} setups: the settings page lists VM folders in the VMs page's order`, mismatches.vm.length === 0, mismatches.vm.slice(0, 2));
    check('the setups cover every kind of saved order, all-digit ids, and at least 10 pages per type drawing every folder out of file order',
        KINDS.every((k) => setups.some((s) => s.kind === k)) && setups.some((s) => Object.keys(s.folders).some((id) => /^\d+$/.test(id)))
        && reordered.docker >= 10 && reordered.vm >= 10, reordered);

    // Folders the saved order does not name (a VM import writes them so, last-first): the pages and the settings page list them alike
    const imported = { c3: { name: 'Charlie', icon: '', regex: '', containers: [], settings: {}, hidden_preview: [], actions: [] },
        b2: { name: 'Bravo', icon: '', regex: '', containers: [], settings: {}, hidden_preview: [], actions: [] },
        a1: { name: 'Alpha', icon: '', regex: '', containers: [], settings: {}, hidden_preview: [], actions: [] } };
    const plusSetup = { folders: imported, names: ['plex'], prefs: ['plex'] };
    const plusTable = await settings({ read: { docker: imported, vm: imported }, read_order: { docker: ['plex'], vm: ['plex'] } });
    const want = ['Alpha', 'Bravo', 'Charlie'];
    const plusPages = { docker: await dockerPage(plusSetup), vm: await vmPage(plusSetup) };
    check('folders the saved order does not name: the Docker page and the settings page list them alike, the last in the map first',
        JSON.stringify(plusPages.docker) === JSON.stringify(want) && JSON.stringify(plusTable.docker) === JSON.stringify(want), { page: plusPages.docker, table: plusTable.docker });
    check('folders the saved order does not name: the VMs page and the settings page list them alike, the last in the map first',
        JSON.stringify(plusPages.vm) === JSON.stringify(want) && JSON.stringify(plusTable.vm) === JSON.stringify(want), { page: plusPages.vm, table: plusTable.vm });

    // Nothing saved: the Docker page sorts by the name it shows, trimmed, any case, an empty name first
    const named = (name) => ({ name, icon: '', regex: '', containers: [], settings: {}, hidden_preview: [], actions: [] });
    const odd = { z: named(' Zulu'), e: named(''), b: named('beta'), a: named('Alpha 10'), n: named('Alpha 9'), m: named('\u00a0Mike\t') };
    const oddPage = await dockerPage({ folders: odd, names: ['plex'], prefs: [] });
    const oddTable = (await settings({ read: { docker: odd, vm: odd }, read_order: { docker: [], vm: [] } })).docker;
    check('nothing saved, names padded, empty, in either case and with numbers: the settings page sorts them as the Docker page does',
        JSON.stringify(oddTable) === JSON.stringify(oddPage) && JSON.stringify(oddPage) === JSON.stringify(['', 'Alpha 9', 'Alpha 10', 'beta', 'Mike', 'Zulu']), { page: oddPage, table: oddTable });
    // A FolderView Plus VM import through the shipped import_foreign.php, drawn by the real vm.js: its folders on top in its order (A-Z here)
    const server = phpServer('vm-import-test');
    fs.writeFileSync(require('path').join(server.config, 'vm.json'), JSON.stringify({ keep: named('Existing') }));
    const answer = JSON.parse(server.server('import_foreign.php', 'POST', { type: 'vm', action: 'apply', bundle: JSON.stringify({ schemaVersion: 1, type: 'vm', mode: 'full',
        reason: 'manual', prefs: { sortMode: 'alpha' }, folders: { z: { name: 'Zulu VMs', containers: [] }, a: { name: 'Alpha VMs', containers: [] }, m: { name: 'Mike VMs', containers: [] } } }) }));
    const vmFolders = JSON.parse(fs.readFileSync(require('path').join(server.config, 'vm.json'), 'utf8'));
    server.cleanup();
    const vmShown = await vmPage({ folders: vmFolders, names: ['win'], prefs: [] });
    check('a FolderView Plus VM import: the VMs page draws its folders on top in its order, the folder already there below them',
        answer.success === true && JSON.stringify(vmShown) === JSON.stringify(['Alpha VMs', 'Mike VMs', 'Zulu VMs', 'Existing']), { answer, vmShown });
    done();
})();
