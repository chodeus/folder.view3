// node .github/scripts/theme_import_dialog_test.js — the theme import dialog keeps its newest log line in view (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { check, done } = require('./preview_pages_harness.js');

const plugin = process.env.FV3_PLUGIN || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');

(async () => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => errors.push(`jsdom: ${e.message}`));
    const dom = new JSDOM('<!doctype html><html><body><div id="fv3-tier-themes"><div class="fv3-theme-import">' +
        '<input id="fv3-theme-repo"><button id="fv3-theme-import-btn">Import from GitHub</button></div></div></body></html>',
    { url: 'http://tower.local/Settings/FolderView3', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
    const w = dom.window;
    w.fv3I18nOr = (key, fallback, ...args) => args.reduce((s, a, i) => s.replace(`$${i + 1}`, a), fallback);
    w.fv3SwalError = (text) => errors.push(`swal error: ${text}`);

    // Unraid's sweetalert markup. jsdom has no layout, so the log's height is its text length (it grows with every line) and
    // each scroll of it is recorded; csstool.css makes the <pre> the scroll box (overflow-y on #fv3ProgressLog)
    const scrolls = [];
    w.swal = (o) => {
        w.swal.close();
        const el = w.document.createElement('div');
        el.className = `sweet-alert ${o.customClass || ''}`;
        el.innerHTML = '<h2></h2><p></p><div class="sa-button-container"><button class="cancel"></button>' +
            '<div class="sa-confirm-button-container"><button class="confirm"></button><div class="la-ball-fall"></div></div></div>';
        el.querySelector('h2').innerHTML = o.title;
        el.querySelector('p').innerHTML = o.text;
        w.document.body.appendChild(el);
        const pre = el.querySelector('pre');
        Object.defineProperty(pre, 'scrollHeight', { get: () => pre.textContent.length });
        Object.defineProperty(pre, 'scrollTop', { get: () => scrolls[scrolls.length - 1] ?? 0, set: (v) => { scrolls.push(v); } });
    };
    w.swal.close = () => { const el = w.document.querySelector('.sweet-alert'); if (el) el.remove(); };

    const posts = [];
    const json = (v) => ({ ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v) });
    w.fetch = async (url, init) => {
        const u = String(url);
        if (u.startsWith('https://api.github.com/repos/demo/theme/contents/')) return json([{ type: 'file', name: 'a.css' }]);
        if (u.includes('/import_theme.php')) { posts.push(String(init && init.body)); return json({ success: true, name: 'demo-theme', entry: 'demo-theme.disabled', files: ['a.css', 'b.css'], is_update: false }); }
        if (u.includes('/list_themes.php')) return json([]);
        return json({});
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
    // One section and three lines (two files, the count): each scrolls, and the last scroll is the log's full height
    check('every section and line scrolls the log box to its newest line', scrolls.length === 4 && scrolls[3] === lines.length && scrolls.every((v, i) => i === 0 || v > scrolls[i - 1]), { scrolls, height: lines.length });
    check('the stylesheet makes the log box the one that scrolls', /\.sweet-alert\.fv3-progress #fv3ProgressLog \{[^}]*overflow-y: auto;/.test(fs.readFileSync(path.join(plugin, 'styles/csstool.css'), 'utf8')));
    const doneBtn = dialog && dialog.querySelector('button.confirm');
    check('the dialog ends on Finished with a Done button', !!dialog && /Finished/.test(dialog.querySelector('h2').textContent) && doneBtn.textContent === 'Done' && doneBtn.style.display !== 'none',
        dialog && { title: dialog.querySelector('h2').textContent, button: doneBtn.textContent, display: doneBtn.style.display });
    if (doneBtn) doneBtn.click();
    await settle();
    check('Done closes the dialog', !w.document.querySelector('.sweet-alert'));
    check('no page errors', errors.length === 0, errors);
    done();
})();
