// node .github/scripts/preview_graph_test.js [plugin-dir] — the advanced preview's graph window and popup aim helpers, run from the page source
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const attached = new Set();
const built = [];
let frames = [];
let nextFrame = 1;
let timers = [];
const ctx = {
    console,
    document: { body: { contains: (el) => attached.has(el) } },
    requestAnimationFrame: (cb) => { frames.push({ id: nextFrame, cb }); return nextFrame++; },
    cancelAnimationFrame: (id) => { frames = frames.filter((f) => f.id !== id); },
    setInterval: (cb) => timers.push(cb),
    clearInterval: (id) => { timers[id - 1] = null; },
};
// Stands in for Chart.js and records what the page passes it; the library itself is not loaded here
ctx.Chart = function Chart(canvas, config) {
    const chart = { canvas, config, options: config.options, modes: [], throws: false,
        update(mode) { if (chart.throws) throw new Error('destroyed'); chart.modes.push(mode); } };
    built.push(chart);
    return chart;
};
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
tv = tickValues(5000);
check('five seconds get a label every second', spaced(tv.values, 1000) && tv.values.length >= 4, tv.values.length);
check('a label is H:mm:ss local time, as the moment format was', x.ticks.callback(NOW) === '9:05:07', x.ticks.callback(NOW));
check('the y axis starts at 0', ctx.fv3GraphOptions(MIN, NOW).scales.y.min === 0);
const title = ctx.fv3GraphOptions(MIN, NOW).plugins.tooltip.callbacks.title;
const STAMP = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
check('the tooltip title is the sample date and time in the browser locale', title([{ parsed: { x: NOW } }]) === new Date(NOW).toLocaleString(undefined, STAMP), title([{ parsed: { x: NOW } }]));
check('a tooltip with no items has no title', title([]) === '');

check('an unset or zero length is a minute', ctx.fv3GraphDuration(undefined) === MIN && ctx.fv3GraphDuration(0) === MIN && ctx.fv3GraphDuration('') === MIN);
check('a stored string length is read as seconds', ctx.fv3GraphDuration('120') === 120 * 1000);
check('lengths stay within the 5–600 s the settings forms allow', ctx.fv3GraphDuration(1) === 5000 && ctx.fv3GraphDuration(7200) === 600 * 1000, [ctx.fv3GraphDuration(1), ctx.fv3GraphDuration(7200)]);

const graph = (opts = {}) => {
    const canvas = {};
    if (!opts.detached) attached.add(canvas);
    const chart = ctx.fv3GraphChart(canvas, [{ label: 'CPU', data: [] }], MIN);
    chart.throws = !!opts.throws;
    return chart;
};
const a = graph();
const b = graph();
check('a graph is a line chart over the given datasets', a.config.type === 'line' && a.config.data.datasets[0].label === 'CPU');
check('every chart gets its own options object (Chart.js 4 freezes shared ones)', a.config.options !== b.config.options && a.config.options.scales.x !== b.config.options.scales.x);

const series = (...ages) => ages.map((age) => ({ x: NOW - age * 1000, y: age }));
const cpu = series(90, 75, 62, 30, 1);
const mem = series(62, 5);
const live = graph();
const gone = graph({ detached: true });
const broken = graph({ throws: true });
const after = graph();
const foreignCanvas = {};
attached.add(foreignCanvas);
const foreign = { canvas: foreignCanvas, options: { scales: { x: { min: 1, max: 2 } } }, modes: [], update(mode) { foreign.modes.push(mode); } };
ctx.fv3GraphScroll([live, gone, broken, null, foreign, after], [cpu, mem], MIN, NOW);
check('points older than the window drop, but the last one before it stays', JSON.stringify(cpu.map((p) => (NOW - p.x) / 1000)) === '[62,30,1]', cpu.map((p) => (NOW - p.x) / 1000));
check('a series with nothing out of the window keeps every point', mem.length === 2);
check('a single point is never dropped', (() => { const one = series(500); ctx.fv3GraphScroll([], [one], MIN, NOW); return one.length === 1; })());
check('a live chart gets the new window', live.options.scales.x.min === NOW - 1000 - MIN && live.options.scales.x.max === NOW - 1000, [live.options.scales.x.min, live.options.scales.x.max]);
check('and redraws without animation', JSON.stringify(live.modes) === '["none"]', live.modes);
check('a chart no longer in the page is left alone', gone.modes.length === 0);
check('a chart that throws does not stop the rest', JSON.stringify(after.modes) === '["none"]', after.modes);
check('a chart an extension put in the array is left alone', foreign.modes.length === 0 && foreign.options.scales.x.min === 1);

