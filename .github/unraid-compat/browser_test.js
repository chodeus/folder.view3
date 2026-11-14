// FV3's pages in Chromium and Firefox on the fake Unraid browser_test.sh started, every theme and width; a screenshot per view.
// Usage: node browser_test.js <unraid-version> <screenshot-dir> <the fake's csrf token>
'use strict';
const fs = require('fs');
const { chromium, firefox } = require('playwright-core');

const [version, shots, fakeToken] = process.argv.slice(2);
const base = 'http://127.0.0.1';
const failures = [];
let checks = 0;
const check = (ok, what) => { checks++; if (!ok) failures.push(what); return ok; };
const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);

const MEDIA = 'MediaAbCdEfGhIjKlMnO';
const LAB = 'LabFoldAbCdEfGhIjKlM';
const THEMES = ['black', 'white', 'azure', 'gray'];
const SIZES = [[1440, 900], [768, 1024], [400, 860]];

// Unraid's services the fake does not run. A failed request, or a console error naming one, passes only on its path here.
const ABSENT = [
    [/^\/sub\//, "Unraid's nchan push channels: the fake runs no nchan, so the page's live updates never connect"],
    [/^\/graphql$/, "the Unraid API: the fake has none, so FV3's fv3DetectApi takes the PHP path"],
];
const absent = (url) => { try { const path = new URL(url).pathname; return ABSENT.some(([re]) => re.test(path)); } catch { return false; } };
// Chromium refuses every unload handler: Unraid's dynamix.js adds some, and on 7.0 the Docker and Dashboard pages' inline
// scripts too. From those sources the refusal is Unraid's, while FV3's shipped files add none
const plugin = `${__dirname}/../../src/folder.view3/usr/local/emhttp/plugins/folder.view3`;
const fv3Unload = fs.readdirSync(plugin, { recursive: true }).filter((f) => /\.(js|page|php)$/.test(f))
    .filter((f) => /(?<!before)unload\b/.test(fs.readFileSync(`${plugin}/${f}`, 'utf8')));
const unraidUnload = (m, page) => {
    if (fv3Unload.length || m.text() !== 'Permissions policy violation: unload is not allowed in this document.') return false;
    try { return ['/webGui/javascript/dynamix.js', `/${page}`].includes(new URL(m.location()?.url).pathname); } catch { return false; }
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

// What fake_unraid.sh saved: Media holds app-a by hand and app-b by its label, Tools takes tool-c by regex, app-d is loose, Lab
// holds Debian 12; each list in Unraid's saved order
const WANT = {
    Docker: { shut: ['Media [app-a, app-b]', 'Tools [tool-c]', 'app-d'], open: ['Media [app-a, app-b]', 'app-a', 'app-b', 'Tools [tool-c]', 'app-d'] },
    VMs: {
        shut: { rows: ['Lab [Debian 12]', 'Home Assistant', 'Windows 11'], details: '3 of 3 detail rows after their VM' },
        open: { rows: ['Lab [Debian 12]', 'Debian 12', 'Home Assistant', 'Windows 11'], details: '3 of 3 detail rows after their VM' },
    },
    Dashboard: {
        shut: { docker: ['Media [app-a, app-b] shows []', 'Tools [tool-c] shows []', 'app-d'], vms: ['Lab [Debian 12] shows []', 'Home Assistant', 'Windows 11'] },
        open: { docker: ['Media [app-a, app-b] shows [app-a, app-b]', 'Tools [tool-c] shows []', 'app-d'], vms: ['Lab [Debian 12] shows []', 'Home Assistant', 'Windows 11'] },
    },
};
// FV3's events for a finished draw; the folder each page opens, its event when open, and how a user opens it
const DRAWN = { Docker: ['docker-post-folders-creation'], VMs: ['vm-post-folders-creation'], Dashboard: ['docker-post-folders-creation', 'vm-post-folders-creation'] };
const OPEN = {
    Docker: ['Media', 'docker-post-folder-expansion', (p) => p.click(`button.dropDown-${MEDIA}`)],
    VMs: ['Lab', 'vm-post-folder-expansion', (p) => p.click(`button.dropDown-${LAB}`)],
    // The Dashboard opens a folder from its tile's menu; this is the call that menu entry makes (dashboard.js, its Expand item)
    Dashboard: ['Media', 'docker-post-folder-expansion', (p) => p.evaluate((id) => expandFolderDocker(id), MEDIA)],
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
    const seen = (el) => getComputedStyle(el).visibility !== 'hidden'
        && (el.getClientRects().length > 0 || (getComputedStyle(el).display === 'contents' && [...el.children].some(seen)));
    const name = (outer) => {
        const before = [];
        for (const node of outer.querySelector('.inner').childNodes) { if (node.nodeName === 'BR') break; before.push(node.textContent); }
        return before.join('').trim();
    };
    const tableRows = (list, nameCell) => [...document.querySelectorAll(`#${list} > tr`)].filter(seen).map((row) => row.classList.contains('folder')
        ? `${row.querySelector('.folder-appname').innerText.trim()} [${[...row.querySelectorAll('.folder-preview span.outer')].filter(seen).map(name).join(', ')}]`
        : name(row.querySelector(`td.${nameCell} span.outer`)));
    window.fv3Test = { events, seen, name, tableRows };
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

async function view(browser, kind, theme, [width, height], page) {
    const where = `${kind} ${theme} ${width}px ${page}`;
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addInitScript(testHelpers);
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
    tab.on('console', (m) => {
        if (m.type() !== 'error') return;
        const urls = [m.location()?.url, ...(m.text().match(/\b(?:https?|wss?):\/\/[^\s'"]+/g) || [])].filter(Boolean);
        if (!urls.some(absent) && !unraidUnload(m, page)) errors.push(`console error: ${m.text()} (${m.location()?.url || 'no source'})`);
    });
    tab.on('response', (r) => { if (r.status() >= 400 && !absent(r.url())) errors.push(`${r.status()} for ${r.url()}`); });
    tab.on('requestfailed', (r) => { if (!absent(r.url())) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
    const file = `${shots}/${kind}/${theme}-${width}-${page}`;
    try {
        await tab.goto(`${base}/${page}`);
        check(await tab.evaluate((t) => [...document.querySelectorAll('link[rel=stylesheet]')]
            .some((l) => new RegExp(`/webGui/styles/(?:themes/|default-)${t}\\.css`).test(l.getAttribute('href'))), theme), `${where}: the ${theme} theme's stylesheet is not on the page`);
        await waitEvents(tab, DRAWN[page]).catch(() => { throw new Error(`FV3 did not finish drawing within 20 s (${DRAWN[page].join(', ')})`); });
        let got = await settled(tab, READ[page]);
        check(same(got, WANT[page].shut), `${where}: drawn as ${JSON.stringify(got)}, not ${JSON.stringify(WANT[page].shut)}`);
        const [folder, opened, open] = OPEN[page];
        await open(tab);
        await waitEvents(tab, [opened]).catch(() => { throw new Error(`${folder} did not open within 20 s (${opened})`); });
        got = await settled(tab, READ[page]);
        check(same(got, WANT[page].open), `${where}: with ${folder} open, drawn as ${JSON.stringify(got)}, not ${JSON.stringify(WANT[page].open)}`);
        await tab.screenshot({ path: `${file}.png`, fullPage: true });
        if (PREVIEW[page]) {
            await tab.locator(PREVIEW[page]).first().click();
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
        check(!(await tab.locator('.fv3-banner').count()), `${where}: FV3 shows a banner: ${await tab.locator('.fv3-banner').allInnerTexts()}`);
    } catch (e) {
        check(false, `${where}: ${e.message.split('\n')[0]}`);
        await tab.screenshot({ path: `${file}-failed.png`, fullPage: true }).catch(() => {});
    }
    check(!errors.length, `${where}:\n    ${[...new Set(errors)].join('\n    ')}`);
    await context.close();
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
    await tab.goto(`${base}/Docker`);
    // The token of the fake browser_test.sh started, so these writes never reach any other server on this loopback
    const token = await tab.evaluate(() => typeof csrf_token === 'string' ? csrf_token : '');
    if (token !== fakeToken) { console.error(`127.0.0.1 is not the fake Unraid browser_test.sh started (token "${token}")`); process.exit(2); }
    // Media as fake_unraid.sh saved it, with the advanced preview on
    const saved = await setup.request.get(`${base}/plugins/folder.view3/server/read.php?type=docker`);
    const media = saved.ok() ? (await saved.json())[MEDIA] : undefined;
    if (!media) throw new Error(`no Media folder to turn the advanced preview on: status ${saved.status()}`);
    await post(setup.request, '/plugins/folder.view3/server/update.php', { type: 'docker', id: MEDIA, csrf_token: token,
        content: JSON.stringify({ ...media, settings: { ...media.settings, context: 2 } }) }, "Media's advanced preview");
    await post(setup.request, '/plugins/folder.view3/server/update_settings.php', { key: 'dashboard_context', value: '2', csrf_token: token }, "the Dashboard's advanced preview");
    for (const theme of THEMES) {
        // As Unraid's Display Settings saves it
        await post(setup.request, '/update.php', { '#file': 'dynamix/dynamix.cfg', '#section': 'display', theme, csrf_token: token }, `the ${theme} theme`);
        for (const [kind, browser] of Object.entries(browsers)) {
            fs.mkdirSync(`${shots}/${kind}`, { recursive: true });
            for (const size of SIZES) for (const page of ['Docker', 'VMs', 'Dashboard']) await view(browser, kind, theme, size, page);
        }
    }
    await setup.close();
    for (const browser of Object.values(browsers)) await browser.close();
    if (failures.length) {
        console.log(`FAILED [Unraid ${version}]: ${failures.length} of ${checks} browser checks\n- ${failures.join('\n- ')}`);
        process.exit(1);
    }
    console.log(`Unraid ${version}: FV3's pages in Chromium and Firefox, ${THEMES.length} themes at ${SIZES.length} widths, passed (${checks} checks)`);
})().catch((e) => { console.log(`FAILED [Unraid ${version}]: ${e.message}`); process.exit(1); });
