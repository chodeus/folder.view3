// node .github/scripts/preview_graph_test.js [plugin-dir] — the advanced preview's graph window helpers, run from the page source
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const attached = new Set();
const built = [];
const ctx = { console, document: { body: { contains: (el) => attached.has(el) } } };
// Records what the page passes Chart.js; the library itself is not loaded here
ctx.Chart = function Chart(canvas, config) { built.push({ canvas, config }); };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(plugin, 'scripts/advanced-preview.js'), 'utf8'), ctx, { filename: 'advanced-preview.js' });

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};

const NOW = new Date(2026, 9, 27, 9, 5, 7).getTime();
const MIN = 60 * 1000;

// Window and labels
const x = ctx.fv3GraphOptions(MIN, NOW).scales.x;
check('the x range ends a second behind now and spans the duration', x.min === NOW - 1000 - MIN && x.max === NOW - 1000, { min: x.min, max: x.max });
check('a linear axis: no time scale, so no date adapter', x.type === 'linear');
const tickValues = (duration) => {
    const xs = ctx.fv3GraphOptions(duration, NOW).scales.x;
    const scale = { min: xs.min, max: xs.max, ticks: [] };
    xs.afterBuildTicks(scale);
    return { xs, values: scale.ticks.map((t) => t.value) };
};
const spaced = (values, step) => values.every((v, i) => v % step === 0 && (i === 0 || v - values[i - 1] === step));
let tv = tickValues(MIN);
check('a minute gets a label every 10 s, on round times', spaced(tv.values, 10 * 1000) && tv.values.length === 6, tv.values.map((v) => (v - NOW) / 1000));
check('the labels stay inside the window', tv.values[0] >= tv.xs.min && tv.values[tv.values.length - 1] <= tv.xs.max);
tv = tickValues(10 * MIN);
check('ten minutes get a label every 2 min', spaced(tv.values, 120 * 1000) && tv.values.length >= 4, tv.values.length);
tv = tickValues(3000);
check('a few seconds get a label every second', spaced(tv.values, 1000) && tv.values.length >= 2, tv.values.length);
check('a label is H:mm:ss local time, as the moment format was', x.ticks.callback(NOW) === '9:05:07', x.ticks.callback(NOW));
check('the y axis starts at 0', ctx.fv3GraphOptions(MIN, NOW).scales.y.min === 0);
const title = ctx.fv3GraphOptions(MIN, NOW).plugins.tooltip.callbacks.title;
check('the tooltip title is the sample time with its date', title([{ parsed: { x: NOW } }]).includes('2026') && title([{ parsed: { x: NOW } }]).includes('05:07'), title([{ parsed: { x: NOW } }]));
check('a tooltip with no items has no title', title([]) === '');

// Building
const datasets = [{ label: 'CPU', data: [] }];
ctx.fv3GraphChart('canvas-a', datasets, MIN);
ctx.fv3GraphChart('canvas-b', datasets, MIN);
check('a graph is a line chart over the given datasets', built.length === 2 && built[0].config.type === 'line' && built[0].config.data.datasets === datasets);
check('every chart gets its own options object (Chart.js 4 freezes shared ones)', built[0].config.options !== built[1].config.options && built[0].config.options.scales.x !== built[1].config.options.scales.x);

// Scrolling
const series = (...ages) => ages.map((a) => ({ x: NOW - a * 1000, y: a }));
const cpu = series(90, 75, 62, 30, 1);
const mem = series(62, 5);
const chart = (opts = {}) => {
    const c = { canvas: {}, options: { scales: { x: {} } }, modes: [], update(mode) { if (opts.throws) throw new Error('destroyed'); c.modes.push(mode); } };
    if (!opts.detached) attached.add(c.canvas);
    return c;
};
const live = chart();
const gone = chart({ detached: true });
const broken = chart({ throws: true });
const after = chart();
ctx.fv3GraphScroll([live, gone, broken, null, after], [cpu, mem], MIN, NOW);
check('points older than the window drop, but the last one before it stays', JSON.stringify(cpu.map((p) => (NOW - p.x) / 1000)) === '[62,30,1]', cpu.map((p) => (NOW - p.x) / 1000));
check('a series with nothing out of the window keeps every point', mem.length === 2);
check('a single point is never dropped', (() => { const one = series(500); ctx.fv3GraphScroll([], [one], MIN, NOW); return one.length === 1; })());
check('a live chart gets the new window', live.options.scales.x.min === NOW - 1000 - MIN && live.options.scales.x.max === NOW - 1000, live.options.scales.x);
check('and redraws without animation', JSON.stringify(live.modes) === '["none"]', live.modes);
check('a chart no longer in the page is left alone', gone.modes.length === 0 && gone.options.scales.x.min === undefined);
check('a chart that throws does not stop the rest', JSON.stringify(after.modes) === '["none"]', after.modes);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
