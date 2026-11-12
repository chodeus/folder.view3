// node .github/scripts/folder_editor_dom_test.js [plugin-dir] — the folder editor's regex-held rows and its Save, run through the real Folder.page and folder.js in jsdom (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const { fakeXhr, scriptHelpers } = require('./preview_pages_harness.js');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const read = (rel) => fs.readFileSync(path.join(plugin, rel), 'utf8');
const JQUERY = fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8');

// The editor's markup, without the PHP and the page's own script tags
const pageHtml = () => {
    const page = read('Folder.page');
    const start = page.indexOf('<div class="canvas">');
    const end = page.indexOf('<script src="<?php autov(\'/plugins/folder.view3/scripts/debug.js\')');
    if (start < 0 || end < 0) throw new Error('Folder.page: editor markup not found');
    return page.slice(start, end).replace(/<\?(php|=)?[\s\S]*?\?>/g, '');
};

// Only Unraid's side is stubbed: read.php gives `folders`, read_info.php the containers, and `answers` (file name => { status, body })
// is what a save gets back through jQuery's own $.post; a save not named there is answered {"success":true}
const openEditor = async ({ id, folders, containers, answers = {} }) => {
    const errors = [];
    // jsdom cannot leave the page: each try to (the editor going back to its tab) is counted instead
    let left = 0;
    const vc = new VirtualConsole();
    vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
    vc.on('jsdomError', (e) => { if (/navigation/i.test(String(e.message))) left++; else errors.push(`jsdom: ${e.message}`); });
    const dom = new JSDOM(`<!doctype html><html><head></head><body>${pageHtml()}</body></html>`, {
        url: `http://tower.local/Docker/Folder?type=docker&id=${id}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
    });
    const w = dom.window;
    // Run as a classic script, so folder.js's top-level let/const are reachable as on the page
    const run = (src) => new vm.Script(src).runInContext(dom.getInternalVMContext());
    // jsdom has no form.<name> lookup, which folder.js uses
    const form = w.document.querySelector('div.canvas > form');
    for (const n of new Set([...form.querySelectorAll('[name]')].map((x) => x.getAttribute('name')))) {
        Object.defineProperty(form, n, { configurable: true, get: () => form.elements.namedItem(n) });
    }
    w.eval(JQUERY);
    const $ = w.$;
    const info = Object.fromEntries(containers.map((Name) => [Name, { info: { Name, Config: { Image: `img/${Name}`, Labels: {} } } }]));
    $.get = (url) => {
        const d = $.Deferred();
        if (url.includes('/server/read.php')) d.resolve(JSON.stringify(folders));
        else if (url.includes('/server/read_info.php')) d.resolve(JSON.stringify(info));
        else d.reject({ status: 404 });
        return d;
    };
    const posts = [];
    fakeXhr(w, (method, url) => {
        const name = url.split('/').pop();
        posts.push(name);
        return answers[name] || { status: 200, body: '{"success":true}', type: 'application/json' };
    });
    w.fetch = async () => ({ json: async () => ({}) });
    $.i18n = (key) => key;
    run(scriptHelpers(read('langs/script.php')));
    // Unraid's dialog: what it was given, and the callback its OK button runs
    w.swal = (o, closed) => { w.swal.closed = closed || null; errors.push(`swal: ${JSON.stringify(o)}`); };
    $.fn.switchButton = function () { return this; };
    // page order: debug.js (fv3SwalError), then folder.js
    run(read('scripts/debug.js'));
    run(read('scripts/folder.js'));
    for (let i = 0; i < 200 && !run('fv3FolderLoaded') && !errors.length; i++) await new Promise((r) => setTimeout(r, 5));

    const doc = w.document;
    const row = (name) => {
        const cb = doc.querySelector(`table.sortable input.container-switch[value="${name}"]`);
        const tr = cb.closest('tr');
        return { held: tr.classList.contains('fv3-regex-held'), visible: tr.style.display !== 'none', checked: cb.checked, disabled: cb.disabled };
    };
    const change = (input, on) => { input.checked = on; input.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const toggle = doc.querySelector('.fv3-regex-held-toggle');
    return {
        errors, row, toggle, loaded: run('fv3FolderLoaded'),
        show: (on) => change(toggle.querySelector('input'), on),
        tick: (name, on = true) => change(doc.querySelector(`table.sortable input.container-switch[value="${name}"]`), on),
        // Typing in the regex field calls updateRegex, which rebuilds the list
        typeRegex: (value) => { const input = doc.querySelector('input[name="regex"]'); input.value = value; run('updateRegex')(input); },
        // Submits the form as Save does: the requests it sent, the dialogs it showed, whether it went back to the tab, and
        // whether it had once the dialog left up was closed
        save: async () => {
            const [sent, shown, before] = [posts.length, errors.length, left];
            w.swal.closed = null;
            await run('submitForm')(form);
            await new Promise((r) => setTimeout(r, 20));
            const result = { posts: posts.slice(sent), dialogs: errors.splice(shown), back: left > before };
            if (w.swal.closed) w.swal.closed();
            await new Promise((r) => setTimeout(r, 20));
            return { ...result, backOnceClosed: left > before };
        },
    };
};

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};

(async () => {
    const folders = {
        A: { name: 'Apps', regex: '', containers: [] },
        B: { name: 'Photos', regex: '^immich', containers: [] },
        C: { name: 'Everything', regex: '^', containers: [] },
    };
    const e = await openEditor({ id: 'A', folders, containers: ['immich_server', 'immich_postgres', 'plex', 'sonarr'] });
    check('the editor loads without errors', e.loaded && e.errors.length === 0, e.errors);

    check('rows held by a specific regex are hidden', e.row('immich_server').held && !e.row('immich_server').visible && !e.row('immich_postgres').visible);
    check('rows only a catch-all matches stay shown', !e.row('plex').held && e.row('plex').visible && e.row('sonarr').visible);
    check('the tick box shows, with the held count', !e.toggle.hidden && e.toggle.querySelector('.fv3-regex-held-count').textContent === '(2)', e.toggle.textContent);
    e.show(true);
    check('the tick box shows the held rows', e.row('immich_server').visible && e.row('immich_postgres').visible);

    e.tick('immich_server');
    e.show(false);
    check('a held row ticked here stays shown with the box off', e.row('immich_server').visible && !e.row('immich_postgres').visible);

    e.typeRegex('^plex');
    const ticked = e.row('immich_server');
    check('a regex edit rebuilds the list and resets the tick', ticked.held && !ticked.checked, ticked);
    check('the held row ticked before the regex edit stays shown', ticked.visible, ticked);
    check('a held row never ticked stays hidden after the regex edit', !e.row('immich_postgres').visible);
    check("the edited regex captures its match", e.row('plex').checked && e.row('plex').disabled, e.row('plex'));
    check('no errors after the edits', e.errors.length === 0, e.errors);

    const editor = (answers) => openEditor({ id: 'A', folders, containers: ['plex', 'sonarr'], answers });
    const saved = await (await editor({})).save();
    check('Save sends the folder, then the start-order sync, and goes back to the tab',
        saved.posts.join() === 'update.php,sync_order.php' && saved.dialogs.length === 0 && saved.back, saved);
    // Unraid before 7.4 answers a POST with a stale csrf_token with an empty 200
    const dropped = await (await editor({ 'update.php': { status: 200, body: '' } })).save();
    check('a Save that Unraid dropped says so, sends no sync, and stays in the editor',
        dropped.posts.join() === 'update.php' && dropped.dialogs.length === 1 && !dropped.backOnceClosed && dropped.dialogs[0].includes('"type":"error"')
        && dropped.dialogs[0].includes('Could not save the folder: Unraid did not accept the request. Reload the page and try again.'), dropped);
    // a signed-out page: Unraid redirects the POST to its login page, which comes back as a 200
    const signedOut = await (await editor({ 'update.php': { status: 200, body: '<!DOCTYPE html><html><body>Login</body></html>', type: 'text/html' } })).save();
    check('a Save that got the login page back says so, sends no sync, and stays in the editor',
        signedOut.posts.join() === 'update.php' && signedOut.dialogs.length === 1 && !signedOut.backOnceClosed && signedOut.dialogs[0].includes('"type":"error"')
        && signedOut.dialogs[0].includes('Could not save the folder: Unraid did not accept the request. Reload the page and try again.'), signedOut);
    // Unraid 7.4 answers the stale csrf_token itself
    const stale74 = await (await editor({ 'update.php': { status: 403, body: '{"error":"wrong csrf_token"}', type: 'application/json' } })).save();
    check('a Save that Unraid 7.4 refused for its csrf_token says to reload, not "wrong csrf_token"',
        stale74.posts.join() === 'update.php' && stale74.dialogs.length === 1 && !stale74.backOnceClosed && stale74.dialogs[0].includes('"type":"error"')
        && stale74.dialogs[0].includes('Could not save the folder: Unraid did not accept the request. Reload the page and try again.'), stale74);
    const refused = await (await editor({ 'update.php': { status: 500, body: '{"error":"docker.json is unreadable"}', type: 'application/json' } })).save();
    check('a refused Save shows the server\'s reason and stays in the editor',
        refused.posts.join() === 'update.php' && refused.dialogs.length === 1 && !refused.backOnceClosed && refused.dialogs[0].includes('"type":"error"')
        && refused.dialogs[0].includes('Could not save the folder: docker.json is unreadable'), refused);
    const unsynced = await (await editor({ 'sync_order.php': { status: 503, body: '{"error":"the autostart file could not be written"}', type: 'application/json' } })).save();
    check('a Save whose start-order sync was refused warns with the reason, and goes back to the tab only once that warning is closed',
        unsynced.posts.join() === 'update.php,sync_order.php' && unsynced.dialogs.length === 1 && !unsynced.back && unsynced.backOnceClosed
        && unsynced.dialogs[0].includes('"type":"warning"') && unsynced.dialogs[0].includes('Saved, but the Docker start order could not be updated: the autostart file could not be written'), unsynced);

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
