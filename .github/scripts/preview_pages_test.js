// node .github/scripts/preview_pages_test.js — the advanced preview's CPU/MEM on the Docker page and the Dashboard, through the real page scripts in jsdom (npm ci in this folder first)
'use strict';
const { makePage, check, done } = require('./preview_pages_harness.js');

const A = 'a0a0a0a0a0a0';
const B = 'b0b0b0b0b0b0';
const HOST = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const LOAD = `${B};0.09%;223.2MiB / 125.6GiB\n${A};121.48%;9.776GiB / 125.6GiB\n`;
const loads = (p) => p.gets.filter((g) => g.url.includes('docker_load.php'));
const near = (a, b) => Math.abs(a - b) < 1e-6;
const next = (ws, rawId, cpu) => ws.onmessage({ data: JSON.stringify({ type: 'next', id: 'fv3-stats', payload: { data: { dockerContainerStats: { id: rawId, cpuPercent: cpu, memUsage: '9.776GiB / 125.6GiB' } } } }) });
// The container's own row, earlier in the page than the popup, as on Unraid's Docker tab
const addRow = (p, id) => p.$(`<table><tr><td><span class="cpu-${id}">0%</span><div class="usage-disk mm"><span id="cpu-${id}" style="width:0"></span><span></span></div><span class="mem-${id}">0 / 0</span></td></tr></table>`).prependTo(p.w.document.body);

