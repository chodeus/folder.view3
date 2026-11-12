// node .github/scripts/apply_defaults_test.js — the settings page's Apply Defaults sends the defaults alone, once per folder type, through
// the real $.post and the page's own loader: never a whole folder from the copy the page loaded (npm ci in this folder first)
'use strict';
const fs = require('fs');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { fakeXhr, scriptHelpers, check, done, read } = require('./preview_pages_harness.js');

const dom = new JSDOM('<!doctype html><html><body><button id="fv3-apply-defaults"></button></body></html>',
    { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window;
const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
w.$.i18n = (key) => key;
w.Response = Response;
run(scriptHelpers(read('langs/script.php')), 'script.php');
run(read('scripts/debug.js'), 'debug.js');

// The dialogs the page opens; a confirm dialog's callback is kept for the test to answer
const dialogs = [];
let confirm = null;
w.swal = (o, answer) => { confirm = answer || null; dialogs.push(`${o.type}: ${String(o.text).replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').replace('Download Debug Info', '').trim()}`); };
w.swal.close = () => {};

// The handler, the page's loader and what they call, from the shipped script; only the settings form and its save are this test's
const source = read('scripts/folderview3.js');
const lift = (name) => source.match(new RegExp(`^const ${name} = [\\s\\S]*?^};`, 'm'))[0];
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
run(['let fv3tForm = {}; let fv3tSaved = true; const fv3SubmitSettings = async () => fv3tSaved; const fv3CollectSettings = () => fv3tForm;',
    between('const escapeHtml = ', 'const rgbToHex = '), between('const fv3SafeParse = ', '// shared.js is not loaded on this page'),
    source.match(/^let dockers = .*$/m)[0], source.match(/^let vms = .*$/m)[0], lift('orderFolderIds'), lift('populateTable'),
    source.match(/^const swalLoaderOpts = .*$/m)[0], lift('postEach'), lift('showBatchErrors'),
    between("$('#fv3-apply-defaults')", 'const fv3ExportAll'),
    'window.fv3tPage = (form, saved) => { fv3tForm = form; fv3tSaved = saved; return populateTable(); };'].join('\n'), 'folderview3.js');

const SERVER = '/plugins/folder.view3/server/';
const JSON_HEAD = { type: 'application/json', headers: { 'X-FV3-Answer': '1' } };
const OK = { status: 200, body: '{"success":true}', ...JSON_HEAD };
const REFUSED = { status: 500, body: '{"error":"Could not write docker.json — nothing was saved"}', ...JSON_HEAD };
const DROPPED = { status: 200, body: '', type: 'text/html' };
const FORM = { default_preview: '2', default_preview_hover: 'yes', default_border_color: '#abcdef', default_vertical_bars_color: '#123456', default_separator_color: '#654321',
    default_overflow: 'scroll', default_context_graph_time: '120' };
const DOCKERS = { a1: { name: 'Apps', containers: ['old-name'], settings: { lock_colors: true, preview: 0 } }, m1: { name: 'Media', containers: [], settings: {} } };
const VMS = { v1: { name: 'Desktops', containers: [], settings: {} } };

// Loads the page with these folders on the server, clicks the button, confirms. `reloads`: whether the reads after the POSTs go through
const apply = async (dockers, vms, answers, { saved = true, reloads = true } = {}) => {
    const posted = [];
    let reads = 0;
    fakeXhr(w, (method, url, body) => {
        if (method === 'POST') { posted.push({ file: url.replace(SERVER, ''), fields: Object.fromEntries(new URLSearchParams(body)) }); return answers.shift(); }
        reads++;
        if (posted.length && !reloads) return { status: 500, body: '{"error":"docker.json is unreadable"}', ...JSON_HEAD };
        const data = url.includes('read_unraid_order') ? [] : url.includes('type=docker') ? dockers : vms;
        return { status: 200, body: JSON.stringify(data), ...JSON_HEAD };
    });
    await w.fv3tPage(FORM, saved);
    dialogs.length = 0;
    w.$('#fv3-apply-defaults').trigger('click');
    await confirm(true);
    return { posted, dialog: dialogs[dialogs.length - 1], reads };
};

(async () => {
    const both = await apply(DOCKERS, VMS, [OK, OK]);
    const sent = both.posted.map((p) => JSON.parse(p.fields.settings));
    check('one POST to apply_defaults.php per folder type, carrying the type and the defaults and nothing of a folder',
        JSON.stringify(both.posted.map((p) => [p.file, Object.keys(p.fields).sort().join(), p.fields.type]))
        === JSON.stringify([['apply_defaults.php', 'settings,type', 'docker'], ['apply_defaults.php', 'settings,type', 'vm']]), both.posted);
    check('the defaults are the form\'s values in the folder settings\' own shape, the same for both types',
        JSON.stringify(sent[0]) === JSON.stringify(sent[1]) && sent[0].preview === 2 && sent[0].preview_hover === true && sent[0].preview_overflow === 2
        && sent[0].context_graph_time === 120 && sent[0].use_global_defaults === true, sent[0]);
    check('the three colours are sent even though this page\'s copy of a folder locks them: the server decides, from the folder on disk',
        [sent[0].preview_border_color, sent[0].preview_vertical_bars_color, sent[0].preview_row_separator_color].join() === '#abcdef,#123456,#654321', sent[0]);
    check('then the page loads its folders again (four reads at load, four after) and says the defaults were applied',
        both.reads === 8 && both.dialog === 'success: Defaults applied to all folders.', both);

    const none = await apply({}, {}, [OK, OK]);
    check('a page that shows no folders still asks for both types: another tab may have made some since it loaded',
        none.posted.map((p) => p.fields.type).join() === 'docker,vm' && none.dialog === 'success: Defaults applied to all folders.', none);

    const refused = await apply(DOCKERS, VMS, [REFUSED, OK]);
    check('a refused request names that type\'s folders and the server\'s reason; the other type is still sent',
        refused.posted.map((p) => p.fields.type).join() === 'docker,vm' && refused.reads === 8
        && refused.dialog === 'error: Defaults were not applied to these folders: Apps, Media\nCould not write docker.json — nothing was saved', refused);

    const dropped = await apply({}, VMS, [DROPPED, DROPPED]);
    check('requests Unraid dropped say to reload; a type the page knows no folders of is named as a whole',
        dropped.dialog === 'error: Defaults were not applied to these folders: Docker folders, Desktops\nUnraid did not accept the request. Reload the page and try again.', dropped);

    const stale = await apply(DOCKERS, VMS, [OK, OK], { reloads: false });
    check('when the reload after it fails, that error stays up instead of "applied": the page still holds the old copy',
        stale.posted.length === 2 && stale.dialog === 'error: Could not load folder data. Try refreshing the page.', stale);

    const unsaved = await apply(DOCKERS, VMS, [], { saved: false });
    check('when the settings save before it failed, nothing is sent', unsaved.posted.length === 0 && unsaved.reads === 4, unsaved);
    done();
})();
