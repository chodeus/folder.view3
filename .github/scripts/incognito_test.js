// node .github/scripts/incognito_test.js — incognito mode on the Docker page, through the real page scripts in jsdom (npm ci in this folder first)
'use strict';
const { makePage, check, done } = require('./preview_pages_harness.js');

// Unraid's Tailscale badge in the version cell (DockerContainers.php): 7.3 puts HTML in data-tstitle, 7.4 plain text
const V73 = "<div class='ui-tailscale-row'><span class='ui-tailscale-label'>Hostname:</span><span class='ui-tailscale-value'>demo-app</span></div>" +
    "<div class='ui-tailscale-row'><span class='ui-tailscale-label'>Addresses:</span><span class='ui-tailscale-value'>100.101.102.103</span></div>";
const V74 = 'Hostname: demo-web\nAddresses: 100.101.102.104\nURL: https://demo-web.tail0000.ts.net';
const ROW = (name) => `<tr><td class="ct-name"><span class="appname"><a>${name}</a></span></td><td class="updatecolumn"><span>up-to-date</span><br/>` +
    '<div class="TS_tooltip" style="display: inline-block;"><img src="/plugins/dynamix.docker.manager/images/tailscale.png"> Tailscale</div></td></tr>';

(async () => {
    const p = await makePage({ page: 'docker', api: false });
    const add = (name, title) => p.$(ROW(name)).appendTo('#docker_list').find('.TS_tooltip').attr('data-tstitle', title)[0];
    // What Unraid's tooltipster functionBefore hands the tooltip when it opens
    const opened = (b) => p.$(b).attr('data-tstitle');
    const badgeIntact = (b) => !!b.querySelector('img') && b.textContent.trim() === 'Tailscale';
    const b73 = add('demo-app', V73);
    const b74 = add('demo-web', V74);

    p.g('fv3IncognitoToggle()');
    check('on: the 7.3 tooltip text is hidden', opened(b73) === '[hidden]', opened(b73));
    check('on: the 7.4 tooltip text is hidden', opened(b74) === '[hidden]', opened(b74));
    check('on: the badge keeps its icon and label', badgeIntact(b73) && badgeIntact(b74), b73.innerHTML);

    p.g('fv3IncognitoApply()');
    check('a second pass keeps the real text stashed', b73.getAttribute('data-fv3-real-tstitle') === V73 && opened(b73) === '[hidden]', b73.getAttribute('data-fv3-real-tstitle'));
    // Unraid re-renders the list; the pass after folder creation reaches the new badge
    const later = add('demo-new', V74);
    p.g('fv3IncognitoApply()');
    check('a badge rendered later is hidden on the next pass', opened(later) === '[hidden]', opened(later));

    p.g('fv3IncognitoToggle()');
    check('off: the real text is back', opened(b73) === V73 && opened(b74) === V74 && opened(later) === V74, [opened(b73), opened(b74), opened(later)]);
    check('off: no stashed copy left', !p.w.document.querySelector('[data-fv3-real-tstitle]'));
    check('off: the badge keeps its icon and label', badgeIntact(b73) && badgeIntact(b74) && badgeIntact(later), b73.innerHTML);
    check('no page errors', p.errors.length === 0, p.errors);
    done();
})();
