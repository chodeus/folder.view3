// node .github/scripts/folder_editor_dom_test.js [plugin-dir] — the folder editor's regex-held rows, run through the real Folder.page and folder.js in jsdom (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

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

// Only the server reads are stubbed: read.php gives `folders`, read_info.php the containers
const openEditor = async ({ id, folders, containers }) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
    vc.on('jsdomError', (e) => { if (!/navigation/i.test(String(e.message))) errors.push(`jsdom: ${e.message}`); });
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
    $.post = () => $.Deferred().resolve('ok');
    w.fetch = async () => ({ json: async () => ({}) });
    $.i18n = (key) => key;
    run(read('langs/script.php').match(/^(\s*)window\.fv3I18nOr = [\s\S]*?^\1};/m)[0]);
    w.fv3FailReason = (err) => `HTTP ${err?.status}`;
    w.fv3SwitchLabels = () => ({ off_label: 'OFF', on_label: 'ON' });
    w.swal = (o) => errors.push(`swal: ${JSON.stringify(o)}`);
    w.fv3SwalError = (text) => errors.push(`swal: ${text}`);
    $.fn.switchButton = function () { return this; };
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

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
