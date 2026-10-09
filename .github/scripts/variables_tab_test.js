// node .github/scripts/variables_tab_test.js [plugin-dir] — the advanced preview's Variables tab helpers, run from the page sources
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const read = (rel) => fs.readFileSync(path.join(plugin, rel), 'utf8');
// One top-level `window.<name> = …` statement, up to the first closing line at its own indent: the rest of its file needs a page
const lift = (rel, name) => {
    const lines = read(rel).split('\n');
    const start = lines.findIndex((l) => l.trimStart().startsWith(`window.${name} = `));
    if (start < 0) throw new Error(`${rel}: window.${name} not found`);
    const indent = lines[start].match(/^\s*/)[0];
    const end = lines.findIndex((l, i) => i > start && (l === `${indent}};` || l === `${indent}});`));
    return lines.slice(start, end + 1).join('\n');
};

const gets = [];
let answer = () => Promise.resolve({ env: [] });
const warnings = [];
const ctx = { console, CSS: { escape: (s) => s }, fv3DebugWarn: (...a) => warnings.push(a), fv3FailReason: (e) => `HTTP ${e?.status}`,
    $: { i18n: (key) => key, get: (url, data) => { gets.push(data.image); return answer(); } } };
ctx.window = ctx;
vm.createContext(ctx);
for (const [rel, name] of [['scripts/include/customEvents.js', 'escapeHtml'], ['scripts/include/customEvents.js', 'fv3SafeParse'], ['scripts/debug.js', 'fv3RedactString'], ['langs/script.php', 'fv3I18nOr']]) {
    vm.runInContext(lift(rel, name), ctx);
}
vm.runInContext(read('scripts/advanced-preview.js'), ctx, { filename: 'advanced-preview.js' });

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};
const keys = (rows) => rows.map((r) => r.key);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DOTS = '••••••••';

// Grouping
const tplVars = [{ target: 'VERSION', name: 'Version', mask: false }, { target: 'APP_TOKEN', name: 'Claim token', mask: false },
    { target: 'PUID', name: 'PUID', mask: false }, { target: 'LOCKED', name: 'Locked', mask: true }];
const env = ['TZ=Etc/UTC', 'HOST_OS=Unraid', 'PUID=99', 'LOCKED=x', 'APP_TOKEN=not-a-real-token', 'VERSION=docker', 'EXTRA=1', 'PATH=/usr/bin',
    'LANG=C.UTF-8', 'NVIDIA_DRIVER_CAPABILITIES=all', 'ZERO=0', 'EMPTY=', 'BARE', 42];
const imageEnv = ['PATH=/usr/bin', 'LANG=C.UTF-8', 'NVIDIA_DRIVER_CAPABILITIES=compute,video,utility', 'VERSION=docker'];
let g = ctx.fv3EnvGroups(env, imageEnv, tplVars);
check('template variables first in template order, then the rest by name', same(keys(g.main), ['VERSION', 'APP_TOKEN', 'LOCKED', 'BARE', 'EMPTY', 'EXTRA', 'NVIDIA_DRIVER_CAPABILITIES', 'ZERO']), keys(g.main));
check('Common sits apart, in its fixed order', same(keys(g.common), ['PUID', 'TZ', 'HOST_OS']), keys(g.common));
check('only values identical to the image fold away', same(keys(g.image), ['LANG', 'PATH']), keys(g.image));
check('a template variable stays even when it equals the image value', keys(g.main).includes('VERSION'));
check('0 and empty values survive as written', g.main.find((r) => r.key === 'ZERO').value === '0' && g.main.find((r) => r.key === 'EMPTY').value === '' && g.main.find((r) => r.key === 'BARE').value === '');
check('a display name shows only when it adds something', g.main.find((r) => r.key === 'APP_TOKEN').label === 'Claim token' && g.main.find((r) => r.key === 'VERSION').label === '');
g = ctx.fv3EnvGroups(env, undefined, null);
check('without the image read nothing folds away', g.image.length === 0 && keys(g.main).includes('PATH'), keys(g.main));
check('no env at all gives empty groups', same(ctx.fv3EnvGroups(undefined, null, null), { main: [], common: [], image: [] }));

