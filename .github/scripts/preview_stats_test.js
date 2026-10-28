// node .github/scripts/preview_stats_test.js [plugin-dir] — how live container stats become the advanced preview's CPU/MEM text, bar and graph, run from the page sources
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const read = (rel) => fs.readFileSync(path.join(plugin, rel), 'utf8');
// One top-level `window.<name> = …` statement (one line, or up to the first closing line at its own indent): the rest of shared.js needs a page
const lift = (rel, name) => {
    const lines = read(rel).split('\n');
    const start = lines.findIndex((l) => l.startsWith(`window.${name} = `));
    if (start < 0) throw new Error(`${rel}: window.${name} not found`);
    if (lines[start].trimEnd().endsWith(';')) return lines[start];
    const end = lines.findIndex((l, i) => i > start && (l === '};' || l === '});'));
    return lines.slice(start, end + 1).join('\n');
};
const ctx = { console, fv3CpuThreads: 20 };
ctx.window = ctx;
vm.createContext(ctx);
for (const name of ['fv3CpuShare', 'fv3Decimal', 'fv3StatShortId', 'fv3ParseDockerLoad']) vm.runInContext(lift('scripts/shared.js', name), ctx);
vm.runInContext(read('scripts/advanced-preview.js'), ctx, { filename: 'advanced-preview.js' });

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b) => Math.abs(a - b) < 1e-9;

// Ids as the API stream sends them: "<host>:<container>", and in each batch one carries docker stats' clear-screen codes
const HOST = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const id = (raw) => ctx.fv3StatShortId(raw);
check('a stream id keeps its container part, cut to the short id', id(`${HOST}:a0a0a0a0a0a02222222222222222222222222222222222222222222222222222`) === 'a0a0a0a0a0a0');
check('the clear-screen codes before an id are dropped whole', id(`${HOST}:\u001b[J\u001b[Hb0b0b0b0b0b01111111111111111111111111111111111111111111111111111`) === 'b0b0b0b0b0b0', id(`${HOST}:\u001b[J\u001b[Hb0b0b0b0b0b0`));
check('codes with parameters are dropped too', id('\u001b[2J\u001b[1;1Hb0b0b0b0b0b01111') === 'b0b0b0b0b0b0', id('\u001b[2J\u001b[1;1Hb0b0b0b0b0b01111'));
check('a stray control character is dropped', id('\u0000b0b0b0b0b0b01111') === 'b0b0b0b0b0b0');
check('an id without a host part is cut to the short id', id('b0b0b0b0b0b011111111') === 'b0b0b0b0b0b0');

// Lines as docker stats --no-stream writes them (Unraid's dockerload feed, docker_load.php)
const load = ctx.fv3ParseDockerLoad('b0b0b0b0b0b0;0.09%;223.2MiB / 125.6GiB\na0a0a0a0a0a0;121.48%;9.776GiB / 125.6GiB\n');
check('each line becomes an entry by short id', same(Object.keys(load), ['b0b0b0b0b0b0', 'a0a0a0a0a0a0']), Object.keys(load));
check('an entry keeps the CPU text and splits the memory', same(load['a0a0a0a0a0a0'], { cpu: '121.48%', mem: ['9.776GiB', '125.6GiB'] }), load['a0a0a0a0a0a0']);
check('no output, or docker not running, gives no entries', same(ctx.fv3ParseDockerLoad(''), {}) && same(ctx.fv3ParseDockerLoad(null), {}) && same(ctx.fv3ParseDockerLoad('Cannot connect to the Docker daemon'), {}));

// docker counts one thread as 100%, so a share of the whole CPU divides by the thread count
check('the stream\'s number is divided by the threads', near(ctx.fv3CpuShare(121.48), 6.074), ctx.fv3CpuShare(121.48));
check('docker stats text gives the same share', near(ctx.fv3CpuShare('121.48%'), 6.074), ctx.fv3CpuShare('121.48%'));
check('no reading ("--", empty, NaN) is a 0 share, never NaN', [ctx.fv3CpuShare('--'), ctx.fv3CpuShare(''), ctx.fv3CpuShare(NaN), ctx.fv3CpuShare(undefined)].every((v) => v === 0));

const ws = (shortId, cpuPercent, mem) => ({ source: 'ws', stat: { shortId, cpuPercent, mem } });
let s = ctx.fv3StatSample(ws('a0a0a0a0a0a0', 121.48, ['9.776GiB', '125.6GiB']), 'a0a0a0a0a0a0');
check('a stream sample gives the CPU share, memory % and memory text at two decimals', near(s.cpu, 6.074) && near(s.mem, 9.776 / 125.6 * 100) && s.memText === '9.78 GiB / 125.60 GiB', s);
check('a stream sample for another container is not this one\'s', ctx.fv3StatSample(ws('b0b0b0b0b0b0', 1, ['1MiB', '1GiB']), 'a0a0a0a0a0a0') === null);
s = ctx.fv3StatSample({ source: 'sse', load }, 'a0a0a0a0a0a0');
check('a docker stats batch gives the same sample as the stream', near(s.cpu, 6.074) && s.memText === '9.78 GiB / 125.60 GiB', s);
s = ctx.fv3StatSample({ source: 'sse', load }, '0123456789ab');
check('a container missing from the batch (stopped) graphs zeros and leaves the text alone', same(s, { cpu: 0, mem: 0 }), s);
s = ctx.fv3StatSample({ source: 'sse', load: ctx.fv3ParseDockerLoad('a0a0a0a0a0a0;--;-- / --\n') }, 'a0a0a0a0a0a0');
check('a reading docker has no figures for graphs zeros, never NaN', s.cpu === 0 && s.mem === 0, s);
s = ctx.fv3StatSample({ source: 'ws', stat: { shortId: 'a0a0a0a0a0a0', cpuPercent: 5, mem: ['0B', '0B'] } }, 'a0a0a0a0a0a0');
check('a 0B memory limit is a 0% memory share, never NaN', s.mem === 0, s);
check('an event without a known source is ignored', ctx.fv3StatSample({ source: 'other', load }, 'a0a0a0a0a0a0') === null && ctx.fv3StatSample(undefined, 'a0a0a0a0a0a0') === null);

// The popup's CPU text, and the bar width read back from text in any number format
check('CPU text always has two decimals, so its width holds', ctx.fv3CpuText(6.074) === '6.07%' && ctx.fv3CpuText(4.3) === '4.30%' && ctx.fv3CpuText(0) === '0.00%', [ctx.fv3CpuText(6.074), ctx.fv3CpuText(4.3), ctx.fv3CpuText(0)]);
check('CPU text is capped at 100%', ctx.fv3CpuText(150) === '100.00%');
check('a missing CPU value writes 0.00%, not NaN%', ctx.fv3CpuText(NaN) === '0.00%' && ctx.fv3CpuText(undefined) === '0.00%');
ctx.fv3DecimalPoint = ',';
check('CPU text uses Unraid\'s decimal mark', ctx.fv3CpuText(6.074) === '6,07%', ctx.fv3CpuText(6.074));
delete ctx.fv3DecimalPoint;
const bar = (t) => ctx.fv3CpuBarWidth(t);
check('a dot decimal becomes the bar width', bar('4.33%') === '4.33%');
check('a comma decimal becomes the same bar width', bar('4,33%') === '4.33%', bar('4,33%'));
check('the bar stays within 0 and 100%', bar('150%') === '100%' && bar('0%') === '0%' && bar('-1%') === '0%');
check('text that is not a number leaves the bar alone', bar('') === null && bar('—') === null);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
