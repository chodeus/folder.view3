// node .github/scripts/import_order_test.js — a folder export imported on the settings page shows its folders in the file's order on the
// Docker page: the real settings code, the real update.php / import_order.php / read.php, and the real docker.js drawing the result (needs php)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { drawDocker, scriptHelpers, check, done, read, phpServer } = require('./preview_pages_harness.js');

const part = (rel, from, to) => {
    const src = read(rel);
    const start = src.indexOf(from);
    const end = start < 0 ? -1 : src.indexOf(to, start);
    if (end < 0) throw new Error(`${rel}: "${from}" up to "${to}" not found`);
    return src.slice(start, end);
};
const PREFS_LINE = /^\d+="(.*)"$/;
// userprefs.cfg as Unraid writes it, and the values a line holds
const userprefs = (names) => names.map((n, i) => `${i}="${n}"\n`).join('');
const prefsOf = (server) => { const f = path.join(server.config, '..', 'dockerMan', 'userprefs.cfg'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const valuesOf = (text) => (text || '').split('\n').map((l) => (l.match(PREFS_LINE) || [])[1]).filter((v) => v !== undefined);

// The settings page's import and export code, sending every request to `server` (phpServer). refuse: folder ids update.php is not reached for;
// orderDown: import_order.php fails outright, as a PHP fatal does (500, no JSON)
const settingsPage = (server, { refuse = [], orderDown = false } = {}) => {
    const panel = part('FolderView3.page', '<div class="fv3-page-panel" id="fv3-panel-backup"', '<div class="fv3-page-panel" id="fv3-panel-dashboard"');
    const dom = new JSDOM(`<!doctype html><html><body>${panel}</body></html>`,
        { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
    const w = dom.window;
    const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
    w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
    w.$.i18n = (key) => key;
    const dialogs = [];
    w.swal = (o) => { dialogs.push(`${o.type}: ${String(o.text).replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').trim()}`); };
    w.swal.close = () => dialogs.push('closed');
    run(scriptHelpers(read('langs/script.php')), 'script.php');
    run(read('scripts/debug.js'), 'debug.js');
    const source = read('scripts/folderview3.js');
    const lift = (name) => source.match(new RegExp(`^const ${name} = [\\s\\S]*?^};`, 'm'))[0];
    run([part('scripts/folderview3.js', 'const escapeHtml = ', '// shared.js is not loaded on this page'),
        source.match(/^let dockers = .*$/m)[0], source.match(/^let vms = .*$/m)[0], source.match(/^const swalLoaderOpts = .*$/m)[0],
        lift('fv3PageFolderIds'), lift('populateTable'), lift('buildOrderedExport'), lift('postEach'), lift('showBatchErrors'),
        source.match(/^const fv3IsFolderShaped = [\s\S]*?;\n/m)[0], part('scripts/folderview3.js', 'const fv3ImportWarnings = ', '\n\n'), lift('fv3ImportFolderMap'),
        'Object.assign(window, { populateTable, fv3ImportFolderMap, buildOrderedExport });'].join('\n'), 'folderview3.js');
    const posted = [];
    w.$.post = (url, data) => {
        const name = url.split('/').pop();
        posted.push({ name, data });
        if (name === 'import_order.php' && orderDown) return w.$.Deferred().reject({ status: 500, responseText: '' }).promise();
        if (name === 'update.php' && refuse.includes(data.id)) return w.$.Deferred().reject({ status: 500, responseJSON: { error: 'refused by the test' } }).promise();
        const answer = JSON.parse(server.server(name, 'POST', data));
        return answer.error ? w.$.Deferred().reject({ status: 500, responseJSON: answer }).promise() : w.$.Deferred().resolve(answer).promise();
    };
    // read.php and read_order.php are the shipped ones
    w.$.get = (url) => {
        const type = url.match(/type=(docker|vm)/)[1];
        return w.$.Deferred().resolve(server.server(url.includes('/read_order.php') ? 'read_order.php' : 'read.php', 'GET', { type })).promise();
    };
    return { w, dialogs, posted };
};
const folder = (name, containers = []) => ({ name, icon: '', regex: '', containers, settings: {}, hidden_preview: [], actions: [] });
// A server with these folders, this saved order and these containers
const serverWith = (folders, prefs, containers) => {
    const server = phpServer('import-order-test', { containers });
    fs.writeFileSync(path.join(server.config, 'docker.json'), JSON.stringify(folders));
    if (prefs !== null) fs.writeFileSync(path.join(server.config, '..', 'dockerMan', 'userprefs.cfg'), typeof prefs === 'string' ? prefs : userprefs(prefs));
    return server;
};
// The Docker page drawn by the real docker.js from what the server now holds: its folders, top-down, by name
const dockerPage = async (server, containers) => {
    const folders = JSON.parse(fs.readFileSync(path.join(server.config, 'docker.json'), 'utf8'));
    const page = await drawDocker({ folders, containers, prefs: JSON.parse(server.server('read_order.php', 'GET', { type: 'docker' })) });
    await page.draw();
    return page.rows().filter((r) => r.startsWith('folder-')).map((r) => folders[r.slice(7)].name);
};
// What the settings page does: load its tables, then import the file
const importFile = async (server, file, opts) => {
    const page = settingsPage(server, opts);
    await page.w.populateTable();
    await page.w.fv3ImportFolderMap(JSON.parse(JSON.stringify(file)), 'docker');
    return page;
};
const FILE = { f3: folder('Charlie'), f1: folder('Alpha'), f2: folder('Bravo'), old: folder('Old', ['plex']) };

(async () => {
    {
        const server = serverWith({ old: folder('Old', ['plex']) }, ['plex', 'folder-old'], ['plex']);
        const page = await importFile(server, FILE);
        const sent = page.posted.filter((p) => p.name === 'update.php').map((p) => p.data.id);
        const order = page.posted.find((p) => p.name === 'import_order.php');
        const drawn = await dockerPage(server, ['plex']);
        check('a saved order: the folders are saved in the file\'s order, the new ones named to import_order.php in that order',
            sent.join() === 'f3,f1,f2,old' && order && order.data.ids === '["f3","f1","f2"]', { sent, order });
        check('a saved order: the new folders go on top of it in the file\'s order, and the Docker page shows them so; the one already placed keeps its place',
            valuesOf(prefsOf(server)).join() === 'folder-f3,folder-f1,folder-f2,plex,folder-old'
            && drawn.join() === 'Charlie,Alpha,Bravo,Old' && page.dialogs.at(-1) === 'closed', { prefs: prefsOf(server), drawn, dialogs: page.dialogs });
        server.cleanup();
    }
    {
        const server = serverWith({ old: folder('Old', ['alpha']) }, null, ['zed', 'alpha']);
        const page = await importFile(server, FILE);
        const created = valuesOf(prefsOf(server));
        const drawn = await dockerPage(server, ['zed', 'alpha']);
        check('no saved order: import_order.php creates one, the new folders first in the file\'s order, then the rest as the page drew it (A-Z)',
            created.join() === 'folder-f3,folder-f1,folder-f2,alpha,folder-old,zed', created);
        check('no saved order: the Docker page then shows the new folders in the file\'s order', drawn.join() === 'Charlie,Alpha,Bravo,Old' && page.dialogs.at(-1) === 'closed', { drawn, dialogs: page.dialogs });
        server.cleanup();
    }
    {
        const server = serverWith({}, '0="b"\n1="a', ['a', 'b']);
        const page = await importFile(server, { n1: folder('New') });
        check('a saved order that will not parse: the folders are saved, the dialog says their order could not be saved, and the file is left',
            Object.keys(JSON.parse(fs.readFileSync(path.join(server.config, 'docker.json'), 'utf8'))).join() === 'n1' && prefsOf(server) === '0="b"\n1="a'
            && /^warning: Saved, but the folders' order could not be saved: Unraid's saved Docker order \(userprefs\.cfg\) could not be read/.test(page.dialogs.at(-1)), page.dialogs);
        server.cleanup();
    }
    {
        const server = serverWith({}, ['plex'], ['plex']);
        const page = await importFile(server, FILE, { refuse: ['f1'] });
        const order = page.posted.find((p) => p.name === 'import_order.php');
        check('a folder that was not saved is left out of the order, and the dialog names it', order && order.data.ids === '["f3","f2","old"]'
            && /These folders could not be imported: Alpha/.test(page.dialogs.at(-1)), { order, dialogs: page.dialogs });
        server.cleanup();
    }
    {
        const server = serverWith({}, null, ['plex']);
        const page = await importFile(server, FILE, { orderDown: true });
        check('import_order.php fails outright: the dialog says neither the folders\' order nor the start order was saved, and no order is written',
            page.dialogs.at(-1) === "warning: Saved, but the folders' order could not be saved: HTTP 500\nSaved, but the Docker start order could not be updated: HTTP 500"
            && prefsOf(server) === null, page.dialogs);
        server.cleanup();
    }
    {
        const server = serverWith({}, null, []);
        const page = await importFile(server, FILE);
        check('no saved order and Docker lists nothing (stopped, or no containers): the dialog says the order could not be saved, and none is written',
            page.dialogs.at(-1) === "warning: Saved, but the folders' order could not be saved: Docker is not running or lists no containers" && prefsOf(server) === null, page.dialogs);
        server.cleanup();
    }
    {
        // Plex (^plex) above a catch-all Other (.): the folder listed first takes plex, on the page and in the server's membership
        const overlap = { p: { ...folder('Plex'), regex: '^plex' }, o: { ...folder('Other'), regex: '.' } };
        const plusBundle = { schemaVersion: 1, type: 'docker', mode: 'full', reason: 'manual', folders: { a: { name: 'Plex', regex: '^plex', containers: [] }, b: { name: 'Other', regex: '.', containers: [] } } };
        const results = [];
        for (const [label, prefs] of [['a saved order', ['plex', 'sonarr']], ['none', null]]) {
            for (const via of ['FV3 folder import', 'FolderView Plus import']) {
                const server = serverWith({}, prefs, ['plex', 'sonarr']);
                if (via === 'FV3 folder import') await importFile(server, overlap);
                else server.server('import_foreign.php', 'POST', { bundle: JSON.stringify(plusBundle), type: 'docker', action: 'apply' });
                const folders = JSON.parse(fs.readFileSync(path.join(server.config, 'docker.json'), 'utf8'));
                const page = await drawDocker({ folders, containers: ['plex', 'sonarr'], prefs: JSON.parse(server.server('read_order.php', 'GET', { type: 'docker' })) });
                await page.draw();
                const byName = Object.fromEntries(Object.entries(folders).map(([id, f]) => [f.name, page.members(id).join()]));
                const shown = page.rows().filter((r) => r.startsWith('folder-')).map((r) => folders[r.slice(7)].name).join();
                results.push({ label, via, shown, byName, server: JSON.parse(server.server('read_membership.php', 'GET', { type: 'docker' })).membership });
                server.cleanup();
            }
        }
        check('overlapping regexes, imported onto a server with a saved order and with none, from either import: Plex shows first and takes plex, Other takes the rest; the server agrees',
            results.every((r) => r.shown === 'Plex,Other' && r.byName.Plex === 'plex' && r.byName.Other === 'sonarr'
                && JSON.stringify(r.server) === JSON.stringify({ plex: 'Plex', sonarr: 'Other' })), results);
    }
    {
        // A Docker folder export, then that file imported on another server: the folders show as they did
        const folders = { u1: folder('Unsaved one'), u2: folder('Unsaved two'), s1: folder('Saved one'), s2: folder('Saved two') };
        const source = serverWith(folders, ['plex', 'folder-s2', 'folder-s1'], ['plex']);
        const shown = await dockerPage(source, ['plex']);
        const exporter = settingsPage(source);
        await exporter.w.populateTable();
        const file = JSON.parse(JSON.stringify(await exporter.w.buildOrderedExport(folders, 'docker')));
        source.cleanup();
        const results = [];
        for (const [label, prefs] of [['a saved order', ['plex']], ['none', null]]) {
            const target = serverWith({}, prefs, ['plex']);
            await importFile(target, file);
            results.push({ label, drawn: await dockerPage(target, ['plex']) });
            target.cleanup();
        }
        check('export, then import on another server (with a saved order, and with none): the Docker page shows the folders as the source did',
            shown.join() === 'Unsaved two,Unsaved one,Saved two,Saved one' && results.every((r) => r.drawn.join() === shown.join()), { shown, results });
    }
    done();
})();
