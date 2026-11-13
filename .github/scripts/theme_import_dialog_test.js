// node .github/scripts/theme_import_dialog_test.js — the theme import dialog keeps its newest log line in view (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { check, done, read, scriptHelpers } = require('./preview_pages_harness.js');

const plugin = process.env.FV3_PLUGIN || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');

(async () => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(`jsdom: ${e.message}`));
    const dom = new JSDOM('<!doctype html><html><body><div id="fv3-tier-themes"><div class="fv3-theme-import">' +
        '<input id="fv3-theme-repo"><button id="fv3-theme-import-btn">Import from GitHub</button></div><div id="fv3-theme-list"></div></div></body></html>',
    { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    // script.php's inline helpers as the settings page has them (fv3I18nOr, fv3FetchAnswer), with no language pack loaded
    w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
    w.$.i18n = (key) => key;
    w.Response = Response;
    const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());
    run(scriptHelpers(read('langs/script.php')), 'script.php');
    // debug.js gives fv3SwalError; its escapeHtml comes from folderview3.js on the settings page
    const settingsJs = read('scripts/folderview3.js');
    run(settingsJs.slice(settingsJs.indexOf('const escapeHtml = '), settingsJs.indexOf('const rgbToHex = ')), 'folderview3.js');
    run(read('scripts/debug.js'), 'debug.js');
    // the text of every error dialog shown, without its debug-download button
    const errorDialogs = [];

    // Unraid's sweetalert markup. jsdom has no layout, so the log's height is its text length (it grows with every line) and
    // each scroll of it is recorded with the buttons on show at that moment; csstool.css makes the <pre> the scroll box
    const scrolls = [];
    w.swal = (o, answer) => {
        w.swal.close();
        // a confirm dialog's callback for the test to answer, and whether it was opened to stay up until closed
        w.swal.answer = answer || null;
        w.swal.stays = !!answer && o.showLoaderOnConfirm === true && o.closeOnConfirm === false;
        if (o.type === 'error') errorDialogs.push(String(o.text).replace(/<div[\s\S]*$/, '').replace(/<br>/g, '\n'));
        const el = w.document.createElement('div');
        el.dataset.kind = o.type || '';
        el.className = `sweet-alert ${o.customClass || ''}`;
        el.innerHTML = '<h2></h2><p></p><div class="sa-button-container"><button class="cancel"></button>' +
            '<div class="sa-confirm-button-container"><button class="confirm"></button><div class="la-ball-fall"></div></div></div>';
        el.querySelector('h2').innerHTML = o.title;
        el.querySelector('p').innerHTML = o.text;
        w.document.body.appendChild(el);
        const pre = el.querySelector('pre');
        if (!pre) return;
        Object.defineProperty(pre, 'scrollHeight', { get: () => pre.textContent.length });
        const shown = () => ({ ask: el.querySelectorAll('.sa-button-container > div:not(.sa-confirm-button-container) button').length, done: el.querySelector('button.confirm').style.display !== 'none' });
        Object.defineProperty(pre, 'scrollTop', { get: () => (scrolls[scrolls.length - 1] || { v: 0 }).v, set: (v) => { scrolls.push({ v, ...shown() }); } });
    };
    w.swal.close = () => { const el = w.document.querySelector('.sweet-alert'); if (el) el.remove(); };

    const posts = [];
    let warnings = [];
    // The plugin's own answers carry fv3_post_init()'s header; what Unraid sends instead does not. Each is a recipe: every fetch
    // gets a new native Response, whose body can be read once, as in a browser
    const answer = (status, text, ours) => () => new Response(text, { status, headers: ours ? { 'X-FV3-Answer': '1' } : {} });
    const json = (v) => answer(200, JSON.stringify(v), true);
    // what delete_theme.php answers: the empty 200 is a POST Unraid before 7.4 dropped (stale csrf_token), the page is its login page
    let deleted = json({ success: true });
    const droppedAnswer = answer(200, '', false);
    const loginPage = answer(200, '<!DOCTYPE html><html><body>Login</body></html>', false);
    let themes = [];
    // answers for the next delete_theme.php calls, in order, and how many there have been
    let deletes = [];
    let deleteCalls = 0;
    w.fetch = async (url, init) => {
        const u = String(url);
        if (u.startsWith('https://api.github.com/repos/demo/theme/contents/')) return json([{ type: 'file', name: 'a.css' }])();
        if (u.includes('/import_theme.php')) { posts.push(String(init && init.body)); return json({ success: true, name: 'demo-theme', entry: 'demo-theme.disabled', files: ['a.css', 'b.css'], is_update: false, warnings })(); }
        if (u.includes('/list_themes.php')) return json(themes)();
        if (u.includes('/delete_theme.php')) { deleteCalls++; return (deletes.length ? deletes.shift() : deleted)(); }
        return json({})();
    };

    new vm.Script(fs.readFileSync(path.join(plugin, 'scripts/csstool.js'), 'utf8'), { filename: 'csstool.js' }).runInContext(dom.getInternalVMContext());
    const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5)); };
    await settle();

    w.document.getElementById('fv3-theme-repo').value = 'demo/theme';
    w.document.getElementById('fv3-theme-import-btn').click();
    await settle();

    const dialog = w.document.querySelector('.sweet-alert.fv3-progress');
    check('the import ran and the dialog is open', !!dialog && posts.length === 1, { dialog: !!dialog, posts });
    const lines = dialog ? dialog.querySelector('#fv3ProgressLog').textContent : '';
    check('the log lists the files and the count', /a\.css/.test(lines) && /b\.css/.test(lines) && /2 file\(s\) downloaded/.test(lines), lines);
    // One section and three lines (two files, the count): each scrolls further, and the last of them reaches the log's full height
    const lineScrolls = scrolls.slice(0, 4);
    check('every section and line scrolls the log box to its newest line', scrolls.length >= 4 && lineScrolls[3].v === lines.length && lineScrolls.every((s, i) => !s.done && (i === 0 || s.v > lineScrolls[i - 1].v)), { scrolls, height: lines.length });
    // The Done button takes its height from the log box
    check('the log is scrolled to its end again once the Done button shows', scrolls.length === 5 && scrolls[4].done && scrolls[4].v === lines.length, { scrolls, height: lines.length });
    check('the stylesheet makes the log box the one that scrolls', /\.sweet-alert\.fv3-progress #fv3ProgressLog \{[^}]*overflow-y: auto;/.test(fs.readFileSync(path.join(plugin, 'styles/csstool.css'), 'utf8')));
    const doneBtn = dialog && dialog.querySelector('button.confirm');
    check('the dialog ends on Finished with a Done button', !!dialog && /Finished/.test(dialog.querySelector('h2').textContent) && doneBtn.textContent === 'Done' && doneBtn.style.display !== 'none',
        dialog && { title: dialog.querySelector('h2').textContent, button: doneBtn.textContent, display: doneBtn.style.display });
    if (doneBtn) doneBtn.click();
    await settle();
    check('Done closes the dialog', !w.document.querySelector('.sweet-alert'));

    // A theme with an external URL: the dialog asks Keep or Delete under the log
    scrolls.length = 0;
    warnings = [{ type: 'url(', url: 'https://example.invalid/bg.png', file: 'a.css' }];
    w.document.getElementById('fv3-theme-repo').value = 'demo/theme';
    w.document.getElementById('fv3-theme-import-btn').click();
    await settle();
    const asking = w.document.querySelector('.sweet-alert.fv3-progress');
    const ask = asking ? [...asking.querySelectorAll('.sa-button-container > div:not(.sa-confirm-button-container) button')] : [];
    const asked = asking ? asking.querySelector('#fv3ProgressLog').textContent.length : -1;
    check('the dialog asks Keep or Delete', ask.map((b) => b.textContent).join('|') === 'Delete|Keep', ask.map((b) => b.textContent));
    const last = scrolls[scrolls.length - 1] || {};
    check('the log is scrolled to its end again once the question\'s buttons show', last.ask === 2 && last.v === asked, { last, height: asked });
    if (ask[1]) ask[1].click();
    await settle();
    check('Keep ends the import on a Done button', !!asking && asking.querySelector('button.confirm').style.display !== 'none' && scrolls[scrolls.length - 1].done, scrolls[scrolls.length - 1]);
    if (asking) asking.querySelector('button.confirm').click();
    await settle();

    // The same import again, answered Delete: the log's last word comes from delete_theme.php's answer
    const importThenDelete = async (answer) => {
        deleted = answer;
        w.document.getElementById('fv3-theme-repo').value = 'demo/theme';
        w.document.getElementById('fv3-theme-import-btn').click();
        await settle();
        const open = w.document.querySelector('.sweet-alert.fv3-progress');
        const buttons = open ? [...open.querySelectorAll('.sa-button-container > div:not(.sa-confirm-button-container) button')] : [];
        if (buttons[0]) buttons[0].click();
        await settle();
        const log = open ? open.querySelector('#fv3ProgressLog').textContent : '';
        if (open) open.querySelector('button.confirm').click();
        await settle();
        return log;
    };
    const deletedLog = await importThenDelete(json({ success: true }));
    check('Delete says the theme was deleted when delete_theme.php answers', /Theme deleted\./.test(deletedLog) && !/Could not delete/.test(deletedLog), deletedLog);
    const droppedLog = await importThenDelete(droppedAnswer);
    check('Delete says the theme could not be deleted when Unraid dropped the request', /Could not delete the theme\./.test(droppedLog) && !/Theme deleted/.test(droppedLog), droppedLog);

    // Theme cards and the bulk delete bar. csstool.js draws the list again after every import, so one more import puts an imported
    // theme and a hand-made one on the page; each confirm stays open until delete_theme.php answers, then closes or gives way to the reason
    themes = [{ name: 'gh-theme', entry: 'gh-theme', isDir: true, enabled: false, files: ['a.css'], source: { repo: 'demo/theme' } },
        { name: 'own-theme', entry: 'own-theme', isDir: true, enabled: false, files: ['b.css'] }];
    await importThenDelete(json({ success: true }));
    const card = (entry) => [...w.document.querySelectorAll('#fv3-theme-list .fv3-theme-card')].find((c) => c.dataset.entry === entry);
    // Clicks `button`, answers the confirm with yes, and reports what the user is left looking at
    const confirmDelete = async (button, replies) => {
        deletes = [...replies];
        errorDialogs.length = 0;
        const before = deleteCalls;
        if (!button) return { button: false };
        w.swal.answer = null;
        w.swal.stays = false;
        button.click();
        // this click's confirm, read before it is answered: the dialog that answers it replaces both
        const { answer: reply, stays } = w.swal;
        const asked = typeof reply === 'function';
        if (asked) await reply(true);
        await settle();
        const open = w.document.querySelector('.sweet-alert');
        // `left`: what is on screen afterwards, nothing or the kind of dialog; `stays`: the confirm was opened to wait for the answer
        return { button: true, asked, stays, errors: [...errorDialogs], left: open ? open.dataset.kind : 'nothing', sent: deleteCalls - before };
    };
    const why = 'Could not delete the theme. Unraid did not accept the request. Reload the page and try again.';
    for (const [kind, entry] of [['an imported theme', 'gh-theme'], ['a hand-made theme', 'own-theme']]) {
        const gone = await confirmDelete(card(entry)?.querySelector('.fv3-theme-delete'), [json({ success: true })]);
        check(`Delete on the card of ${kind} that goes through closes the confirm and shows no error`, gone.button && gone.asked && gone.stays && gone.sent === 1 && gone.errors.length === 0 && gone.left === 'nothing', gone);
        for (const [how, reply] of [['Unraid dropped', droppedAnswer], ['got the login page back', loginPage]]) {
            const r = await confirmDelete(card(entry)?.querySelector('.fv3-theme-delete'), [reply]);
            check(`Delete on the card of ${kind} that ${how} says why, in an error dialog that stays up`, r.button && r.asked && r.errors.join('|') === why && r.left === 'error', r);
        }
    }
    const refusedDelete = await confirmDelete(card('own-theme')?.querySelector('.fv3-theme-delete'), [answer(404, '', true)]);
    check('a card\'s Delete the server refused shows its status', refusedDelete.errors.join('|') === 'Could not delete the theme. HTTP 404', refusedDelete);
    // The rule reads an answer with no header to judge it, and the page reads it again for the reason: a body can be read once
    const unmarked = await confirmDelete(card('own-theme')?.querySelector('.fv3-theme-delete'), [answer(500, '{"error":"The theme folder could not be removed"}', false)]);
    check('a refusal whose header was lost on the way still shows the server\'s own reason',
        unmarked.errors.join('|') === 'Could not delete the theme. The theme folder could not be removed', unmarked);

    // Delete Selected: both boxes ticked, as the list's own change handler enables the button
    const tickAll = () => {
        for (const box of w.document.querySelectorAll('#fv3-theme-list .fv3-theme-select')) { box.checked = true; box.dispatchEvent(new w.Event('change', { bubbles: true })); }
        return w.document.querySelector('#fv3-theme-list .fv3-theme-delete-selected');
    };
    const bulkGone = await confirmDelete(tickAll(), [json({ success: true }), json({ success: true })]);
    check('Delete Selected that goes through deletes both, closes the confirm and shows no error', bulkGone.button && bulkGone.asked && bulkGone.stays && bulkGone.sent === 2 && bulkGone.errors.length === 0 && bulkGone.left === 'nothing', bulkGone);
    const bulkDropped = await confirmDelete(tickAll(), [droppedAnswer, json({ success: true })]);
    check('Delete Selected stops at the first one Unraid dropped and says why once, in an error dialog that stays up', bulkDropped.sent === 1 && bulkDropped.errors.join('|') === why && bulkDropped.left === 'error', bulkDropped);
    check('no page errors', errors.length === 0, errors);
    done();
})();
