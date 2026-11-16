// node .github/scripts/docker_saved_places_test.js — where the Docker page puts saved folders: stale userprefs.cfg entries do not move
// them, and the page draws the same after sync_order.php regroups the file, which it asks for once per load (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const { drawDocker, phpServer, check, done } = require('./preview_pages_harness.js');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const folder = (name, containers = [], regex = '') => ({ name, containers, regex });

(async () => {
    {
        // userprefs.cfg still names a folder that was deleted and a container that was removed, both ahead of the saved folder
        const page = await drawDocker({ folders: { f: folder('F', ['m']) }, containers: ['a', 'm'], prefs: ['folder-gone', 'ghost', 'folder-f', 'a', 'm'] });
        await page.draw();
        check('stale userprefs.cfg entries do not push a saved folder down', same(page.drawn(), ['m', 'folder-f', 'a']), page.drawn());
        check('no page errors', page.p.errors.length === 0, page.p.errors);
    }
    {
        const page = await drawDocker({ folders: { f: folder('F', ['m']), g: folder('G', ['x']) }, containers: ['a', 'm', 'x'], prefs: ['folder-f', 'm', 'a', 'folder-g', 'x'] });
        await page.draw();
        check('with nothing stale the saved places are unchanged', same(page.drawn(), ['m', 'folder-f', 'a', 'x', 'folder-g']), page.drawn());
    }
    // New setups: a page with nothing to draw, or nothing saved, must draw without an error
    for (const [what, setup] of [
        ['no containers, no folders, nothing saved', { folders: {}, containers: [], prefs: [] }],
        ['containers but no folders and nothing saved', { folders: {}, containers: ['b', 'a'], prefs: [] }],
        ['a folder whose containers are gone, on a server with none', { folders: { f: folder('F', ['gone'], '^x') }, containers: [], prefs: ['folder-f', 'gone'] }],
    ]) {
        const page = await drawDocker(setup);
        const built = await page.draw();
        check(`${what}: the page draws with no error`, built && page.p.errors.length === 0, { built, errors: page.p.errors, rows: page.rows() });
    }
    {
        // The helper as vm.js and dashboard.js call it: [rows after placing, rows not saved yet], or 'threw'
        const page = await drawDocker({ folders: {}, containers: [], prefs: [] });
        const place = (order, saved, folders) => {
            try {
                return JSON.parse(page.p.g(`JSON.stringify((() => { const o = ${JSON.stringify(order)}; const n = fv3PlaceSavedFolders(o, ${JSON.stringify(saved)}, ${JSON.stringify(folders)}, /^folder-/); return [o, n]; })())`));
            } catch (e) { return 'threw'; }
        };
        check('nothing to place, as on a server with no containers or VMs', same(place([], [], {}), [[], []]), place([], [], {}));
        check('a saved order that is not a list counts as nothing saved', same([place(['a'], null, {}), place([], {}, { f: {} })], [[['a'], ['a']], [[], []]]), [place(['a'], null, {}), place([], {}, { f: {} })]);
        check('only leftover entries saved: every row is new and none moves', same(place(['a', 'b'], ['folder-gone', 'ghost'], {}), [['a', 'b'], ['a', 'b']]), place(['a', 'b'], ['folder-gone', 'ghost'], {}));

        // With nothing stale, a folder goes where it always went: its saved index plus the number of unsaved rows
        let seed = 20261112;
        // Math.imul: a plain product passes 2^53 and loses its low bits, and every draw below would then come out 0
        const rnd = (n) => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return (seed >>> 8) % n; };
        const before = (order, saved, folders) => {
            const o = order.slice(), fresh = o.filter((x) => !saved.includes(x));
            for (let i = 0; i < saved.length; i++) if (/^folder-/.test(saved[i]) && folders[saved[i].slice(7)]) o.splice(i + fresh.length, 0, saved[i]);
            return [o, fresh];
        };
        const differ = [];
        const shapes = { folders: 0, unsaved: 0, both: 0 };
        for (let n = 0; n < 200; n++) {
            const rows = Array.from({ length: rnd(7) }, (_, i) => `c${i}`);
            const folders = Object.fromEntries(Array.from({ length: rnd(4) }, (_, i) => [`f${i}`, {}]));
            const all = rows.concat(Object.keys(folders).map((k) => `folder-${k}`));
            for (let i = all.length - 1; i > 0; i--) { const j = rnd(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
            const saved = all.filter(() => rnd(5) > 0);
            const hasFolder = saved.some((x) => x.startsWith('folder-')), hasUnsaved = rows.some((x) => !saved.includes(x));
            shapes.folders += hasFolder; shapes.unsaved += hasUnsaved; shapes.both += hasFolder && hasUnsaved;
            if (!same(place(rows, saved, folders), before(rows, saved, folders))) differ.push({ rows, saved, folders });
        }
        check('the generated orders do place folders, with and without unsaved rows above them', shapes.folders > 50 && shapes.unsaved > 50 && shapes.both > 20, shapes);
        check('200 generated orders with nothing stale place every folder where they did before', differ.length === 0, differ.slice(0, 2));
    }
    // The real sync_order.php regroups userprefs.cfg; the page drawn from the file before and after is the same
    const drawnFrom = async (folders, containers, prefs) => { const page = await drawDocker({ folders, containers, prefs }); await page.draw(); return page.drawn(); };
    for (const [what, folders, containers, prefs] of [
        ['a folder member it lacks', { f: folder('F', ['x', 'y']) }, ['a', 'b', 'x', 'y'], ['a', 'folder-f', 'x', 'b']],
        ['a member saved away from its folder', { f: folder('F', ['x', 'y']) }, ['a', 'b', 'x', 'y'], ['y', 'a', 'folder-f', 'x', 'b']],
        ['a member moved to another folder', { f: folder('F', ['x']), g: folder('G', ['w', 'y']) }, ['w', 'x', 'y'], ['folder-f', 'x', 'y', 'folder-g', 'w']],
        ['members saved before their folder', { f: folder('F', ['x', 'y']) }, ['a', 'x', 'y'], ['x', 'folder-f', 'a']],
        ['a regex folder', { r: folder('Rx', [], '^web') }, ['web1', 'web2', 'db'], ['web2', 'folder-r', 'db', 'web1']],
    ]) {
        const php = phpServer('userprefs-sync', { containers });
        try {
            const dockerMan = path.join(path.dirname(php.config), 'dockerMan');
            fs.writeFileSync(path.join(php.config, 'docker.json'), JSON.stringify(folders));
            fs.writeFileSync(path.join(dockerMan, 'dockerMan.cfg'), `autostart-file="${path.join(dockerMan, 'unraid-autostart')}"\n`);
            fs.writeFileSync(path.join(dockerMan, 'userprefs.cfg'), prefs.map((n, i) => `${i}="${n}"\n`).join(''));
            const answer = php.server('sync_order.php', 'POST', { type: 'docker' });
            const after = fs.readFileSync(path.join(dockerMan, 'userprefs.cfg'), 'utf8').split('\n').filter(Boolean).map((l) => l.replace(/^\d+="(.*)"$/, '$1'));
            const [was, now] = [await drawnFrom(folders, containers, prefs), await drawnFrom(folders, containers, after)];
            check(`${what}: the sync regroups userprefs.cfg, and the page draws the same from it`, answer === '{"success":true}' && !same(after, prefs) && same(was, now), { answer, after, was, now });
        } finally { php.cleanup(); }
    }
    {
        const syncs = (page) => page.posts.filter((r) => r.url.endsWith('/sync_order.php')).map((r) => r.data);
        const saved = { folders: { f: folder('F', ['m']) }, containers: ['a', 'm'], prefs: ['folder-f', 'a'] };
        const page = await drawDocker(saved);
        await page.draw();
        await page.draw();
        check('a page with folders and a saved order asks for one sync, not one per list rebuild', same(syncs(page), [{ type: 'docker' }]), page.posts);
        for (const [what, setup] of [['nothing saved', { ...saved, prefs: [] }], ['no folders', { ...saved, folders: {} }],
            ['no folder holds a container', { ...saved, containers: ['a'] }]]) {
            const quiet = await drawDocker(setup);
            await quiet.draw();
            check(`${what}: no sync is asked for`, syncs(quiet).length === 0, quiet.posts);
        }
        const refused = await drawDocker(saved);
        const banners = [];
        refused.p.w.fv3ShowBanner = (text) => { banners.push(text); };
        refused.failing.add('sync_order.php');
        await refused.draw();
        check('a refused sync shows the start-order banner with the reason', same(banners, ['The Docker start order could not be updated: refused by the test']), banners);
    }
    done();
})();