// Secrets
for (const k of ['DB_PASSWORD', 'API_KEY', 'PLEX_CLAIM', 'DISCORD_WEBHOOK', 'SECRET_KEY_BASE', 'TS_AUTHKEY', 'VPN_PASS', 'MYSQL_PWD', 'ADMIN_PW', 'PW']) check(`${k} counts as secret`, ctx.fv3EnvIsSecret(k, 'x', false));
for (const k of ['PUID', 'PATH', 'TZ', 'NVIDIA_VISIBLE_DEVICES', 'WEBUI_PORT', 'UPS_PWR', 'POWER_MODE']) check(`${k} is not secret`, !ctx.fv3EnvIsSecret(k, 'x', false));
check('credentials in a URL value count as secret', ctx.fv3EnvIsSecret('DATABASE_URL', 'postgres://user:hunter2@db/app', false));
check('the template Mask flag counts as secret', ctx.fv3EnvIsSecret('MODE', 'demo', true));
check('a secret-looking -e in Extra Parameters', ctx.fv3EnvParamsSecret('--runtime=nvidia -e API_KEY=abc'));
check('a secret name the log redaction misses, in Extra Parameters', ctx.fv3EnvParamsSecret('-e PLEX_CLAIM=claim-abc'));
check('a quoted secret --env= in Extra Parameters', ctx.fv3EnvParamsSecret('--env="DB_PASSWORD=a b"'));
for (const p of ['tunnel --no-autoupdate run --token eyJhIjoiZmFrZSJ9', '--password hunter2', '--api-key=abc', '-ePLEX_CLAIM=claim-abc']) check(`secret flag in "${p.slice(0, 24)}…"`, ctx.fv3EnvParamsSecret(p));
check('plain Extra Parameters are not secret', !ctx.fv3EnvParamsSecret('--runtime=nvidia --memory=4G --log-opt max-size=50m -e MODE=demo --no-autoupdate --privileged --cap-add=NET_ADMIN'));

// Compose and runtime rows
const compose = ctx.fv3EnvComposeRows({ 'com.docker.compose.project': 'demo', 'com.docker.compose.service': 'web',
    'com.docker.compose.project.config_files': '/srv/demo/compose.yml,/srv/demo/compose.override.yml', 'com.docker.compose.project.working_dir': '/srv/demo',
    'com.docker.compose.depends_on': 'db:service_started:false,cache:service_healthy:true' });
check('Compose rows from the labels', same(compose.map((r) => [r.key, r.values]), [['compose-project', ['demo']], ['compose-service', ['web']],
    ['compose-files', ['/srv/demo/compose.yml', '/srv/demo/compose.override.yml']], ['compose-folder', ['/srv/demo']], ['compose-depends-on', ['db', 'cache']]]), compose);
check('no Compose rows without the project label', ctx.fv3EnvComposeRows({ 'com.docker.compose.service': 'web' }).length === 0 && ctx.fv3EnvComposeRows(null).length === 0);
const runtime = ctx.fv3EnvRuntimeRows({ HostConfig: { NetworkMode: 'br0', Runtime: 'nvidia', CpusetCpus: '2,3', Privileged: true, Memory: 4294967296,
    CapAdd: ['NET_ADMIN'], RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 }, Devices: [{ PathOnHost: '/dev/dri', PathInContainer: '/dev/dri' }],
    DeviceRequests: [{ Count: -1, Capabilities: [['gpu']] }] }, NetworkSettings: { Networks: { br0: { IPAddress: '192.0.2.5' } } } });
check('runtime rows for every non-default setting', same(runtime.map((r) => [r.key, r.values]), [['runtime-network', ['br0 · 192.0.2.5']], ['runtime-gpu', ['nvidia', 'All GPUs']],
    ['runtime-cpu-pinning', ['2,3']], ['runtime-devices', ['/dev/dri']], ['runtime-privileged', ['Yes']], ['runtime-memory', ['4.00 GiB']],
    ['runtime-capabilities', ['NET_ADMIN']], ['runtime-restart', ['on-failure (3)']]]), runtime);
