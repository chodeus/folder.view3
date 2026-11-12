// node .github/scripts/docker_reset_order_test.js — Reset Order on the Docker page: a failed reset shows the "could not reset" banner,
// a refused autostart sync its own banner with the reason, and the list reloads either way (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const { drawDocker, check, done } = require('./preview_pages_harness.js');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'new-folder-order.json'), 'utf8'));

// Clicks Reset Order with the given requests refused; returns the banners shown, the requests made and the list reloads
const reset = async (refused) => {
    const page = await drawDocker(fixture);
    await page.draw();
    const { p } = page;
    p.$.cookie = () => '1';
    const banners = [];
    p.w.fv3ShowBanner = (text) => banners.push(text);
    let reloads = 0;
    const loadlist = p.w.loadlist;
    p.w.loadlist = function () { reloads++; return loadlist.apply(this, arguments); };
    page.posts.length = 0;
    refused.forEach((part) => page.failing.add(part));
    p.g('resetSorting()');
    await p.tick(0);
    return { banners, urls: page.posts.map((r) => r.url.split('/').pop()), reloads, errors: p.errors };
};

(async () => {
    const ok = await reset([]);
    check('a reset that works: the order is reset, the autostart file synced, the list reloaded, no banner',
        ok.banners.length === 0 && ok.urls.join() === 'UserPrefs.php,sync_order.php' && ok.reloads === 1 && ok.errors.length === 0, ok);
    const syncRefused = await reset(['sync_order.php']);
    check('a refused autostart sync shows its own banner with the reason, not the failed-reset one, and the list still reloads',
        syncRefused.banners.join('|') === 'The order was reset, but the Docker start order could not be updated: refused by the test'
        && syncRefused.urls.join() === 'UserPrefs.php,sync_order.php' && syncRefused.reloads === 1 && syncRefused.errors.length === 0, syncRefused);
    const resetRefused = await reset(['UserPrefs.php']);
    check('a failed reset shows the banner, skips the sync, and the list still reloads',
        resetRefused.banners.join('|') === 'Could not reset the folder order. Try again.' && resetRefused.urls.join() === 'UserPrefs.php' && resetRefused.reloads === 1, resetRefused);
    done();
})();
