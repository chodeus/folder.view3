// node .github/scripts/incognito_test.js — incognito mode on the Docker page, through the real page scripts in jsdom (npm ci in this folder first)
'use strict';
const { makePage, check, done } = require('./preview_pages_harness.js');

// Unraid's Tailscale badge in the network cell (DockerContainers.php): 7.3 puts HTML in data-tstitle, 7.4 plain text
const V73 = "<div class='ui-tailscale-row'><span class='ui-tailscale-label'>Hostname:</span><span class='ui-tailscale-value'>demo-app</span></div>" +
    "<div class='ui-tailscale-row'><span class='ui-tailscale-label'>Addresses:</span><span class='ui-tailscale-value'>100.101.102.103</span></div>";
const V74 = 'Hostname: demo-web\nAddresses: 100.101.102.104\nURL: https://demo-web.tail0000.ts.net';
const ROW = (name) => `<tr><td class="ct-name"><span class="appname"><a>${name}</a></span></td><td class="updatecolumn"><span>up-to-date</span></td>` +
    "<td style='white-space:nowrap'><span class='docker_readmore'> none<br/><div class='TS_tooltip' style='display: inline-block;'>" +
    "<img src='/plugins/dynamix.docker.manager/images/tailscale.png' style='height: 1.23em;'> Tailscale</div></span></td></tr>";

const setup = async (opts) => {
    const p = await makePage({ page: 'docker', api: false, ...opts });
    const add = (name, title) => p.$(ROW(name)).appendTo('#docker_list').find('.TS_tooltip').attr('data-tstitle', title)[0];
    // Unraid's tooltipster: content() on a badge it initialised, a throw on one it did not (checked on 7.3.4)
    const contents = [];
    const stub = p.$.fn.tooltipster;
    p.$.fn.tooltipster = function (o, v) {
        if (o !== 'content') return stub.apply(this, arguments);
        if (!this.hasClass('tooltipstered')) throw new Error('You called Tooltipster\'s "content" method on an uninitialized element');
        contents.push([this[0], v]);
        return this;
    };
    return { p, add, contents };
};
const unhandled = [];
process.on('unhandledRejection', (r) => unhandled.push(JSON.stringify(r)));
// What Unraid's tooltipster functionBefore hands the tooltip when it opens
const opened = (p, b) => p.$(b).attr('data-tstitle');
const badgeIntact = (b) => !!b.querySelector('img') && b.textContent.trim() === 'Tailscale';

(async () => {
    {
        const { p, add, contents } = await setup();
        const b73 = add('demo-app', V73);
        const b74 = add('demo-web', V74);
        b73.classList.add('tooltipstered');

        p.g('fv3IncognitoToggle()');
        check('on: the 7.3 tooltip text is hidden', opened(p, b73) === '[hidden]', opened(p, b73));
        check('on: the 7.4 tooltip text is hidden', opened(p, b74) === '[hidden]', opened(p, b74));
        check('on: the badge keeps its icon and label', badgeIntact(b73) && badgeIntact(b74), b73.innerHTML);
        check('on: the row name is hidden', p.$(b73).closest('tr').find('.appname a').text() !== 'demo-app', p.$(b73).closest('tr').find('.appname a').text());
        check('on: an open tooltip is swapped in place, and only on a badge tooltipster set up', contents.length === 1 && contents[0][0] === b73 && contents[0][1] === '[hidden]', contents.map((c) => c[1]));

        p.g('fv3IncognitoApply()');
        check('a second pass keeps the real text stashed', b73.getAttribute('data-fv3-real-tstitle') === V73 && opened(p, b73) === '[hidden]', b73.getAttribute('data-fv3-real-tstitle'));
        // Unraid re-renders the list; the pass after folder creation reaches the new badge
        const later = add('demo-new', V74);
        p.g('fv3IncognitoApply()');
        check('a badge rendered later is hidden on the next pass', opened(p, later) === '[hidden]', opened(p, later));

        contents.length = 0;
        p.g('fv3IncognitoToggle()');
        check('off: the real text is back', opened(p, b73) === V73 && opened(p, b74) === V74 && opened(p, later) === V74, [opened(p, b73), opened(p, b74), opened(p, later)]);
        check('off: an open tooltip gets the real text back', contents.length === 1 && contents[0][0] === b73 && contents[0][1] === V73, contents.map((c) => c[1]));
        check('off: no stashed copy left', !p.w.document.querySelector('[data-fv3-real-tstitle]'));
        check('off: the badge keeps its icon and label', badgeIntact(b73) && badgeIntact(b74) && badgeIntact(later), b73.innerHTML);
        check('no page errors', p.errors.length === 0, p.errors);
    }

    // Folder data fails to load: docker.js reveals Unraid's own list, and incognito must still cover it
    {
        const { p, add } = await setup({ answers: { 'read.php': () => new Error('500') } });
        p.w.localStorage.setItem('fv3-incognito-docker', 'true');
        await p.tick(100);
        const b = add('demo-app', V74);
        p.g('loadlist(); listview()');
        await p.tick(500);
        check('failed render: the native list is revealed', p.w.document.documentElement.classList.contains('fv3-docker-ready'));
        check('failed render: the tooltip text is hidden', opened(p, b) === '[hidden]', opened(p, b));
        check('failed render: the row name is hidden', p.$(b).closest('tr').find('.appname a').text() !== 'demo-app', p.$(b).closest('tr').find('.appname a').text());
        await new Promise((r) => setTimeout(r, 0));
        check('failed render: no unhandled promise rejection', unhandled.length === 0, unhandled);
    }
    done();
// the rejection handler above would otherwise swallow a throw here and exit 0 without a verdict
})().catch((e) => { check('the test ran to the end', false, String(e && e.stack || e)); done(); });