frames = [];
const looped = graph();
let current = [looped];
const stop = ctx.fv3GraphLoop(() => current, [[]], MIN);
const runFrames = (from, to, every) => { for (let t = from; t <= to; t += every) { const due = frames; frames = []; for (const f of due) f.cb(t); } };
runFrames(0, 1000, 1000 / 60);
check('about 30 redraws a second at 60 frames a second', looped.modes.length >= 29 && looped.modes.length <= 31, looped.modes.length);
current = [];
const before = looped.modes.length;
runFrames(1000, 1200, 1000 / 60);
check('each frame reads the current charts array', looped.modes.length === before);
stop();
check('stop cancels the next frame', frames.length === 0, frames.length);

// A hidden tab runs no frames, and Chrome runs its timers about once a minute; a sample still arrives every second
const RealDate = vm.runInContext('Date', ctx);
let clock = NOW;
ctx.Date = class extends RealDate { static now() { return clock; } };
frames = [];
timers = [];
const hidden = graph();
const hiddenCpu = [];
const stopHidden = ctx.fv3GraphLoop(() => [hidden], [hiddenCpu], MIN);
for (let s = 1; s <= 3600; s++) {
    clock = NOW + s * 1000;
    hiddenCpu.push({ x: clock, y: 1 });
    if (s % 60 === 0) timers.forEach((cb) => cb && cb());
}
check('hidden for an hour: the samples stay about one window long', hiddenCpu.length <= 63 + 60, hiddenCpu.length);
check('hidden: the timer redraws the chart', hidden.modes.length === 60, hidden.modes.length);
runFrames(0, 0, 1);
const drawnByFrame = hidden.modes.length;
timers.forEach((cb) => cb && cb());
check('visible: the timer leaves the drawing to the frames', hidden.modes.length === drawnByFrame, hidden.modes.length - drawnByFrame);
stopHidden();
check('stop clears the timer', timers.every((cb) => cb === null), timers.length);
ctx.Date = RealDate;

ctx.innerWidth = 1440;
check('desktop: the chart fills its panel', ctx.fv3GraphOptions(MIN, NOW).maintainAspectRatio === false);
ctx.innerWidth = 390;
check('phone width: the chart keeps its shape for the accordion', ctx.fv3GraphOptions(MIN, NOW).maintainAspectRatio === true);
delete ctx.innerWidth;

// Geometry measured on the Docker tab: tooltipster's origin is the 36x17 span, the icon is 32x32 inside it
const span = { left: 702.45, top: 249.33, right: 738.45, bottom: 266.33 };
const icon = { left: 702.45, top: 243, width: 32, height: 32, right: 734.45, bottom: 275 };
const base = { left: 300, top: 300 };
const near = (a, b) => Math.abs(a - b) < 1e-6;
const aim = (side, iconBox = icon, size = { width: 700, height: 414 }, coord = base) => ctx.fv3AimAtIcon(null, {
    origin: { querySelector: (sel) => (sel === '.img' && iconBox ? { getBoundingClientRect: () => iconBox } : null) },
    geo: { origin: { windowOffset: span }, window: { size: { width: 1702, height: 806 } } },
}, { side, size, target: 720, coord: { ...coord } });
const below = aim('bottom');
check('the arrow points at the icon centre, not the span', below.target === 718, below.target);
check('the popup is centred on the icon', below.coord.left === 718 - 350, below.coord.left);
check('below: the popup starts under the icon', near(below.coord.top, base.top + icon.bottom - span.bottom), below.coord.top);
check('above: the popup ends over the icon', near(aim('top').coord.top, base.top + icon.top - span.top));
const right = aim('right');
check('beside: the arrow points at the icon middle', right.target === 259, right.target);
check('beside: the popup is centred on the icon', right.coord.top === 259 - 207, right.coord.top);
check('right: the gap starts at the icon, not its spacing', near(right.coord.left, base.left + icon.right - span.right), right.coord.left);
check('left: the popup ends at the icon edge', near(aim('left').coord.left, base.left + icon.left - span.left));
const edge = aim('bottom', { ...icon, left: 10, right: 42 });
check('the popup stops at the window edge', edge.coord.left === 0 && edge.target === 26, edge);
check('a popup wider than the window keeps tooltipster\'s place', aim('bottom', icon, { width: 2000, height: 414 }).coord.left === base.left);
check('above, at the window top: the popup stays on screen', aim('top', icon, undefined, { left: 300, top: 3 }).coord.top === 0);
check('below, at the window bottom: the popup stays on screen', aim('bottom', icon, undefined, { left: 300, top: 806 - 414 - 2 }).coord.top === 806 - 414);
check('beside, at the window edge: the popup stays on screen', aim('right', { ...icon, right: span.right + 10 }, undefined, { left: 1702 - 700 - 2, top: 300 }).coord.left === 1702 - 700);
check('a popup already past the edge still moves to the icon', near(aim('top', icon, undefined, { left: 300, top: -50 }).coord.top, -50 + icon.top - span.top));
const none = aim('bottom', null);
check('no icon: tooltipster\'s position stands', none.target === 720 && none.coord.left === base.left && none.coord.top === base.top, none);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