const plain = ctx.fv3EnvRuntimeRows({ HostConfig: { NetworkMode: 'bridge', Runtime: 'runc', Privileged: false, Memory: 0, RestartPolicy: { Name: 'no' }, CpusetCpus: '' } });
check('Docker defaults add nothing beyond the network', same(keys(plain), ['runtime-network']), plain);

// Rendering
const state = (more) => Object.assign({ revealed: new Set(), showImage: false, imageEnv: imageEnv, loading: false, incognito: false }, more);
const ct = { ImageID: 'sha256:' + 'ab'.repeat(32), Labels: {}, info: {
    Config: { Env: ['APP_TOKEN=not-a-real-token', 'MODE=<b>bold</b>', 'PUID=99', 'PATH=/usr/bin', 'EVIL<i>=1'] },
    template: { variables: [{ target: 'APP_TOKEN', name: 'Token <script>', mask: false }], extraParams: '-e API_KEY=abc123 --runtime=nvidia', postArgs: '' },
    HostConfig: { NetworkMode: 'br0', CpusetCpus: '2,3' }, NetworkSettings: { Networks: { br0: { IPAddress: '192.0.2.5' } } } } };
let html = ctx.fv3EnvPanelHtml(ct, state());
check('values, keys and names are escaped', html.includes('&lt;b&gt;bold&lt;/b&gt;') && html.includes('EVIL&lt;i&gt;') && html.includes('Token &lt;script&gt;') && !html.includes('<b>bold') && !html.includes('<script>'));
check('a masked value never reaches the page', !html.includes('not-a-real-token') && html.includes(DOTS) && html.includes('data-fv3-env-reveal="env:APP_TOKEN"'));
check('secret Extra Parameters are masked whole', !html.includes('abc123') && !html.includes('--runtime=nvidia') && html.includes('data-fv3-env-reveal="params:extra"'));
check('image defaults start folded', !html.includes('PATH') && html.includes('Show 1 image defaults'));
html = ctx.fv3EnvPanelHtml(ct, state({ revealed: new Set(['env:APP_TOKEN', 'params:extra']), showImage: true }));
check('revealing shows the value and the params', html.includes('not-a-real-token') && html.includes('-e API_KEY=abc123 --runtime=nvidia') && html.includes('fa-eye-slash'));
check('unfolding shows the image defaults', html.includes('PATH') && html.includes('Hide image defaults'));
html = ctx.fv3EnvPanelHtml(ct, state({ incognito: true, revealed: new Set(['env:APP_TOKEN', 'params:extra']) }));
check('incognito hides every value, even revealed ones', !html.includes('not-a-real-token') && !html.includes('bold') && !html.includes('>99<') && !html.includes('abc123'));
check('incognito offers nothing to reveal and hides the network', !html.includes('fv3-env-reveal') && !html.includes('192.0.2.5') && html.includes('[hidden]') && html.includes('2,3'));
check('loading shows only the loading line', ctx.fv3EnvPanelHtml(ct, state({ loading: true })) === '<div class="fv3-env-note">Loading…</div>');
const composeCt = { Labels: { 'com.docker.compose.project': 'demo', 'com.docker.compose.service': 'web' }, info: { Config: { Env: [] } } };
html = ctx.fv3EnvPanelHtml(composeCt, state());
check('a Compose container gets the Compose section and no Extra Parameters', html.includes('Compose') && html.includes('demo') && !html.includes('Extra Parameters') && html.includes('No variables set'));
check('incognito hides the Compose values', !ctx.fv3EnvPanelHtml(composeCt, state({ incognito: true })).includes('demo'));
ct.info.template.extraParams = '';
check('empty Extra Parameters read None', ctx.fv3EnvPanelHtml(ct, state()).includes('>None<'));

