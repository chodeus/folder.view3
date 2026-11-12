// node .github/scripts/dropped_post_test.js [jquery.js] — script.php's rule for a POST the plugin never answered, through jQuery's own ajax:
// with the rule and without it every request gives the same callbacks, except a plugin POST Unraid dropped (npm ci in this folder first)
'use strict';
const fs = require('fs');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { fakeXhr, scriptHelpers, check, done, read } = require('./preview_pages_harness.js');

const JQUERY = fs.readFileSync(process.argv[2] || require.resolve('jquery/dist/jquery.js'), 'utf8');
const RULE = scriptHelpers(read('langs/script.php'));
const REASON = 'Unraid did not accept the request. Reload the page and try again.';
const SERVER = '/plugins/folder.view3/server/';
// fv3_post_init() sends this on every answer the plugin's own script gives
const OURS = { 'X-FV3-Answer': '1' };
const LOGIN = '<!DOCTYPE html><html><body><form action="/login">Login</form></body></html>';
const WARNED = '<br />\n<b>Warning</b>:  Undefined variable $x in <b>lib.php</b> on line <b>9</b><br />\n{"success":true}';

// What comes back. `null` never answers
const ANSWERS = {
    'the plugin: JSON': { status: 200, body: '{"success":true}', type: 'application/json', headers: OURS },
    'the plugin behind something that drops its header: JSON': { status: 200, body: '{"success":true}', type: 'application/json' },
    'the plugin, header dropped: JSON sent as text/html': { status: 200, body: '{"success":true}', type: 'text/html' },
    'the plugin with a PHP warning printed in front of its JSON': { status: 200, body: WARNED, type: 'text/html', headers: OURS },
    'the plugin with no body': { status: 200, body: '', type: 'text/html', headers: OURS },
    'the plugin with broken JSON': { status: 200, body: '{"success":', type: 'application/json', headers: OURS },
    'Unraid before 7.4, stale csrf_token: an empty 200': { status: 200, body: '', type: 'text/html' },
    'a signed-out page: the login page as a 200': { status: 200, body: LOGIN, type: 'text/html' },
    'an empty 200 with a JSON header': { status: 200, body: '', type: 'application/json' },
    'text that is not JSON': { status: 200, body: 'ok', type: 'text/html' },
    'broken JSON with a JSON header': { status: 200, body: '{"success":', type: 'application/json' },
    'a PHP warning in front of JSON, header dropped': { status: 200, body: WARNED, type: 'text/html' },
    'JSON []': { status: 200, body: '[]', type: 'application/json' },
    'JSON 0': { status: 200, body: '0', type: 'application/json' },
    'JSON false': { status: 200, body: 'false', type: 'application/json' },
    'JSON null': { status: 200, body: 'null', type: 'application/json' },
    'an empty 204': { status: 204, body: '', type: 'text/html' },
    'the plugin: 400 with no body': { status: 400, body: '', type: 'text/html', headers: OURS },
    'the plugin: 400 with a JSON error': { status: 400, body: '{"error":"Invalid payload"}', type: 'application/json', headers: OURS },
    'Unraid 7.4, stale csrf_token: 403 with a JSON error': { status: 403, body: '{"error":"wrong csrf_token"}', type: 'application/json' },
    'a 500 page': { status: 500, body: '<html>oops</html>', type: 'text/html' },
    'the plugin: 503 with a JSON error': { status: 503, body: '{"error":"the autostart file could not be written"}', type: 'application/json', headers: OURS },
    'no answer': null,
};
const URLS = {
    'plugin save': SERVER + 'update.php',
    'plugin save, full address': 'http://tower.local' + SERVER + 'sync_order.php',
    'plugin read': SERVER + 'read.php?type=docker',
    "Unraid's own endpoint": '/plugins/dynamix.docker.manager/include/UserPrefs.php',
    "another plugin's endpoint": '/plugins/other.plugin/server/save.php',
    'the API': '/graphql',
};
// How a page or an extension sends it; `on` records a callback given through the call itself
const SHAPES = {
    '$.post(url, data)': ($, url) => $.post(url, { a: 1 }),
    '$.post(url, data, success)': ($, url, on) => $.post(url, { a: 1 }, (d, s, x) => on('success-arg', d, s, x.status)),
    "$.post(url, data, success, 'json')": ($, url, on) => $.post(url, { a: 1 }, (d, s, x) => on('success-arg', d, s, x.status), 'json'),
    '$.ajax({ method, data as text })': ($, url) => $.ajax({ url, method: 'POST', data: 'a=1&b=2' }),
    "$.ajax({ type, dataType: 'json' })": ($, url) => $.ajax({ url, type: 'post', dataType: 'json', data: { a: 1 } }),
    "$.ajax({ dataType: 'text', success, error, complete, context })": ($, url, on) => {
        const ctx = { tag: 'ctx' };
        return $.ajax({ url, method: 'POST', dataType: 'text', context: ctx,
            success(d, s, x) { on('success-opt', d, s, x.status, this === ctx); },
            error(x, s, e) { on('error-opt', s, String(e), x.status, this === ctx); },
            complete(x, s) { on('complete-opt', s, x.status, this === ctx); } });
    },
    '$.ajax({ statusCode })': ($, url, on) => $.ajax({ url, method: 'POST', statusCode: { 200() { on('code-200'); }, 403() { on('code-403'); }, 503() { on('code-503'); } } }),
    '$.ajax({ timeout })': ($, url) => $.ajax({ url, method: 'POST', timeout: 40 }),
    '$.post(...).abort()': ($, url) => { const x = $.post(url, { a: 1 }); x.abort(); return x; },
    '$.get(url)': ($, url) => $.get(url),
    '$.ajax({ method: GET, dataType: json })': ($, url) => $.ajax({ url, method: 'GET', dataType: 'json' }),
};
const sendsPost = (shape) => !shape.includes('get(') && !shape.includes('GET');
// Request hooks a community extension (a script in the plugin's scripts folder) may add to the same page
const EXTENSIONS = {
    'no extension': () => {},
    'an extension with ajaxSetup and a prefilter that listens': ($) => {
        $.ajaxSetup({ cache: false, headers: { 'X-Extension': '1' } });
        $.ajaxPrefilter((options, original, x) => { x.done(() => {}).fail(() => {}).always(() => {}); });
    },
    'an extension that re-points the promise the same way': ($) => $.ajaxPrefilter((options, original, x) => {
        const own = $.Deferred();
        x.done(function () { own.resolveWith(this, arguments); }).fail(function () { own.rejectWith(this, arguments); });
        own.promise(x);
    }),
};