(async () => {
    // Dashboard, no API: polling docker_load.php feeds the popup's text, bar and graph, only while it is open
    {
        const p = await makePage({ page: 'dashboard', api: false, answers: { 'docker_load.php': 'manual' } });
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        check('Dashboard, no API: threads read from cpu.php', p.g('fv3CpuThreads') === 20, p.g('fv3CpuThreads'));
        check('Dashboard, no API: nothing polled while no preview is open', loads(p).length === 0, loads(p).length);
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        check('Dashboard, no API: opening a preview polls once', loads(p).length === 1, loads(p).length);
        loads(p)[0].d.resolve(LOAD);
        await p.tick(0);
        const c = p.cell(tip, A);
        check('Dashboard, no API: CPU text is the share of all threads', c.cpu === '6.07%', c);
        check('Dashboard, no API: MEM text at two decimals', c.mem === '9.78 GiB / 125.60 GiB', c);
        check('Dashboard, no API: the bar follows the text', c.bar === '6.07%', c);
        const cpu = p.samples[A].CPU;
        check('Dashboard, no API: one graph sample, the same share', cpu.length === 1 && near(cpu[0].y, 121.48 / 20), cpu);
        await p.tick(1000);
        check('Dashboard, no API: the next poll a second after the answer', loads(p).length === 2, loads(p).length);
        tip.close();
        loads(p)[1].d.resolve(LOAD);
        await p.tick(5000);
        check('Dashboard, no API: polling stops once the preview closes', loads(p).length === 2, loads(p).length);
        check('Dashboard, no API: no page errors', p.errors.length === 0, p.errors);
    }

    // Overlapping opens and closes never run two polling chains
    {
        const p = await makePage({ page: 'dashboard', api: false, answers: { 'docker_load.php': () => LOAD } });
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        const ta = p.attach(p.ct(A));
        const tb = p.attach(p.ct(B));
        ta.open(); tb.open();
        await p.tick(0);
        ta.close();
        await p.tick(300);
        ta.open();
        await p.tick(0);
        tb.ready();
        await p.tick(0);
        const before = loads(p).length;
        await p.tick(10000);
        const per = loads(p).length - before;
        check('one chain: about one request a second over 10 s', per >= 9 && per <= 11, per);
        ta.close(); tb.close();
        const after = loads(p).length;
        await p.tick(5000);
        check('one chain: closing both stops polling', loads(p).length - after <= 1, loads(p).length - after);
    }

    // A preview opened before the API check settles still gets polled once it does
    {
        const p = await makePage({ page: 'dashboard', api: false, answers: { 'docker_load.php': () => LOAD } });
        p.g('fv3InitDashboardStats()');
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        check('early open: polling starts once the check says no API', loads(p).length >= 1, loads(p).length);
        tip.close();
    }

    // Dashboard with the API: the stream feeds the popup, the clear-screen id still matches, an error falls back to polling
    {
        const p = await makePage({ page: 'dashboard', api: true, answers: { 'docker_load.php': () => LOAD } });
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        check('Dashboard, API: one WebSocket opened', p.sockets.length === 1, p.sockets.length);
        const ws = p.sockets[0];
        ws.readyState = 1; ws.onopen();
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        check('Dashboard, API: no polling while the stream is up', loads(p).length === 0, loads(p).length);
        next(ws, `${HOST}:\u001b[J\u001b[H${A}1111111111111111111111111111111111111111111111111111`, 121.48);
        await p.tick(0);
        const c = p.cell(tip, A);
        check('Dashboard, API: the clear-screen id reaches its popup', c.cpu === '6.07%' && c.bar === '6.07%', c);
        ws.onerror();
        await p.tick(0);
        check('Dashboard, API: a stream error falls back to polling the open preview', loads(p).length === 1, loads(p).length);
        next(ws, `${HOST}:${A}`, 50);
        await p.tick(0);
        check('Dashboard, API: the dead stream adds no samples after the fallback', p.samples[A].CPU.every((s) => s.y !== 2.5), p.samples[A].CPU);
        tip.close();
    }

    // The subscription ending, by error or quietly, falls back to polling
    for (const [kind, msg] of [['error', { type: 'error', id: 'fv3-stats', payload: [{ message: 'Cannot query field dockerContainerStats' }] }], ['complete', { type: 'complete', id: 'fv3-stats' }]]) {
        const p = await makePage({ page: 'dashboard', api: true, answers: { 'docker_load.php': () => LOAD } });
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        const ws = p.sockets[0];
        ws.readyState = 1; ws.onopen();
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        ws.onmessage({ data: JSON.stringify(msg) });
        await p.tick(3000);
        check(`subscription ${kind}: the open preview falls back to polling`, loads(p).length >= 1, loads(p).length);
        tip.close();
    }

    // A hung /graphql times out instead of holding up stats
    {
        const p = await makePage({ page: 'dashboard', graphqlHangs: true, answers: { 'docker_load.php': () => LOAD } });
        p.g('fv3ApiAvailable = null');
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(3000);
        check('/graphql hung: nothing yet before the timeout', loads(p).length === 0, loads(p).length);
        await p.tick(2000);
        check('/graphql hung: the open preview is polled after the timeout', loads(p).length >= 1, loads(p).length);
        tip.close();
    }

    // cpu.php failing once is asked again, so the share is not divided by 1 for the page's life
    {
        let fails = 1;
        const p = await makePage({ page: 'dashboard', api: false, answers: { 'cpu.php': () => (fails-- > 0 ? new Error('boom') : '20'), 'docker_load.php': () => LOAD } });
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        check('cpu.php down: stats still start (divisor 1 for now)', p.g('fv3CpuThreads') === 1, p.g('fv3CpuThreads'));
        await p.tick(10000);
        check('cpu.php down: asked again 10 s later', p.gets.filter((g) => g.url.includes('cpu.php')).length === 2);
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        check('cpu.php down: once answered, the popup shows the real share', p.cell(tip, A).cpu === '6.07%', p.cell(tip, A));
        tip.close();
    }

    // cpu.php answering 200 with no usable count is retried, not cached as a divisor of 1
    for (const bad of ['0', 'oops', '']) {
        let first = true;
        const p = await makePage({ page: 'dashboard', api: false, answers: { 'cpu.php': () => (first ? (first = false, bad) : '20'), 'docker_load.php': () => LOAD } });
        p.g('fv3InitDashboardStats()');
        await p.tick(10000);
        const asked = p.gets.filter((g) => g.url.includes('cpu.php')).length;
        check(`cpu.php answers ${JSON.stringify(bad)}: asked again, then the real count is used`, asked === 2 && p.g('fv3CpuThreads') === 20, { asked, threads: p.g('fv3CpuThreads') });
    }

    // A failed reading (docker_load.php 503) draws nothing rather than a 0 for a running container
    {
        let fail = false;
        const p = await makePage({ page: 'dashboard', api: false, answers: { 'docker_load.php': () => (fail ? new Error('503') : LOAD) } });
        p.g('fv3InitDashboardStats()');
        await p.tick(0);
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        fail = true;
        await p.tick(3000);
        const ys = p.samples[A].CPU.map((s) => s.y);
        check('failed reading: no 0 drawn for a running container', ys.length >= 1 && !ys.includes(0), ys);
        tip.close();
    }

    // Docker page, no API: FV3 writes the popup from Unraid's feed, in the user's number format; Unraid's handler keeps to its own row
    {
        const p = await makePage({ page: 'docker', api: false, unraidDivisor: 20, decimal: ',' });
        addRow(p, A);
        await p.tick(0);
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        p.nchan[0].emit('message', LOAD);
        await p.tick(0);
        const c = p.cell(tip, A);
        check('Docker, no API: popup text in the user\'s number format', c.cpu === '6,07%', c);
        check('Docker, no API: the popup bar reads the comma text', c.bar === '6.07%', c);
        check('Docker, no API: graph sample from the same feed', p.samples[A].CPU.length === 1 && near(p.samples[A].CPU[0].y, 121.48 / 20), p.samples[A].CPU);
        check('Docker, no API: Unraid\'s handler still writes its own row', p.$(`.cpu-${A}`).text() === '6,07%' && p.$(`#cpu-${A}`)[0].style.width === '6.07%');
        check('Docker, no API: no page errors', p.errors.length === 0, p.errors);
        tip.close();
    }

    // Docker page with the API: the stream alone feeds the popup
    {
        const p = await makePage({ page: 'docker', api: true, unraidDivisor: 20 });
        addRow(p, A);
        await p.tick(0);
        const ws = p.sockets[0];
        ws.readyState = 1; ws.onopen();
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        next(ws, `${HOST}:\u001b[J\u001b[H${A}11111111`, 121.48);
        p.nchan[0].emit('message', LOAD);
        await p.tick(0);
        check('Docker, API: one graph sample per stream message (Unraid\'s feed adds none)', p.samples[A].CPU.length === 1, p.samples[A].CPU);
        check('Docker, API: text and bar from the stream', p.cell(tip, A).cpu === '6.07%' && p.cell(tip, A).bar === '6.07%', p.cell(tip, A));
        const kept = p.g("[typeof fv3CpuCores === 'undefined' ? null : fv3CpuCores, typeof cpus === 'undefined' ? null : cpus]");
        check('Docker, API: fv3CpuCores and cpus are still there for extensions', kept[0] === 14 && kept[1] === 20, kept);
        tip.close();
    }

    // Hybrid CPU (6P+8E: Unraid divides by 28, the CPU has 20 threads): the popup's text agrees with its graph, not with Unraid's row
    {
        const p = await makePage({ page: 'docker', api: false, unraidDivisor: 28, cpuPhp: '20' });
        addRow(p, A);
        await p.tick(0);
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        p.nchan[0].emit('message', LOAD);
        await p.tick(0);
        const c = p.cell(tip, A);
        const graph = p.samples[A].CPU[0].y;
        check('hybrid CPU: popup text agrees with its own graph', Math.abs(parseFloat(c.cpu) - graph) < 0.01, { text: c.cpu, graph });
        check('hybrid CPU: Unraid\'s row keeps Unraid\'s figure', p.$(`.cpu-${A}`).text() === '4.34%', p.$(`.cpu-${A}`).text());
        tip.close();
    }

    // Stats wait for cpu.php: a stream sample is never divided by 1
    {
        const p = await makePage({ page: 'docker', api: true, answers: { 'cpu.php': 'manual' } });
        addRow(p, A);
        await p.tick(0);
        check('cpu.php pending: the stream waits for the thread count', p.sockets.length === 0, p.sockets.length);
        p.gets.find((g) => g.url.includes('cpu.php')).d.resolve('20');
        await p.tick(0);
        const ws = p.sockets[0];
        ws.readyState = 1; ws.onopen();
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        next(ws, `${HOST}:${A}`, 121.48);
        await p.tick(0);
        check('cpu.php answered: the first sample is the thread share', near(p.samples[A].CPU[0].y, 121.48 / 20), p.samples[A].CPU);
        tip.close();
    }

    // A hung cpu.php times out instead of holding up stats, and is asked again
    {
        const p = await makePage({ page: 'docker', api: true, answers: { 'cpu.php': 'manual' } });
        await p.tick(9000);
        check('cpu.php hung: stats still wait before the timeout', p.sockets.length === 0, p.sockets.length);
        await p.tick(1000);
        check('cpu.php hung: stats start once it times out', p.sockets.length === 1, p.sockets.length);
        await p.tick(10000);
        check('cpu.php hung: asked again 10 s after the timeout', p.gets.filter((g) => g.url.includes('cpu.php')).length === 2);
    }

    // The stream dropping on the Docker page: Unraid's feed takes over the graph
    {
        const p = await makePage({ page: 'docker', api: true });
        addRow(p, A);
        await p.tick(0);
        const ws = p.sockets[0];
        ws.readyState = 1; ws.onopen();
        const tip = p.attach(p.ct(A));
        tip.open();
        await p.tick(0);
        ws.onerror();
        p.nchan[0].emit('message', LOAD);
        await p.tick(0);
        check('Docker, stream drop: the feed fills the graph after the fallback', p.samples[A].CPU.length === 1, p.samples[A].CPU);
        tip.close();
    }

    done();
})().catch((e) => { console.error(e); process.exit(1); });
