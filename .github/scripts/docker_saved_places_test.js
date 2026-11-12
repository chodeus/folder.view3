// node .github/scripts/docker_saved_places_test.js — a deleted folder or removed container still named in userprefs.cfg no longer
// moves a saved folder on the Docker page (npm ci in this folder first)
'use strict';
const { drawDocker, check, done } = require('./preview_pages_harness.js');

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
    done();
})();