// One page: jQuery, Unraid's side of every request, the extension's hooks, and (withRule) script.php's inline helpers, the rule among them
const makePage = (withRule, extension = 'no extension', extensionFirst = false) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(`jsdom: ${e.message}`));
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://tower.local/Docker', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
    w.eval(JQUERY);
    const $ = w.$;
    $.i18n = (key) => key;
    w.Response = Response;
    if (extensionFirst) EXTENSIONS[extension]($);
    if (withRule) run(RULE, 'script.php');
    if (!extensionFirst) EXTENSIONS[extension]($);
    // requests are answered in the order they were sent
    const queue = [];
    fakeXhr(w, () => queue.shift());
    const traces = new w.WeakMap();
    $(w.document).on('ajaxSuccess ajaxError ajaxComplete', (ev, xhr) => { const t = traces.get(xhr); if (t) t.push([`global-${ev.type}`]); });
    // Sends one request and records every way a caller can hear back, in the order they fire
    const send = (shape, url, answer) => {
        const trace = [];
        const on = (...event) => trace.push(JSON.parse(JSON.stringify(event, (k, v) => (v === undefined ? '(undefined)' : v))));
        queue.push(answer);
        const x = SHAPES[shape]($, url, on);
        traces.set(x, trace);
        x.done((d, s, xhr) => on('done', d, s, xhr.status)).fail((xhr, s, e) => on('fail', s, String(e), xhr.status, xhr.responseText)).always(() => on('always'));
        x.then((d) => on('then-ok', d), (xhr) => on('then-err', xhr.status));
        x.promise().then((d) => on('promise-ok', d), (xhr) => on('promise-err', xhr.status));
        $.when(x).then((d) => on('when-ok', d), (xhr) => on('when-err', xhr.status));
        (async () => { try { on('await-ok', await x); } catch (e) { on('await-err', e.status); } })();
        // heard back on every channel: jQuery runs then(), promise(), $.when() and await callbacks on later turns of the page's timers
        const heard = () => ['then-', 'promise-', 'when-', 'await-'].every((channel) => trace.some((e) => e[0].startsWith(channel)));
        const settled = new Promise((resolve) => { const look = () => (heard() ? resolve() : w.setTimeout(look, 5)); x.always(look); });
        return { x, trace, settled };
    };
    return { w, $, send, errors, run, queue };
};

