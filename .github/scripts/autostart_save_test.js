// node .github/scripts/autostart_save_test.js — the Autostart tab's Apply, through the real fv3LoadAutostart and fv3SubmitAutostart in jsdom (npm ci in this folder first)
'use strict';
const fs = require('fs');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { check, done, read } = require('./preview_pages_harness.js');

const JQUERY = fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8');
// Part of a shipped file, from one of its own lines up to another: the rest of FolderView3.page and folderview3.js needs the whole settings page
const part = (rel, from, to) => {
    const src = read(rel);
    const start = src.indexOf(from);
    const end = start < 0 ? -1 : src.indexOf(to, start);
    if (end < 0) throw new Error(`${rel}: "${from}" up to "${to}" not found`);
    return src.slice(start, end);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(`jsdom: ${e.message}`));
    const panel = part('FolderView3.page', '<div class="fv3-page-panel" id="fv3-panel-autostart"', '<div class="fv3-page-panel" id="fv3-panel-css"');
    const dom = new JSDOM(`<!doctype html><html><body>${panel}</body></html>`,
        { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
    w.eval(JQUERY);
    const $ = w.$;

    // Unraid's side: no language pack loaded, its switch button, its sweetalert
    $.i18n = (key) => key;
    $.fn.switchButton = function () { return this; };
    const dialogs = [];
    w.swal = (o) => dialogs.push(o);

    // HTTP: the three reads answer a tab with two autostarted containers; `reply` is what update_autostart.php answers
    const file = { mode: 'folder', sequence: [], autostart: [{ name: 'app-a', wait: 0 }, { name: 'app-b', wait: 30 }], apiFile: false };
    const info = Object.fromEntries(['app-a', 'app-b', 'app-c'].map((n) => [n, { info: { State: { manager: 'dockerman' }, Config: { Labels: {} } } }]));
    const answers = { 'read_autostart.php': file, 'read_info.php': info, 'read_membership.php': { membership: { 'app-a': 'Media' } } };
    const calls = [];
    $.get = (url) => {
        const name = url.split('/').pop().split('?')[0];
        calls.push(`GET ${name}`);
        return name in answers ? $.Deferred().resolve(JSON.stringify(answers[name])) : $.Deferred().reject({ status: 404 });
    };
    $.post = (url) => { calls.push(`POST ${url.split('/').pop()}`); return $.Deferred().resolve(''); };
    let reply;
    const posted = [];
    $.ajax = (o) => {
        posted.push({ url: o.url.split('/').pop(), method: o.method, data: o.data });
        return reply && reply.reject ? $.Deferred().reject(reply.reject) : $.Deferred().resolve(reply);
    };

    // The settings page's scripts in page order: script.php's inline helpers (as preview_pages_harness.js lifts them), debug.js, folderview3.js
    run(read('langs/script.php').match(/^\s*window\.fv3JsArg = [\s\S]*?window\.fv3SwitchLabels = .*$/m)[0].replace(/<\?=[\s\S]*?\?>/g, '"."'), 'script.php');
    run(read('scripts/debug.js'), 'debug.js');
    run(part('scripts/folderview3.js', 'const escapeHtml = ', 'const rgbToHex = '), 'folderview3.js');
    run(part('scripts/folderview3.js', 'const fv3SafeParse = ', 'if (typeof $ !== \'undefined\' && typeof csrf_token'), 'folderview3.js');
    run(part('scripts/folderview3.js', '// ---- Autostart tab ----', '// Page-level tab switching'), 'folderview3.js');

    const names = (sel) => $(sel).toArray().map((tr) => tr.getAttribute('data-name'));
    await run('fv3LoadAutostart()');
    check('the tab loads the file: two rows in the sequence, one not autostarted, Folder mode',
        same([names('#fv3-as-rows .fv3-as-item'), names('#fv3-as-off-rows .fv3-as-item'), $('#fv3-autostart-mode').val()], [['app-a', 'app-b'], ['app-c'], 'folder']));

    // One Apply with the mode set to `mode`: the dialog shown, how often the file was read, and what was posted
    const save = async (answer, mode = 'folder') => {
        dialogs.length = 0;
        posted.length = 0;
        const reads = () => calls.filter((c) => c === 'GET read_autostart.php').length;
        const before = reads();
        reply = answer;
        $('#fv3-autostart-mode').val(mode);
        await run('fv3SubmitAutostart()');
        return { dialog: dialogs[0], dialogs: dialogs.length, reads: reads() - before, posted: [...posted], mode: $('#fv3-autostart-mode').val() };
    };

    // update_autostart.php answers { success, warning? }: saved either way, `warning` says the order was not applied
    const warning = { success: true, mode: 'folder', sequence: [], warning: 'the autostart file could not be written' };
    for (const [how, answer] of [['parsed by jQuery', warning], ['as text', JSON.stringify(warning)]]) {
        const r = await save(answer);
        check(`a save whose sync stopped, answered ${how}: a warning with the reason, no timer, and the tab is read again`,
            r.dialogs === 1 && r.dialog.type === 'warning' && r.dialog.text === 'Saved, but not everything could be applied: the autostart file could not be written'
            && !('timer' in r.dialog) && r.reads === 2, r);
    }
    const clean = await save({ success: true, mode: 'folder', sequence: [] });
    check('a clean save shows saved-and-applied, and the tab is read again',
        clean.dialogs === 1 && clean.dialog.type === 'success' && clean.dialog.text === 'Start order saved and applied.' && clean.dialog.timer === 1800 && clean.reads === 2, clean);
    check('and posts the mode, the sequence as drawn and no unedited waits',
        same(clean.posted, [{ url: 'update_autostart.php', method: 'POST', data: { mode: 'folder', sequence: '["app-a","app-b"]', waits: '{}' } }]), clean.posted);

    // Unraid before 7.4 answers a POST with a stale csrf_token with an empty 200; a signed-out session answers the login page
    for (const [how, answer] of [['an empty 200', ''], ['a page of HTML', '<html>login</html>'], ['JSON that is not an object', 'true'], ['a JSON null', 'null']]) {
        const r = await save(answer, 'custom');
        check(`${how} is a failed save: the error dialog only, and the tab keeps the unsaved mode`,
            r.dialogs === 1 && r.dialog.type === 'error' && r.dialog.text.startsWith('Failed to save start order: update_autostart.php returned no JSON answer')
            && r.reads === 1 && r.mode === 'custom' && r.posted.length === 1 && r.posted[0].data.mode === 'custom', r);
    }
    const refused = await save({ reject: { status: 400, responseJSON: { error: 'Invalid payload' } } }, 'custom');
    check('a refused save shows the server\'s reason', refused.dialogs === 1 && refused.dialog.type === 'error' && refused.dialog.text.startsWith('Failed to save start order: Invalid payload') && refused.reads === 1, refused);

    check('no script errors', errors.length === 0, errors);
    done();
})();
