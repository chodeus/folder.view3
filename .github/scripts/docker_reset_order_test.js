// node .github/scripts/docker_reset_order_test.js — the start-order syncs the Docker page sends, after Reset Order and after Unraid's own
// order save or autostart toggle: a refused one shows a banner with the reason, a dropped one says to reload (npm ci in this folder first)
'use strict';
const fs = require('fs');
const path = require('path');
const { drawDocker, check, done } = require('./preview_pages_harness.js');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'new-folder-order.json'), 'utf8'));

// The Docker page with the given requests refused or dropped, and every banner the shipped fv3ShowBanner is asked for
const open = async (refused, dropped = []) => {
    const page = await drawDocker(fixture);
    await page.draw();
    const { p } = page;
    const banners = [];
    const showBanner = p.w.fv3ShowBanner;
    p.w.fv3ShowBanner = (text, level) => { banners.push(text); return showBanner(text, level); };
    page.posts.length = 0;
    refused.forEach((part) => page.failing.add(part));
    dropped.forEach((part) => page.dropped.add(part));
    // what happened since: the banners asked for and the ones on the page, the requests made, the page's errors
    // the shipped banner also logs itself to the console, which the harness keeps as an error: `clean` = nothing else was logged
    const seen = () => ({ banners, clean: p.errors.join('|') === banners.map((b) => `[FV3 ERROR] Banner: ${b}`).join('|'), drawn: p.$('.fv3-banner > span:first-child').toArray().map((el) => el.textContent), urls: page.posts.map((r) => r.url.split('/').pop()), errors: p.errors });
    return { page, p, seen };
};
// Clicks Reset Order; adds the number of list reloads
const reset = async (refused, dropped) => {
    const { p, seen } = await open(refused, dropped);
    p.$.cookie = () => '1';
    let reloads = 0;
    const loadlist = p.w.loadlist;
    p.w.loadlist = function () { reloads++; return loadlist.apply(this, arguments); };
    p.g('resetSorting()');
    await p.tick(0);
    return { ...seen(), reloads };
};
// One of Unraid's own requests finishing, which docker.js follows with a sync when it saved the order or an autostart switch
const afterUnraid = async (file, data, refused, dropped) => {
    const { p, seen } = await open(refused, dropped);
    p.$(p.w.document).trigger('ajaxComplete', [{ status: 200 }, { url: `/plugins/dynamix.docker.manager/include/${file}`, data }]);
    await p.tick(0);
    return seen();
};

(async () => {
    const ok = await reset([]);
    check('a reset that works: the order is reset, the autostart file synced, the list reloaded, no banner',
        ok.banners.length === 0 && ok.drawn.length === 0 && ok.urls.join() === 'UserPrefs.php,sync_order.php' && ok.reloads === 1 && ok.clean, ok);
    const syncRefused = await reset(['sync_order.php']);
    check('a refused autostart sync shows its own banner with the reason, not the failed-reset one, and the list still reloads',
        syncRefused.banners.join('|') === 'The order was reset, but the Docker start order could not be updated: refused by the test' && syncRefused.drawn.join('|') === syncRefused.banners.join('|')
        && syncRefused.urls.join() === 'UserPrefs.php,sync_order.php' && syncRefused.reloads === 1 && syncRefused.clean, syncRefused);
    const resetRefused = await reset(['UserPrefs.php']);
    check('a failed reset shows the banner, skips the sync, and the list still reloads',
        resetRefused.banners.join('|') === 'Could not reset the folder order. Try again.' && resetRefused.drawn.join('|') === resetRefused.banners.join('|')
        && resetRefused.urls.join() === 'UserPrefs.php' && resetRefused.reloads === 1 && resetRefused.clean, resetRefused);

    const stale = 'The Docker start order could not be updated: refused by the test';
    const toggled = await afterUnraid('UpdateConfig.php', 'action=autostart&container=o1&auto=true', []);
    check('an autostart switch is followed by a sync, with no banner when it goes through', toggled.urls.join() === 'sync_order.php' && toggled.banners.length === 0 && toggled.clean, toggled);
    const toggleRefused = await afterUnraid('UpdateConfig.php', 'action=autostart&container=o1&auto=true', ['sync_order.php']);
    check('a sync refused after an autostart switch shows a banner with the reason', toggleRefused.banners.join('|') === stale && toggleRefused.drawn.join('|') === stale && toggleRefused.clean, toggleRefused);
    const dragRefused = await afterUnraid('UserPrefs.php', 'names=o1;r2&index=0;1', ['sync_order.php']);
    check('a sync refused after an order save shows the same banner', dragRefused.banners.join('|') === stale && dragRefused.urls.join() === 'sync_order.php' && dragRefused.clean, dragRefused);
    // Unraid before 7.4 drops every request of a page with a stale csrf_token; only the plugin's own endpoint can show it
    const reload = 'Unraid did not accept the request. Reload the page and try again.';
    const syncDropped = await reset([], ['sync_order.php']);
    check('a dropped sync after Reset Order shows the reload reason and claims nothing about the reset, and the list still reloads',
        syncDropped.banners.join('|') === reload && syncDropped.drawn.join('|') === reload && syncDropped.urls.join() === 'UserPrefs.php,sync_order.php' && syncDropped.reloads === 1 && syncDropped.clean, syncDropped);
    const toggleDropped = await afterUnraid('UpdateConfig.php', 'action=autostart&container=o1&auto=true', [], ['sync_order.php']);
    check('a dropped sync after an autostart switch says to reload', toggleDropped.banners.join('|') === `The Docker start order could not be updated: ${reload}` && toggleDropped.clean, toggleDropped);
    const other = await afterUnraid('UpdateConfig.php', 'action=templates', ['sync_order.php']);
    check('another Unraid request is followed by no sync and no banner', other.urls.length === 0 && other.banners.length === 0 && other.clean, other);
    done();
})();