const names = (trace) => trace.map((e) => e[0]);
const uniq = (list) => [...new Set(list)].sort();
// The answers that are not the plugin's, by name: the CSRF drop of each Unraid version, the login page, and the other
// successes with no plugin header and no JSON. The shipped rule is checked against this list, never the other way round
const NOT_PLUGIN_ANSWERS = new Set([
    'Unraid before 7.4, stale csrf_token: an empty 200', 'Unraid 7.4, stale csrf_token: 403 with a JSON error', 'a signed-out page: the login page as a 200',
    'an empty 200 with a JSON header', 'text that is not JSON', 'broken JSON with a JSON header', 'a PHP warning in front of JSON, header dropped', 'an empty 204']);

// Every shape x address x answer on a page with the rule and on one without it
const differential = async (extension, extensionFirst) => {
    const where = `${extension}${extension === 'no extension' ? '' : extensionFirst ? ', loaded before script.php' : ', loaded after script.php'}`;
    const rule = makePage(true, extension, extensionFirst);
    const plain = makePage(false, extension, extensionFirst);
    const cases = [];
    for (const shape of Object.keys(SHAPES)) for (const url of Object.keys(URLS)) for (const answer of Object.keys(ANSWERS)) {
        // only a request with a timeout, or an aborted one, ends without an answer
        if (ANSWERS[answer] === null && !/timeout|abort/.test(shape)) continue;
        cases.push({ shape, url, answer, rule: rule.send(shape, URLS[url], ANSWERS[answer]), plain: plain.send(shape, URLS[url], ANSWERS[answer]) });
    }
    // a request that never settles (a broken rule) is caught by the check below, not by hanging here
    await Promise.race([Promise.all(cases.flatMap((c) => [c.rule.settled, c.plain.settled])), new Promise((r) => setTimeout(r, 8000))]);
    for (const c of cases) for (const side of ['rule', 'plain']) c[side].trace.push(['state', c[side].x.state()]);

    // Read off plain jQuery: a POST to the plugin's server whose answer is not the plugin's. Where jQuery called it a success the
    // rule must fail it; where jQuery already failed it with that answer in hand (a body it could not parse, or the 403) the rule only marks it
    const applies = (c) => sendsPost(c.shape) && URLS[c.url].includes(SERVER) && NOT_PLUGIN_ANSWERS.has(c.answer);
    const failed = (c) => c.plain.trace.find((e) => e[0] === 'fail');
    const flips = cases.filter((c) => applies(c) && names(c.plain.trace).includes('done'));
    const marks = cases.filter((c) => applies(c) && failed(c) && failed(c)[3] === ANSWERS[c.answer].status);
    const rest = cases.filter((c) => !flips.includes(c) && !marks.includes(c));
    const unsettled = cases.filter((c) => c.plain.x.state() === 'pending' || c.rule.x.state() === 'pending');
    check(`${where}: every request settled, with the rule and without it`, unsettled.length === 0, unsettled.slice(0, 3).map((c) => [c.shape, c.url, c.answer]));
    const same = (c) => JSON.stringify(c.rule.trace) === JSON.stringify(c.plain.trace);
    const differ = rest.filter((c) => !same(c));
    check(`${where}: ${rest.length} requests the rule does not apply to give the same callbacks, arguments and order with it as without it`,
        rest.length > 1200 && differ.length === 0, differ.slice(0, 2).map((c) => ({ shape: c.shape, url: c.url, answer: c.answer, rule: c.rule.trace, plain: c.plain.trace })));
    const wronglyMarked = rest.filter((c) => c.rule.x.fv3Dropped);
    check(`${where}: none of them is marked dropped`, wronglyMarked.length === 0, wronglyMarked.slice(0, 2).map((c) => [c.shape, c.url, c.answer]));

    const failedWell = (c) => {
        const n = names(c.rule.trace);
        const fail = c.rule.trace.find((e) => e[0] === 'fail');
        return c.rule.x.state() === 'rejected' && c.rule.x.fv3Dropped === true && rule.w.fv3FailReason(c.rule.x) === REASON
            && JSON.stringify(fail) === JSON.stringify(['fail', 'error', 'not answered by the plugin', c.rule.x.status, ANSWERS[c.answer].body])
            && ['always', 'then-err', 'promise-err', 'when-err', 'await-err'].every((e) => n.includes(e))
            && !n.some((e) => /^(done|then-ok|promise-ok|when-ok|await-ok|success-)/.test(e))
            && (!c.shape.includes('error,') || n.includes('error-opt'));
    };
    const notFailed = flips.filter((c) => !failedWell(c));
    check(`${where}: ${flips.length} plugin POSTs that came back as a success but not from the plugin each fail, marked fv3Dropped, with the reload reason, and no success callback runs`,
        flips.length >= 100 && notFailed.length === 0, { flips: flips.length, bad: notFailed.slice(0, 2).map((c) => ({ shape: c.shape, url: c.url, answer: c.answer, rule: c.rule.trace })) });
    const notMarked = marks.filter((c) => !same(c) || c.rule.x.fv3Dropped !== true || rule.w.fv3FailReason(c.rule.x) !== REASON);
    check(`${where}: ${marks.length} that jQuery itself failed (a body it could not parse, Unraid 7.4's 403) fail as they did, now marked fv3Dropped with the reload reason`,
        marks.length >= 40 && notMarked.length === 0, notMarked.slice(0, 2).map((c) => ({ shape: c.shape, url: c.url, answer: c.answer, rule: c.rule.trace })));
    check(`${where}: both groups are POSTs to the three plugin addresses, and the answers are the ones that are not the plugin's`,
        uniq([...flips, ...marks].map((c) => c.url)).join('; ') === 'plugin read; plugin save; plugin save, full address'
        && JSON.stringify(uniq([...flips, ...marks].map((c) => c.answer))) === JSON.stringify(uniq([...NOT_PLUGIN_ANSWERS])),
        uniq([...flips, ...marks].map((c) => c.answer)));
    check(`${where}: no script errors`, rule.errors.length + plain.errors.length === 0, [...rule.errors, ...plain.errors]);
    return { rule, cases };
};

