// node .github/scripts/empty_pages_test.js — the Docker, VMs and Dashboard pages on a server with nothing to show: no containers, no VMs,
// fresh or with folders saved from before. The shipped scripts build each with no error, banner or dialog (npm ci in this folder first)
'use strict';
const { makePage, drawDocker, check, done } = require('./preview_pages_harness.js');

const folder = (name, containers, regex) => ({ name, icon: '', regex, containers, settings: {}, hidden_preview: [], actions: [] });
const SAVED = { abc: folder('Media', ['gone-app'], ''), rex: folder('Regex', [], '^app') };

// Everything a user could see go wrong: script errors, banners (the shipped fv3ShowBanner still runs), dialogs
const watch = (p) => {
    const banners = [];
    const dialogs = [];
    const show = p.w.fv3ShowBanner;
    p.w.fv3ShowBanner = (text, level) => { banners.push(text); return show(text, level); };
    p.w.swal = (o) => dialogs.push(typeof o === 'string' ? o : `${o.title}: ${o.text}`);
    return () => ({ errors: p.errors, banners, dialogs });
};
const quiet = (r) => r.built && r.errors.length === 0 && r.banners.length === 0 && r.dialogs.length === 0;
// createFolders() as the page's own loadlist patch triggers it, run to its end
const build = async (p, start) => {
    let built = false;
    start().then(() => { built = true; }, (e) => p.errors.push(`createFolders: ${e && e.stack || e}`));
    for (let i = 0; i < 50 && !built && !p.errors.length; i++) await p.tick(100);
    return built;
};

(async () => {
    for (const [label, setup] of [
        ['no containers and no folders', { folders: {}, containers: [], prefs: [] }],
        ['no containers, folders saved from before, old entries in userprefs.cfg', { folders: SAVED, containers: [], prefs: ['folder-abc', 'gone-app', 'folder-rex'] }],
    ]) {
        const page = await drawDocker(setup);
        const seen = watch(page.p);
        const built = await page.draw();
        // Reset Order, then Unraid's own order save finishing: both are followed by a start-order sync
        page.p.$.cookie = () => '1';
        page.p.g('resetSorting()');
        await page.p.tick(0);
        page.p.$(page.p.w.document).trigger('ajaxComplete', [{ status: 200 }, { url: '/plugins/dynamix.docker.manager/include/UserPrefs.php', data: 'names=&index=' }]);
        await page.p.tick(0);
        const r = { built, posts: page.posts.map((x) => x.url.split('/').pop()), ...seen() };
        check(`Docker page, ${label}: built, and Reset Order and an order save sync without a word`, quiet(r) && r.posts.join() === 'UserPrefs.php,sync_order.php,sync_order.php', r);
    }

    for (const [label, folders, order] of [
        ['no VMs and no folders', {}, []],
        ['no VMs, folders saved from before, old entries in the saved order', { vvv: folder('Lab', ['gone-vm'], '') }, ['folder-vvv', 'gone-vm']],
    ]) {
        const p = await makePage({ page: 'vm', api: false, answers: {
            'read.php': () => JSON.stringify(folders), 'read_order.php': () => JSON.stringify(order), 'read_info.php': () => '{}', 'read_unraid_order.php': () => '[]',
        } });
        const seen = watch(p);
        p.g('loadlist()');
        const r = { built: await build(p, () => p.g('createFolders()')), rows: p.$('#kvm_list > tr').length, ...seen() };
        check(`VMs page, ${label}: built, with no rows`, quiet(r) && r.rows === 0, r);
    }

    for (const [label, tiles, folders] of [
        ['neither tile there (both services off)', false, {}],
        ['both tiles there and empty, no folders', true, {}],
        ['both tiles there and empty, folders saved from before', true, SAVED],
    ]) {
        const p = await makePage({ page: 'dashboard', api: false, answers: {
            'read.php': () => JSON.stringify(folders), 'read_order.php': () => '[]', 'read_info.php': () => '{}', 'read_unraid_order.php': () => '[]', 'docker_load.php': () => '',
        } });
        if (!tiles) p.$('#docker_view').remove();
        else {
            p.$('#docker_view').html('<tr class="updated"><td></td></tr>');
            p.$('.Dashboard table').after('<table><tbody id="vm_view"><tr class="updated"><td></td></tr></tbody></table>');
        }
        const seen = watch(p);
        p.g('loadlist()');
        const r = { built: await build(p, () => p.g('createFolders()')), shown: p.$('#docker_view span.outer, #vm_view span.outer').length, ...seen() };
        check(`Dashboard, ${label}: built, with nothing shown`, quiet(r) && r.shown === 0, r);
    }
    done();
})();