(async () => {
    // Image reads: one request per image, and a failure is never cached
    gets.length = 0;
    answer = () => Promise.resolve({ env: ['A=1'] });
    const first = await ctx.fv3ImageEnv('sha256:one');
    const second = await ctx.fv3ImageEnv('sha256:one');
    check('one request per image', gets.length === 1 && same(first, ['A=1']) && same(second, ['A=1']), gets);
    answer = () => Promise.reject({ status: 500 });
    const failedRead = await ctx.fv3ImageEnv('sha256:two').then(() => 'resolved', () => 'rejected');
    answer = () => Promise.resolve({ env: ['B=2'] });
    const retried = await ctx.fv3ImageEnv('sha256:two').catch(() => 'still the cached failure');
    check('a failed read is asked again next time', failedRead === 'rejected' && same(retried, ['B=2']) && gets.filter((x) => x === 'sha256:two').length === 2, [retried, gets]);
    answer = () => Promise.resolve({ error: 'nope' });
    check('a reply without an env list is a failure', await ctx.fv3ImageEnv('sha256:three').then(() => false, () => true));

    // The per-popup controller, on a stand-in panel: clicks must stop there (tooltipster closes on a click it cannot place)
    const settle = () => new Promise((r) => setTimeout(r, 0));
    const handlers = {};
    let drawn = '';
    let shownTab = 'false';
    const panel = { html(s) { drawn = s; return this; }, attr: () => shownTab, on(evt, sel, fn) { handlers[sel] = fn; return this; }, find: () => ({ trigger() {} }) };
    const tabCt = { ImageID: 'sha256:' + 'cd'.repeat(32), Labels: {}, info: { Config: { Env: ['APP_TOKEN=not-a-real-token', 'PATH=/usr/bin', 'MODE=demo'] }, HostConfig: {} } };
    let stopped = 0;
    const click = (sel, attr) => handlers[sel].call({ getAttribute: () => attr }, { preventDefault() {}, stopPropagation() { stopped++; } });
    answer = () => Promise.resolve({ env: ['PATH=/usr/bin'] });
    const tab = ctx.fv3EnvTab(tabCt);
    tab.bind(panel);
    tab.show();
    check('the first view draws the loading line', drawn.includes('Loading'));
    await settle();
    check('then the list, masked and with image defaults folded', drawn.includes(DOTS) && !drawn.includes('not-a-real-token') && !drawn.includes('/usr/bin'));
    click('.fv3-env-reveal', 'env:APP_TOKEN');
    check('a reveal click stops at the panel and shows the value', stopped === 1 && drawn.includes('not-a-real-token'), stopped);
    click('.fv3-env-more');
    check('the image-defaults toggle stops at the panel', stopped === 2 && drawn.includes('/usr/bin'), stopped);
    tab.close();
    check('closing the popup masks the value again', !drawn.includes('not-a-real-token') && drawn.includes(DOTS));
    ctx.fv3Incognito = true;
    tab.refresh();
    check('a re-open under incognito redraws every value masked', !drawn.includes('demo') && !drawn.includes('fv3-env-reveal'));
    click('.fv3-env-reveal', 'env:APP_TOKEN');
    ctx.fv3Incognito = false;
    tab.refresh();
    check('a reveal click under incognito is ignored, not saved for later', !drawn.includes('not-a-real-token') && drawn.includes(DOTS));
    drawn = '';
    shownTab = 'true';
    tab.refresh();
    check('a re-open with another tab active draws nothing', drawn === '');

    answer = () => Promise.reject({ status: 500 });
    const failing = ctx.fv3EnvTab({ ...tabCt, ImageID: 'sha256:' + 'ef'.repeat(32) });
    failing.bind(panel);
    failing.show();
    await settle();
    check('a failed image read still lists everything, unfolded', drawn.includes('/usr/bin') && !drawn.includes('Loading') && warnings.length === 1, warnings);
    answer = () => Promise.resolve({ env: ['PATH=/usr/bin'] });
    failing.show();
    await settle();
    check('and the next view asks again and folds', !drawn.includes('/usr/bin') && drawn.includes('Show 1 image defaults'));

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