(async () => {
    const { rule, cases } = await differential('no extension', false);
    const ruleSays = Object.keys(ANSWERS).filter((a) => ANSWERS[a] !== null
        && rule.w.fv3NotPluginAnswer(ANSWERS[a].status, ANSWERS[a].headers?.['X-FV3-Answer'] || null, ANSWERS[a].body));
    check('fv3NotPluginAnswer() calls exactly the listed answers not the plugin\'s',
        JSON.stringify(uniq(ruleSays)) === JSON.stringify(uniq([...NOT_PLUGIN_ANSWERS])), ruleSays);
    await differential('an extension with ajaxSetup and a prefilter that listens', false);
    await differential('an extension that re-points the promise the same way', false);
    await differential('an extension that re-points the promise the same way', true);

    // What the pages show for the other failures is unchanged: the server's reason, else the status
    const reasonOf = (shape, url, answer) => rule.w.fv3FailReason(cases.find((c) => c.shape === shape && c.url === url && c.answer === answer).rule.x);
    check('a refused save still shows the server\'s reason and a 500 page its status; Unraid 7.4\'s stale csrf_token shows the reload reason',
        reasonOf('$.post(url, data)', 'plugin save', 'the plugin: 503 with a JSON error') === 'the autostart file could not be written'
        && reasonOf('$.post(url, data)', 'plugin save', 'the plugin: 400 with a JSON error') === 'Invalid payload'
        && reasonOf('$.post(url, data)', 'plugin save', 'Unraid 7.4, stale csrf_token: 403 with a JSON error') === REASON
        && reasonOf('$.post(url, data)', 'plugin save', 'a 500 page') === 'HTTP 500');

    // The settings page's own batch code through the real $.post: postEach, showBatchErrors and the folder import
    const page = makePage(true);
    const dialogs = [];
    // a confirm dialog's callback is kept for the test to answer
    let confirm = null;
    page.w.swal = (o, answer) => { confirm = answer || null; dialogs.push(`${o.type}: ${String(o.text).replace(/<br>/g, '\n').replace(/<[^>]*>/g, '').replace('Download Debug Info', '').trim()}`); };
    page.w.swal.close = () => {};
    // populateTable() redraws the settings page's folder tables, which this page does not have
    page.w.populateTable = () => {};
    page.run(read('scripts/debug.js'), 'debug.js');
    const source = read('scripts/folderview3.js');
    const lift = (name) => source.match(new RegExp(`^const ${name} = [\\s\\S]*?^};`, 'm'))[0];
    const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
    page.run([between('const escapeHtml = ', 'const rgbToHex = '), between('const fv3SafeParse = ', '// shared.js is not loaded on this page'),
        between('const fv3ImportedDialog = ', '// Replaces the open dialog'), ...['fv3IsFolderShaped', 'postEach', 'showBatchErrors', 'fv3ImportFolderMap'].map(lift),
        source.match(/^const swalLoaderOpts = .*$/m)[0], between('const fv3ForeignError = ', "$('#fv3-import-all-btn')"),
        'window.fv3ImportFolderMap = fv3ImportFolderMap; window.postEach = postEach; window.fv3ImportForeignBundle = fv3ImportForeignBundle;'].join('\n'), 'folderview3.js');
    const posted = [];
    const answerWith = (list) => fakeXhr(page.w, (method, url) => { posted.push(url.split('/').pop()); return list.shift(); });
    const ok = ANSWERS['the plugin: JSON'];
    const csrfDrop = ANSWERS['Unraid before 7.4, stale csrf_token: an empty 200'];
    const login = ANSWERS['a signed-out page: the login page as a 200'];
    const refused = ANSWERS['the plugin: 503 with a JSON error'];

    answerWith([ok, csrfDrop, login, refused]);
    const jobs = ['One', 'Two', 'Three', 'Four'].map((label) => ({ url: SERVER + 'update.php', data: { type: 'docker', id: label }, label }));
    const failedJobs = await page.w.postEach(jobs);
    check('postEach reports the dropped folder and the one that got the login page with the reload reason, and the refused one with the server\'s',
        JSON.stringify(failedJobs) === JSON.stringify([{ label: 'Two', reason: REASON }, { label: 'Three', reason: REASON }, { label: 'Four', reason: 'the autostart file could not be written' }]), failedJobs);
    check('and the two the plugin never answered are in the failed-request record a debug download carries',
        JSON.stringify(page.w.fv3FailureBuffer.map((f) => [f.method, f.url.split('/').pop(), f.status, f.statusText === 'not answered by the plugin']))
        === JSON.stringify([['POST', 'update.php', 200, true], ['POST', 'update.php', 200, true], ['POST', 'update.php', 503, false]]),
        page.w.fv3FailureBuffer);

    const folders = { a1: { name: 'Apps', containers: [] }, b2: { name: 'Media', containers: [] } };
    const importWith = async (list) => { dialogs.length = 0; posted.length = 0; answerWith(list); await page.w.fv3ImportFolderMap(folders, 'docker'); return { posted: [...posted], dialogs: [...dialogs] }; };
    const stale = await importWith([csrfDrop, csrfDrop]);
    check('an import from a stale page: no sync is sent, and one dialog names the folders and says to reload, with no "Saved, but"',
        stale.posted.join() === 'update.php,update.php' && stale.dialogs.length === 1
        && stale.dialogs[0] === `error: These folders could not be imported: Apps, Media\n${REASON}`, stale);
    const unsynced = await importWith([ok, ok, refused]);
    check('an import that saved but whose sync was refused still warns "Saved, but" with the server\'s reason',
        unsynced.posted.join() === 'update.php,update.php,sync_order.php' && unsynced.dialogs.length === 1
        && unsynced.dialogs[0] === 'warning: Saved, but the Docker start order could not be updated: the autostart file could not be written', unsynced);
    const mixed = await importWith([ok, refused, ok]);
    check('an import where one folder was refused names it and still syncs the one that saved',
        mixed.posted.join() === 'update.php,update.php,sync_order.php' && mixed.dialogs.join('|') === 'error: These folders could not be imported: Media\nthe autostart file could not be written', mixed);

    const twoReasons = await importWith([csrfDrop, refused]);
    check('an import whose two folders failed for different reasons shows both reasons, the reload one among them',
        twoReasons.posted.join() === 'update.php,update.php'
        && twoReasons.dialogs.join('|') === `error: These folders could not be imported: Apps, Media\n${REASON}\nthe autostart file could not be written`, twoReasons);

    // A FolderView Plus import: the preview is confirmed, then import_foreign.php's answer decides the last dialog
    const report = { types: { docker: { folders: [{ name: 'Apps' }, { name: 'Media' }] } } };
    const plusImport = async (applied) => {
        dialogs.length = 0;
        answerWith([{ ...ok, body: JSON.stringify({ success: true, report }) }, { ...ok, body: JSON.stringify(applied) }]);
        await page.w.fv3ImportForeignBundle('{}', 'docker');
        if (confirm) await confirm(true);
        return dialogs[dialogs.length - 1];
    };
    check('a FolderView Plus import says how many folders came in',
        await plusImport({ success: true, report }) === 'success: 2 folders imported.');
    check('and warns, with the reason, when the start order could not then be updated',
        await plusImport({ success: true, report, warning: 'the autostart file could not be written' })
        === 'warning: 2 folders imported.\nSaved, but the Docker start order could not be updated: the autostart file could not be written');

    // fetch callers (csstool.js) get such an answer as the 403 Unraid 7.4 gives; every other answer comes back untouched
    const fetched = async (status, body, headers) => {
        const resp = new Response(status === 204 ? null : body, { status, headers });
        const out = await rule.w.fv3FetchAnswer(resp);
        return { same: out === resp, ok: out.ok, status: out.status, bodyUnread: !resp.bodyUsed, text: await out.text() };
    };
    const droppedFetch = [await fetched(200, ''), await fetched(204, ''), await fetched(200, LOGIN), await fetched(200, 'ok'), await fetched(403, '{"error":"wrong csrf_token"}')];
    check('fv3FetchAnswer: an empty 200 or 204, the login page, text that is not JSON and Unraid 7.4\'s csrf 403 become a 403 with the reason',
        droppedFetch.every((o) => !o.same && !o.ok && o.status === 403 && o.text === JSON.stringify({ error: REASON })), droppedFetch);
    const kept = [[200, '{"success":true}', OURS], [200, '{"success":true}', {}], [200, '', OURS], [200, WARNED, OURS], [200, '[]', {}], [400, '', {}],
        [403, '', OURS], [403, '{"error":"Could not rename: a"}', {}], [500, '<html>oops</html>', {}]];
    const keptOut = await Promise.all(kept.map(([status, body, headers]) => fetched(status, body, headers)));
    check('fv3FetchAnswer: an answer with the plugin\'s header, a JSON body, or any other failure is the same Response, its body still unread',
        keptOut.every((o, i) => o.same && o.bodyUnread && o.status === kept[i][0] && o.text === kept[i][1]), keptOut);

    check('no script errors on the settings page', page.errors.length === 0, page.errors);
    done();
})();
