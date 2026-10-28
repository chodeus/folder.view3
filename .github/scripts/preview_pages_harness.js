// The Docker and Dashboard pages in jsdom: the real customEvents, debug, shared, advanced-preview and docker.js or dashboard.js, in page order.
// Stubbed: HTTP ($.get/$.ajax), fetch (/graphql), WebSocket, NchanSubscriber (Unraid's dockerload), tooltipster, timers (a manual clock).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const plugin = process.env.FV3_PLUGIN || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const read = (rel) => fs.readFileSync(path.join(plugin, rel), 'utf8');
const JQUERY = fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8');

const flush = () => new Promise((r) => setImmediate(r));

// opts: page 'dashboard'|'docker'; api true|false; graphqlHangs; unraidDivisor (Unraid's Docker page handler); decimal '.'|','; cpuPhp; answers
const makePage = async (opts = {}) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
    vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(String(e.message))) errors.push(`jsdom: ${e.message}`); });
    const body = opts.page === 'docker'
        ? '<table id="docker_containers"><tbody id="docker_list"></tbody></table>'
        : '<div class="Dashboard"><table><tbody id="docker_view"></tbody></table></div>';
    const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
        url: `http://tower.local/${opts.page === 'docker' ? 'Docker' : 'Dashboard'}`, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
    });
    const w = dom.window;
    const run = (src, filename) => new vm.Script(src, { filename }).runInContext(dom.getInternalVMContext());

    // Manual clock: every setTimeout/setInterval (jQuery Deferred's too) waits for tick()
    let now = 0; let seq = 0; const timers = new Map();
    w.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn, args }); return id; };
    w.clearTimeout = (id) => { timers.delete(id); };
    w.setInterval = (fn, ms) => { const id = ++seq; const t = { at: now + ms, fn, args: [], every: ms }; timers.set(id, t); return id; };
    w.clearInterval = (id) => { timers.delete(id); };
    const realNow = Date.now;
    w.Date.now = () => 1_700_000_000_000 + now;
    const tick = async (ms = 0) => {
        const end = now + ms;
        for (;;) {
            await flush();
            let next = null;
            for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
            if (!next) break;
            const [id, t] = next;
            now = Math.max(now, t.at);
            if (t.every) t.at = now + t.every; else timers.delete(id);
            try { t.fn(...t.args); } catch (e) { errors.push(`timer: ${e && e.stack || e}`); }
        }
        now = end;
        await flush();
    };
    const pendingTimers = (pred) => [...timers.values()].filter((t) => !pred || pred(t)).length;

    w.eval(JQUERY);
    const $ = w.$;

    // HTTP boundary: every $.get and $.ajax is recorded and answered by the test (or by a default answer)
    const gets = [];
    const answers = Object.assign({
        'read_settings.php': () => JSON.stringify({ dashboard_context: '2' }),
        'cpu.php': () => String(opts.cpuPhp ?? '20'),
    }, opts.answers || {});
    $.get = (url) => {
        const d = $.Deferred();
        const rec = { url, d, at: now };
        gets.push(rec);
        const key = Object.keys(answers).find((k) => url.includes(k));
        if (key && answers[key] !== 'manual') {
            const v = answers[key]();
            if (v instanceof Error) d.reject({ status: 500, statusText: v.message }); else d.resolve(v);
        }
        return d;
    };
    $.ajax = (o) => $.get(o.url);
    $.post = () => $.Deferred().resolve('ok');
    w.csrf_token = 'tok';
    w.fetch = async (url, init) => {
        if (String(url).includes('/graphql')) {
            // A hung /graphql: only an abort ends the request, as with the browser's fetch
            if (opts.graphqlHangs) return new Promise((_, reject) => init && init.signal && init.signal.addEventListener('abort', () => reject(new w.DOMException('aborted', 'AbortError'))));
            if (!opts.api) return { ok: false, status: 404, json: async () => ({}) };
            return { ok: true, json: async () => ({ data: { info: { os: { release: '7.3.4' }, cpu: { cores: 14, threads: 20 } } } }) };
        }
        return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    };
    const sockets = [];
    w.WebSocket = class {
        constructor(url, proto) { this.url = url; this.proto = proto; this.readyState = 0; this.sent = []; sockets.push(this); }
        send(m) { this.sent.push(m); }
        close() { this.readyState = 3; if (this.onclose) this.onclose({}); }
    };
    w.ResizeObserver = class { observe() {} disconnect() {} };
    $.i18n = (key) => key;
    $.fn.i18n = function () { return this; };
    $.fn.switchButton = function () { return this; };
    $.fn.tabs = function () { return this; };
    $.cookie = () => undefined;
    // Tooltipster: captures the options; open()/close() call the plugin's own callbacks
    const tips = [];
    $.fn.tooltipster = function (o) {
        if (typeof o === 'string') return this;
        const origin = this;
        const tip = { o, origin, el: null };
        tip.open = () => {
            tip.el = w.document.createElement('div');
            tip.el.className = 'tooltipster-base';
            w.document.body.appendChild(tip.el);
            // tooltipster's default contentCloning:false moves the one content element in on every open
            $(tip.el).append(o.content);
            const helper = { origin: origin[0], tooltip: tip.el };
            o.functionBefore && o.functionBefore({}, helper);
            o.functionReady({ reposition() {} }, helper);
        };
        tip.ready = () => o.functionReady({ reposition() {} }, { origin: origin[0], tooltip: tip.el });
        tip.close = () => {
            o.functionAfter({}, { origin: origin[0] });
            if (tip.el) { $(o.content).detach(); tip.el.remove(); }
            tip.el = null;
        };
        tips.push(tip);
        return this;
    };
    $.tooltipster = { instances: () => [] };

    // Unraid's Docker page globals (facts file): dockerload subscriber + its message handler
    const nchan = [];
    if (opts.page === 'docker') {
        w.NchanSubscriber = class {
            constructor(url) { this.url = url; this.h = {}; nchan.push(this); }
            on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); }
            addEventListener(ev, fn) { this.on(ev, fn); }
            removeEventListener(ev, fn) { this.h[ev] = (this.h[ev] || []).filter((f) => f !== fn); }
            emit(ev, msg) { for (const f of this.h[ev] || []) f(msg); }
            start() {} stop() {}
        };
        const divisor = opts.unraidDivisor ?? 20;
        const dec = opts.decimal ?? '.';
        run(`var dockerload = new NchanSubscriber('/sub/dockerload',{subscriber:'websocket'});
dockerload.on('message', function(msg){
  var data = msg.split('\\n');
  for (var i=0,row; row=data[i]; i++) {
    var id = row.split(';');
    var w1 = Math.round(Math.min(id[1].slice(0,-1)/${divisor},100)*100)/100+'%';
    $('.cpu-'+id[0]).text(w1.replace('.','${dec}'));
    $('.mem-'+id[0]).text(id[2]);
    $('#cpu-'+id[0]).css('width',w1);
  }
});`, 'DockerContainers.page');
        w.loadlist = () => {};
        w.listview = () => {};
    }

    // Plugin scripts in page order (folder.view3.*.page)
    // script.php's inline helpers (fv3JsArg … fv3SwitchLabels), without the i18n pack load
    run(read('langs/script.php').match(/^\s*window\.fv3JsArg = [\s\S]*?window\.fv3SwitchLabels = .*$/m)[0].replace(/<\?=[\s\S]*?\?>/g, JSON.stringify(opts.decimal ?? '.')), 'script.php');
    run(read('scripts/include/customEvents.js'), 'customEvents.js');
    run(read('scripts/debug.js'), 'debug.js');
    run(read('scripts/shared.js'), 'shared.js');
    // A community extension from /boot/config/plugins/folder.view3/scripts (custom.php runs right after shared.js)
    if (opts.extension) run(opts.extension, 'extension.js');
    run(read('scripts/advanced-preview.js'), 'advanced-preview.js');
    if (opts.page === 'docker') run(read('scripts/docker.js'), 'docker.js');
    else run(read('scripts/dashboard.js'), 'dashboard.js');
    await tick(0);

    const g = (expr) => run(expr, 'probe');
    const ct = (shortId, name = `app-${shortId.slice(0, 4)}`) => ({
        shortId, Id: shortId + '0'.repeat(52), ImageID: 'sha256:' + 'a'.repeat(64), shortImageId: 'aaaaaaaaaaaa', Labels: {},
        info: { Name: name, Shell: 'sh', State: { Running: true, Paused: false, Autostart: true, manager: 'dockerman' }, Config: { Image: 'repo/app:latest', Env: [] } },
    });
    // One advanced preview, attached as docker.js/dashboard.js attach it
    const attach = (c, graph = 0) => {
        const trigger = $('<span class="hand"><img class="img"></span>').appendTo(w.document.body);
        w.fv3AttachAdvancedPreview({ triggerEl: trigger, ct: c, folder: { settings: { context_trigger: 0, context_graph: graph, context_graph_time: 60 } }, id: 'f1', container_name_in_folder: c.info.Name });
        return tips[tips.length - 1];
    };
    // The graph's samples, read from the bus as extensions read them
    const samples = {};
    w.folderEvents.addEventListener('docker-tooltip-ready-end', (e) => { samples[e.detail.containerInfo.shortId] = e.detail.stats; });
    const cell = (tip, id) => ({
        cpu: tip.el && tip.el.querySelector(`span.fv3-cpu-${id}`).textContent,
        mem: tip.el && tip.el.querySelector(`span.fv3-mem-${id}`).textContent,
        bar: tip.el && tip.el.querySelector(`span.fv3-cpu-bar-${id}`).style.width,
    });
    return { w, $, g, run, tick, gets, sockets, nchan, tips, attach, ct, cell, samples, errors, pendingTimers, realNow };
};

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};
const done = () => { console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0); };

module.exports = { makePage, check, done, flush };
