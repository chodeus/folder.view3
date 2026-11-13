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
// userprefs.cfg as Unraid writes it, and its values as read_order.php hands them to a page
const userprefs = (names) => names.map((n, i) => `${i}="${n}"\n`).join('');
const prefsOf = (server) => { const f = path.join(server.config, '..', 'dockerMan', 'userprefs.cfg'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
const valuesOf = (text) => (text || '').split('\n').map((l) => (l.match(PREFS_LINE) || [])[1]).filter((v) => v !== undefined);

// The settings page's import and export code, sending every request to `server` (phpServer). refuse: folder ids update.php is not reached for
const settingsPage = (server, { refuse = [] } = {}) => {
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
        if (name === 'update.php' && refuse.includes(data.id)) return w.$.Deferred().reject({ status: 500, responseJSON: { error: 'refused by the test' } }).promise();
        const answer = JSON.parse(server.server(name, 'POST', data));
        return answer.error ? w.$.Deferred().reject({ status: 500, responseJSON: answer }).promise() : w.$.Deferred().resolve(answer).promise();
    };
    // read.php is the shipped one; read_order.php answers what userprefs.cfg holds, as readUserPrefs() reads it on Unraid
    w.$.get = (url) => {
        const type = url.match(/type=(docker|vm)/)[1];
        if (url.includes('/read_order.php')) return w.$.Deferred().resolve(JSON.stringify(type === 'docker' ? valuesOf(prefsOf(server)) : [])).promise();
        return w.$.Deferred().resolve(server.server('read.php', 'GET', { type })).promise();
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
    const page = await drawDocker({ folders, containers, prefs: valuesOf(prefsOf(server)) });
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
        const before = prefsOf(server);
        const page = await importFile(server, FILE);
        const sent = page.posted.filter((p) => p.name === 'update.php').map((p) => p.data.id);
        const order = page.posted.find((p) => p.name === 'import_order.php');
        const drawn = await dockerPage(server, ['plex']);
        check('a saved order: the folders are saved last-first, the new ones named to import_order.php in the file\'s order',
            sent.join() === 'old,f2,f1,f3' && order && order.data.ids === '["f3","f1","f2"]', { sent, order });
        check('a saved order: the Docker page shows the new folders in the file\'s order, the one already placed keeps its place; userprefs.cfg is untouched',
            drawn.join() === 'Charlie,Alpha,Bravo,Old' && prefsOf(server) === before && page.dialogs.at(-1) === 'closed', { drawn, dialogs: page.dialogs });
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
