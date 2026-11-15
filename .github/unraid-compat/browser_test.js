// FV3's pages in Chromium and Firefox on the fake Unraid browser_test.sh started, 4 themes at 3 widths, screenshots kept.
// Usage: node browser_test.js <unraid-version> <screenshot-dir> <the fake's csrf token>
'use strict';
const fs = require('fs');
const { chromium, firefox } = require('playwright-core');

const [version, shots, fakeToken] = process.argv.slice(2);
const base = 'http://127.0.0.1';
const failures = [];
let checks = 0;
// Each failure prints as it happens, so a run the step's time limit kills still shows what failed
const check = (ok, what) => { checks++; if (!ok) { failures.push(what); console.log(`- ${what}`); } return ok; };
const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);

const MEDIA = 'MediaAbCdEfGhIjKlMnO';
const LAB = 'LabFoldAbCdEfGhIjKlM';
const SPARE = 'Spare & <b>';
const THEMES = ['black', 'white', 'azure', 'gray'];
const SIZES = [[1440, 900], [768, 1024], [400, 860]];

// Unraid's services the fake does not run. A failed request, or a console error naming one, passes only on its path here.
const ABSENT = [
    [/^\/sub\//, "Unraid's nchan push channels: the fake runs no nchan, so the page's live updates never connect"],
    [/^\/graphql$/, "the Unraid API: the fake has none, so FV3's fv3DetectApi takes the PHP path"],
];
const pathOf = (url) => { try { return new URL(url).pathname; } catch { return ''; } };
const absent = (url) => ABSENT.some(([re]) => re.test(pathOf(url)));
// Chromium refuses every unload handler: Unraid's dynamix.js adds some, and 7.0's inline page scripts. From dynamix.js or the
// page itself the refusal is Unraid's while FV3's shipped files add none, which fv3Unload checks
const plugin = `${__dirname}/../../src/folder.view3/usr/local/emhttp/plugins/folder.view3`;
const fv3Unload = fs.readdirSync(plugin, { recursive: true }).filter((f) => /\.(js|page|php)$/.test(f))
    .filter((f) => /(?<!before)unload\b/.test(fs.readFileSync(`${plugin}/${f}`, 'utf8')));
const unraidUnload = (m, page) => {
    if (fv3Unload.length || m.text() !== 'Permissions policy violation: unload is not allowed in this document.') return false;
    return ['/webGui/javascript/dynamix.js', `/${page}`].includes(pathOf(m.location()?.url));
};
// A console error from FV3's files is never excused; elsewhere, by its source or a URL in its text (trailing punctuation dropped)
const excused = (m, page) => {
    const from = m.location()?.url || '';
    if (pathOf(from).startsWith('/plugins/folder.view3/')) return false;
    const urls = [from, ...(m.text().match(/\b(?:https?|wss?):\/\/[^\s'"]+/g) || []).map((u) => u.replace(/[.,;:)]+$/, ''))];
    return urls.some(absent) || unraidUnload(m, page);
};

// Each page's own rows, tiles and folders as the user sees them, read in the page: a folder as "name [members it shows]", a
// container or VM by its name
const READ = {
    Docker: () => window.fv3Test.tableRows('docker_list', 'ct-name'),
    VMs: () => {
        // Each VM's detail row stays right after its VM, wherever FV3 moved the pair
        const details = [...document.querySelectorAll('#kvm_list tr[child-id]')];
        const paired = details.filter((d) => d.previousElementSibling?.getAttribute('parent-id') === d.getAttribute('child-id')).length;
        return { rows: window.fv3Test.tableRows('kvm_list', 'vm-name'), details: `${paired} of ${details.length} detail rows after their VM` };
    },
    Dashboard: () => {
        const { seen, name } = window.fv3Test;
        const tiles = (view) => [...document.querySelectorAll(`tbody#${view} > tr.updated > td > *`)].filter(seen).map((tile) => {
            if (!tile.classList.contains('folder-showcase-outer')) return name(tile);
            const members = [...tile.querySelectorAll('.folder-storage > span.outer, .folder-showcase > span.outer')];
            return `${tile.querySelector('.fv3-folder-appname').innerText.trim()} [${members.map(name).join(', ')}] shows [${members.filter(seen).map(name).join(', ')}]`;
        });
        return { docker: tiles('docker_view'), vms: tiles('vm_view') };
    },
};

// fake_unraid.sh's setup in Unraid's saved order: Media holds app-a by hand and app-b by its label, Tools takes tool-c by regex,
// app-d is loose, Lab holds Debian 12. The empty folder made below is in no saved order, so FV3 draws it first
const WANT = {
    Docker: {
        shut: [`${SPARE} []`, 'Media [app-a, app-b]', 'Tools [tool-c]', 'app-d'],
        open: [`${SPARE} []`, 'Media [app-a, app-b]', 'app-a', 'app-b', 'Tools [tool-c]', 'app-d'],
    },
    VMs: {
        shut: { rows: ['Lab [Debian 12]', 'Home Assistant', 'Windows 11'], details: '3 of 3 detail rows after their VM' },
        open: { rows: ['Lab [Debian 12]', 'Debian 12', 'Home Assistant', 'Windows 11'], details: '3 of 3 detail rows after their VM' },
    },
    Dashboard: {
        shut: { docker: [`${SPARE} [] shows []`, 'Media [app-a, app-b] shows []', 'Tools [tool-c] shows []', 'app-d'], vms: ['Lab [Debian 12] shows []', 'Home Assistant', 'Windows 11'] },
        open: { docker: [`${SPARE} [] shows []`, 'Media [app-a, app-b] shows [app-a, app-b]', 'Tools [tool-c] shows []', 'app-d'], vms: ['Lab [Debian 12] shows []', 'Home Assistant', 'Windows 11'] },
    },
};
// FV3's events for a finished draw; the folder each page opens, its event when open, and how a user opens it
const DRAWN = { Docker: ['docker-post-folders-creation'], VMs: ['vm-post-folders-creation'], Dashboard: ['docker-post-folders-creation', 'vm-post-folders-creation'] };
const OPEN = {
    Docker: ['Media', 'docker-post-folder-expansion', (p) => press(p.locator(`button.dropDown-${MEDIA}`), "Media's chevron")],
    VMs: ['Lab', 'vm-post-folder-expansion', (p) => press(p.locator(`button.dropDown-${LAB}`), "Lab's chevron")],
    // The tile's menu, the item FV3's lang pack labels 'expand'
    Dashboard: ['Media', 'docker-post-folder-expansion', async (p) => {
        await press(p.locator(`#folder-id-${MEDIA}`), "Media's tile");
        await press(p.locator('ul.dropdown-context:visible li > a', { hasText: await p.evaluate(() => $.i18n('expand')) }), "its menu's Expand");
    }],
};
// The first member of Media, and where a click opens its advanced preview once Media is open
const PREVIEWED = 'app-a';
const PREVIEW = { Docker: `tr.folder-id-${MEDIA} .folder-preview span.hand[id^="folder-preview-"]`, Dashboard: `.folder-showcase-${MEDIA} > span.outer > span.hand` };

// Before the page's scripts: records FV3's draw and expansion events as they fire, and the readers' helpers. A display: contents
// element (FV3's Dashboard folders) is seen when a child is; a name is .inner's text before its first line break, drawn or not
function testHelpers() {
    const events = [];
    const dispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (event) {
        if (/-post-folders?-(creation|expansion)$/.test(event.type)) events.push(event.type);
        return dispatch.call(this, event);
    };
    // Seen: drawn, not transparent or hidden, and not clipped away by an overflow: hidden/clip ancestor (scrolling ones are reachable)
    const seen = (el) => {
        if (getComputedStyle(el).display === 'contents') return [...el.children].some(seen);
        if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
        let { left, right, top, bottom } = el.getBoundingClientRect();
        for (let a = el.parentElement; a && right > left && bottom > top; a = a.parentElement) {
            const style = getComputedStyle(a), box = a.getBoundingClientRect();
            if (/hidden|clip/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
            if (/hidden|clip/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
        }
        return right > left && bottom > top;
    };
    // Every FV3 banner shown, kept after the page removes it
    const banners = [];
    new MutationObserver((changes) => changes.forEach((c) => c.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && n.matches('.fv3-banner, :has(.fv3-banner)')) banners.push(n.textContent.trim());
    }))).observe(document, { childList: true, subtree: true });
    const name = (outer) => {
        const before = [];
        for (const node of outer.querySelector('.inner').childNodes) { if (node.nodeName === 'BR') break; before.push(node.textContent); }
        return before.join('').trim();
    };
    const tableRows = (list, nameCell) => [...document.querySelectorAll(`#${list} > tr`)].filter(seen).map((row) => row.classList.contains('folder')
        ? `${row.querySelector('.folder-appname').innerText.trim()} [${[...row.querySelectorAll('.folder-preview span.outer')].filter(seen).map(name).join(', ')}]`
        : name(row.querySelector(`td.${nameCell} span.outer`)));
    window.fv3Test = { events, seen, name, tableRows, banners };
}

// The page's reading once two in a row agree: FV3 animates an opening and Unraid may reload a list after the first draw
async function settled(page, read, arg) {
    let last = null;
    for (let i = 0; i < 40; i++) {
        const now = await page.evaluate(read, arg);
        if (last !== null && same(now, last)) return now;
        last = now;
        await page.waitForTimeout(250);
    }
    throw new Error(`still changing after 10 s: ${JSON.stringify(last)}`);
}

// Unraid's own page frame. A click it covers is dispatched to the target; any other cover fails the view
const FRAME = [
    ['#menu', "7.0's azure and gray sidebar: fixed at the left edge, it lies over the page below desktop width"],
];

// A user's click, the target scrolled to the middle first
async function press(locator, what) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
    try {
        await locator.click({ timeout: 5000 });
    } catch (e) {
        const cover = await locator.evaluate((el, frame) => {
            if (!window.fv3Test.seen(el)) return null;
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!top || el.contains(top)) return null;
            if (frame.some((selector) => top.closest(selector))) return '';
            const n = top.closest('[id], [class]') || top;
            return `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${[...n.classList].map((c) => `.${c}`).join('')}`;
        }, FRAME.map(([selector]) => selector));
        if (cover === null) throw new Error(`${what} could not be clicked: ${e.message.split('\n')[0]}`);
        if (cover) throw new Error(`${what} is covered by ${cover}`);
        await locator.dispatchEvent('click');
    }
}

const waitEvents = (page, names) => page.waitForFunction((names) => names.every((n) => window.fv3Test.events.includes(n)), names, { timeout: 20000 });

// The popup's markup is indented HTML: with each blank text node set to one space nothing may move, as it does where Unraid's
// tooltip box keeps line breaks (7.4's .tooltipster-content white-space: pre-line) and FV3 does not reset it
function popupState(name) {
    const base = [...document.querySelectorAll('.tooltipster-base')].find((b) => b.getClientRects().length && b.querySelector('.preview-outbox'));
    if (!base) return { error: 'no advanced preview open' };
    const box = base.querySelector('.preview-outbox');
    const elements = [box, ...box.querySelectorAll('*')];
    const boxes = () => elements.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.left, r.width, r.height].map(Math.round).join(','); });
    const before = boxes();
    const blanks = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode());) if (node.data.trim() === '' && node.data !== ' ') blanks.push([node, node.data]);
    blanks.forEach(([node]) => { node.data = ' '; });
    const after = boxes();
    blanks.forEach(([node, data]) => { node.data = data; });
    const moved = elements.filter((e, i) => before[i] !== after[i]);
    const r = base.getBoundingClientRect();
    return {
        named: box.innerText.includes(name),
        blanks: blanks.length,
        moved: moved.length ? `${moved.length} elements, first ${moved.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')}`).join(', ')}` : '',
        inside: r.left >= 0 && r.right <= window.innerWidth + 1 ? '' : `left ${Math.round(r.left)}, right ${Math.round(r.right)} of ${window.innerWidth}`,
    };
}

// A page whose script never yields stalls page.evaluate, which has no timeout: past this the view fails, not the step's time limit
const VIEW_LIMIT = 90000;

// One page in one browser, theme and width; false when it ended before FV3 drew
async function view(browser, kind, theme, [width, height], page) {
    const where = `${kind} ${theme} ${width}px ${page}`;
    const file = `${shots}/${kind}/${theme}-${width}-${page}`;
    const errors = [];
    let context, tab, timer, drew = false;
    try {
        context = await browser.newContext({ viewport: { width, height } });
        await context.addInitScript(testHelpers);
        tab = await context.newPage();
        tab.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
        tab.on('console', (m) => { if (m.type() === 'error' && !excused(m, page)) errors.push(`console error: ${m.text()} (${m.location()?.url || 'no source'})`); });
        tab.on('response', (r) => { if (r.status() >= 400 && !absent(r.url())) errors.push(`${r.status()} for ${r.url()}`); });
        tab.on('requestfailed', (r) => { if (!absent(r.url())) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
        await Promise.race([steps(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`the view took over ${VIEW_LIMIT / 1000} s`)), VIEW_LIMIT); })]);
    } catch (e) {
        check(false, `${where}: ${e.message.split('\n')[0]}`);
        await tab?.screenshot({ path: `${file}-failed.png`, fullPage: true, timeout: 10000 }).catch(() => {});
    } finally {
        clearTimeout(timer);
    }
    check(!errors.length, `${where}:\n    ${[...new Set(errors)].join('\n    ')}`);
    await context?.close().catch(() => {});
    return drew;

    async function steps() {
        const loaded = await tab.goto(`${base}/${page}`);
        if (loaded?.status() !== 200) throw new Error(`/${page} answered ${loaded?.status()}`);
        check(await tab.evaluate((t) => [...document.querySelectorAll('link[rel=stylesheet]')]
            .some((l) => new RegExp(`/webGui/styles/(?:themes/|default-)${t}\\.css`).test(l.getAttribute('href'))), theme), `${where}: the ${theme} theme's stylesheet is not on the page`);
        await waitEvents(tab, DRAWN[page]).catch(() => { throw new Error(`FV3 did not finish drawing within 20 s (${DRAWN[page].join(', ')})`); });
        drew = true;
        let got = await settled(tab, READ[page]);
        check(same(got, WANT[page].shut), `${where}: drawn as ${JSON.stringify(got)}, not ${JSON.stringify(WANT[page].shut)}`);
        const [folder, opened, open] = OPEN[page];
        await open(tab);
        await waitEvents(tab, [opened]).catch(() => { throw new Error(`${folder} did not open within 20 s (${opened})`); });
        got = await settled(tab, READ[page]);
        check(same(got, WANT[page].open), `${where}: with ${folder} open, drawn as ${JSON.stringify(got)}, not ${JSON.stringify(WANT[page].open)}`);
        await tab.screenshot({ path: `${file}.png`, fullPage: true });
        if (PREVIEW[page]) {
            await press(tab.locator(PREVIEW[page]).first(), `${PREVIEWED}'s preview icon`);
            await tab.waitForSelector('.tooltipster-base .preview-outbox', { state: 'visible', timeout: 10000 })
                .catch(() => { throw new Error('the advanced preview did not open within 10 s'); });
            // The popup fades in and draws its graph after it opens
            const popup = await settled(tab, popupState, PREVIEWED);
            if (popup.error) throw new Error(popup.error);
            check(popup.named, `${where}: the advanced preview is not ${PREVIEWED}'s`);
            check(!popup.moved, `${where}: the advanced preview draws its markup's line breaks: ${popup.moved} moved when ${popup.blanks} blank text nodes became one space`);
            check(!popup.inside, `${where}: the advanced preview leaves the window: ${popup.inside}`);
            await tab.screenshot({ path: `${file}-preview.png` });
        }
        const banners = await tab.evaluate(() => window.fv3Test.banners);
        check(!banners.length, `${where}: FV3 showed a banner: ${banners.join(' | ')}`);
    }
}

