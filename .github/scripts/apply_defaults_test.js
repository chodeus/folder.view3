// node .github/scripts/apply_defaults_test.js — the settings page's Apply Defaults on the page's own form: it saves the settings, then
// sends the defaults alone, once per folder type, through the real $.post. Never a whole folder from the copy the page loaded (needs php)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { fakeXhr, scriptHelpers, check, done, read, phpServer } = require('./preview_pages_harness.js');

// Part of a shipped file, from one of its own lines up to another
const part = (rel, from, to) => {
    const src = read(rel);
    const start = src.indexOf(from);
    const end = start < 0 ? -1 : src.indexOf(to, start);
    if (end < 0) throw new Error(`${rel}: "${from}" up to "${to}" not found`);
    return src.slice(start, end);
};
// The Dashboard and Defaults panels of the settings page: every control the settings form reads, and the Apply Defaults button
const panels = part('FolderView3.page', '<div class="fv3-page-panel" id="fv3-panel-dashboard"', '<div class="fv3-page-panel" id="fv3-panel-autostart"');
const dom = new JSDOM(`<!doctype html><html><body>${panels}</body></html>`,
    { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window;
const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
w.$.i18n = (key) => key;
w.Response = Response;
run(scriptHelpers(read('langs/script.php')), 'script.php');
run(read('scripts/debug.js'), 'debug.js');

// Unraid's dialog: what the page opened, and a confirm dialog's callback for the test to answer
const dialogs = [];
let confirm = null;
w.swal = (o, answer) => { confirm = answer || null; dialogs.push(`${o.type}: ${String(o.text).replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').replace('Download Debug Info', '').trim()}`); };
w.swal.close = () => {};

// The shipped script's own code for all of it: the settings form (collect, load, save), the folder loader, the batch helpers and
// the Apply Defaults handler. Nothing of the page is this test's
const source = read('scripts/folderview3.js');
const lift = (name) => source.match(new RegExp(`^const ${name} = [\\s\\S]*?^};`, 'm'))[0];
run([part('scripts/folderview3.js', 'const escapeHtml = ', '// shared.js is not loaded on this page'),
    source.match(/^let dockers = .*$/m)[0], source.match(/^let vms = .*$/m)[0], lift('orderFolderIds'), lift('populateTable'),
    source.match(/^const swalLoaderOpts = .*$/m)[0], lift('postEach'), lift('showBatchErrors'),
    part('scripts/folderview3.js', 'const fv3ToggleMap = ', 'const fv3ExportAll'),
    'window.fv3tLoad = async () => { await loadDashboardSettings(); return populateTable(); };'].join('\n'), 'folderview3.js');

const SERVER = '/plugins/folder.view3/server/';
const JSON_HEAD = { type: 'application/json', headers: { 'X-FV3-Answer': '1' } };
const OK = { status: 200, body: '{"success":true}', ...JSON_HEAD };
const REFUSED = { status: 500, body: '{"error":"Could not write docker.json — nothing was saved"}', ...JSON_HEAD };
const SAVE_REFUSED = { status: 500, body: '{"error":"Could not write settings.json — the previous settings are unchanged"}', ...JSON_HEAD };
const DROPPED = { status: 200, body: '', type: 'text/html' };
const DOCKERS = { a1: { name: 'Apps', containers: ['old-name'], settings: { lock_colors: true, preview: 0 } }, m1: { name: 'Media', containers: [], settings: {} } };
const VMS = { v1: { name: 'Desktops', containers: [], settings: {} } };
// What the user sets on the Defaults panel before the click
const fillForm = () => {
    w.$('select#default-preview').val('2');
    w.$('select#default-overflow').val('scroll');
    w.$('#default-preview-hover').prop('checked', true);
    w.$('#default-border-color-text').val('#abcdef');
    w.$('#default-vertical-bars-color-text').val('#123456');
    w.$('#default-separator-color-text').val('rgba(0,0,0,0.5)');
    w.$('#default-preview-text-width').val('30%');
    w.$('#default-context-graph-time').val('120');
};

// Loads the page with these folders on the server, fills the form, clicks the button, confirms. `save`: what the settings save is
// answered; `reloads`: whether the folder reads after the POSTs go through
const apply = async (dockers, vms, answers, { save = OK, reloads = true } = {}) => {
    const posted = [];
    let reads = 0;
    fakeXhr(w, (method, url, body) => {
        const file = url.replace(SERVER, '').split('?')[0];
        if (method === 'POST') {
            posted.push({ file, fields: Object.fromEntries(new URLSearchParams(body)) });
            return file === 'update_settings_batch.php' ? save : answers.shift();
        }
        if (file === 'read_settings.php') return { status: 200, body: '{}', ...JSON_HEAD };
        reads++;
        if (posted.length && !reloads) return { status: 500, body: '{"error":"docker.json is unreadable"}', ...JSON_HEAD };
        const data = file === 'read_unraid_order.php' ? [] : url.includes('type=docker') ? dockers : vms;
        return { status: 200, body: JSON.stringify(data), ...JSON_HEAD };
    });
    await w.fv3tLoad();
    fillForm();
    dialogs.length = 0;
    w.$('#fv3-apply-defaults').trigger('click');
    await confirm(true);
    return { posted, defaults: posted.filter((p) => p.file === 'apply_defaults.php'), dialog: dialogs[dialogs.length - 1], reads };
};

(async () => {
    const both = await apply(DOCKERS, VMS, [OK, OK]);
    const saved = JSON.parse(both.posted[0].fields.settings);
    check('the settings are saved first, as the form holds them', both.posted[0].file === 'update_settings_batch.php' && saved.default_preview === '2'
        && saved.default_preview_hover === 'yes' && saved.default_overflow === 'scroll' && saved.default_context_graph_time === '120', both.posted[0]);
    const sent = both.defaults.map((p) => JSON.parse(p.fields.settings));
    check('then one POST to apply_defaults.php per folder type, carrying the type and the defaults and nothing of a folder',
        JSON.stringify(both.posted.slice(1).map((p) => [p.file, Object.keys(p.fields).sort().join(), p.fields.type]))
        === JSON.stringify([['apply_defaults.php', 'settings,type', 'docker'], ['apply_defaults.php', 'settings,type', 'vm']]), both.posted);
    check('the defaults are the form\'s values in the folder settings\' own shape, the same for both types',
        JSON.stringify(sent[0]) === JSON.stringify(sent[1]) && sent[0].preview === 2 && sent[0].preview_hover === true && sent[0].preview_overflow === 2
        && sent[0].context_graph_time === 120 && sent[0].preview_text_width === '30%' && sent[0].use_global_defaults === true, sent[0]);
    check('the three colours are sent even though this page\'s copy of a folder locks them: the server decides, from the folder on disk',
        [sent[0].preview_border_color, sent[0].preview_vertical_bars_color, sent[0].preview_row_separator_color].join('|') === '#abcdef|#123456|rgba(0,0,0,0.5)', sent[0]);
    check('then the page loads its folders again (four reads at load, four after) and says the defaults were applied',
        both.reads === 8 && both.dialog === 'success: Defaults applied to all folders.', both);

    // That request sent on to the shipped endpoint: every key and value the page posts is one the server takes
    const { config, server, cleanup } = phpServer('apply-defaults-test');
    fs.writeFileSync(path.join(config, 'docker.json'), JSON.stringify({ a1: { name: 'Apps', containers: [], settings: { lock_colors: true, preview_border_color: '#000000' } } }));
    const answer = server('apply_defaults.php', 'POST', both.defaults[0].fields);
    const landed = JSON.parse(fs.readFileSync(path.join(config, 'docker.json'), 'utf8')).a1.settings;
    cleanup();
    check('the server takes the request as the page sent it: the defaults land, and the folder that locks its colours keeps its own',
        answer === '{"success":true}' && landed.preview === 2 && landed.use_global_defaults === true && landed.preview_text_width === '30%'
        && landed.preview_border_color === '#000000', { answer, landed });

    const none = await apply({}, {}, [OK, OK]);
    check('a page that shows no folders still asks for both types: another tab may have made some since it loaded',
        none.defaults.map((p) => p.fields.type).join() === 'docker,vm' && none.dialog === 'success: Defaults applied to all folders.', none);

    const refused = await apply(DOCKERS, VMS, [REFUSED, OK]);
    check('a refused request names that type\'s folders and the server\'s reason; the other type is still sent',
        refused.defaults.map((p) => p.fields.type).join() === 'docker,vm' && refused.reads === 8
        && refused.dialog === 'error: Defaults were not applied to these folders: Apps, Media\nCould not write docker.json — nothing was saved', refused);

    const dropped = await apply({}, VMS, [DROPPED, DROPPED]);
    check('requests Unraid dropped say to reload; a type the page knows no folders of is named as a whole',
        dropped.dialog === 'error: Defaults were not applied to these folders: Docker folders, Desktops\nUnraid did not accept the request. Reload the page and try again.', dropped);

    const stale = await apply(DOCKERS, VMS, [OK, OK], { reloads: false });
    check('when the reload after it fails, that error stays up instead of "applied": the page still holds the old copy',
        stale.defaults.length === 2 && stale.dialog === 'error: Could not load folder data. Try refreshing the page.', stale);

    const unsaved = await apply(DOCKERS, VMS, [], { save: SAVE_REFUSED });
    check('when the settings save before it is refused, its reason is shown and no defaults are sent',
        unsaved.posted.map((p) => p.file).join() === 'update_settings_batch.php' && unsaved.reads === 4
        && unsaved.dialog === 'error: Failed to save settings: Could not write settings.json — the previous settings are unchanged', unsaved);
    done();
})();