// A save as the page posts it; anything but a 200, or an FV3 answer without FV3's header, stops the run
async function post(request, path, form, what) {
    const r = await request.post(`${base}${path}`, { form });
    if (r.status() !== 200 || (path.includes('folder.view3') && !r.headers()['x-fv3-answer'])) throw new Error(`${what}: status ${r.status()}, ${(await r.text()).slice(0, 200)}`);
}

(async () => {
    if (!fs.existsSync('/.dockerenv') || !fakeToken) { console.error('Run browser_test.sh: this needs the fake Unraid it starts'); process.exit(2); }
    check(!fv3Unload.length, `FV3 adds an unload handler, which Chromium never runs: ${fv3Unload.join(', ')}`);
    const browsers = { chromium: await chromium.launch(), firefox: await firefox.launch() };
    const setup = await browsers.chromium.newContext();
    const tab = await setup.newPage();
    const loaded = await tab.goto(`${base}/Docker`);
    if (loaded?.status() !== 200) throw new Error(`/Docker answered ${loaded?.status()}, so the setup could not read Unraid's token`);
    // lib.sh gives every fake this token and a real Unraid never has it, so no real server on this loopback is written to
    const token = await tab.evaluate(() => typeof csrf_token === 'string' ? csrf_token : '');
    if (token !== fakeToken) { console.error(`127.0.0.1 is not the fake Unraid browser_test.sh started (token "${token}")`); process.exit(2); }
    // Media as fake_unraid.sh saved it, with the advanced preview on
    const saved = await setup.request.get(`${base}/plugins/folder.view3/server/read.php?type=docker`);
    const media = saved.ok() ? (await saved.json())[MEDIA] : undefined;
    if (!media) throw new Error(`no Media folder to turn the advanced preview on: status ${saved.status()}`);
    await post(setup.request, '/plugins/folder.view3/server/update.php', { type: 'docker', id: MEDIA, csrf_token: token,
        content: JSON.stringify({ ...media, settings: { ...media.settings, context: 2 } }) }, "Media's advanced preview");
    await post(setup.request, '/plugins/folder.view3/server/update_settings.php', { key: 'dashboard_context', value: '2', csrf_token: token }, "the Dashboard's advanced preview");
    // A folder with no members, named in characters a page must escape
    await post(setup.request, '/plugins/folder.view3/server/create.php', { type: 'docker', csrf_token: token,
        content: JSON.stringify({ name: SPARE, icon: '', regex: '', containers: [], settings: { preview: 1 }, actions: [] }) }, 'the empty folder');
    let undrawn = 0;
    for (const theme of THEMES) {
        // As Unraid's Display Settings saves it
        await post(setup.request, '/update.php', { '#file': 'dynamix/dynamix.cfg', '#section': 'display', theme, csrf_token: token }, `the ${theme} theme`);
        for (const [kind, browser] of Object.entries(browsers)) {
            fs.mkdirSync(`${shots}/${kind}`, { recursive: true });
            for (const size of SIZES) for (const page of ['Docker', 'VMs', 'Dashboard']) {
                undrawn = (await view(browser, kind, theme, size, page)) ? 0 : undrawn + 1;
                if (undrawn === 3) throw new Error('3 views in a row ended before FV3 drew, so the rest were not run');
            }
        }
    }
    await setup.close();
    for (const browser of Object.values(browsers)) await browser.close();
    if (failures.length) {
        console.log(`FAILED [Unraid ${version}]: ${failures.length} of ${checks} browser checks, each listed above`);
        process.exit(1);
    }
    console.log(`Unraid ${version}: FV3's pages in Chromium and Firefox, ${THEMES.length} themes at ${SIZES.length} widths, passed (${checks} checks)`);
})().catch((e) => {
    console.log(`FAILED [Unraid ${version}]: ${e.message.split('\n')[0]}${failures.length ? ` (after ${failures.length} failed checks, listed above)` : ''}`);
    process.exit(1);
});
