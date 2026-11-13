// The Docker, VMs and Dashboard pages in jsdom: the real customEvents, debug, shared, advanced-preview and docker.js, vm.js or dashboard.js, in page order.
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
// script.php's inline helpers (fv3JsArg … fv3SwitchLabels) from its source, without the PHP or the i18n pack load
const scriptHelpers = (source, decimal = '.') => source.match(/^\s*window\.fv3JsArg = [\s\S]*?window\.fv3SwitchLabels = .*$/m)[0].replace(/<\?=[\s\S]*?\?>/g, JSON.stringify(decimal));

// Unraid's side of an XMLHttpRequest, for a test that runs jQuery's own ajax: route(method, url, body) gives
// { status, body, type, headers } and answers on the page's next timer, or null to never answer
const fakeXhr = (w, route) => {
    w.XMLHttpRequest = class {
        constructor() { this.onabort = null; }
        open(method, url) { this.method = method; this.url = url; }
        setRequestHeader() {}
        getAllResponseHeaders() {
            const headers = { ...(this.answer.type ? { 'Content-Type': this.answer.type } : {}), ...(this.answer.headers || {}) };
            return Object.entries(headers).map(([name, value]) => `${name}: ${value}\r\n`).join('');
        }
        send(body) {
            this.answer = route(this.method, this.url, body);
            if (!this.answer) return;
            w.setTimeout(() => {
                // jQuery clears onload once it has aborted or timed the request out
                if (!this.onload) return;
                Object.assign(this, { status: this.answer.status, statusText: '', responseText: this.answer.body, readyState: 4 });
                this.onload();
            }, 0);
        }
        abort() {}
    };
};

// opts: page 'dashboard'|'docker'|'vm'; api true|false; graphqlHangs; unraidDivisor (Unraid's Docker page handler); decimal '.'|','; cpuPhp; answers
const makePage = async (opts = {}) => {
    const errors = [];
    const vc = new VirtualConsole();
    vc.on('error', (...a) => errors.push(a.map(String).join(' ')));
    vc.on('jsdomError', (e) => { if (!/navigation|Not implemented/i.test(String(e.message))) errors.push(`jsdom: ${e.message}`); });
    const body = opts.page === 'vm'
        ? '<table id="kvm_table"><thead><tr><th class="th1"></th><th></th><th></th></tr></thead><tbody id="kvm_list"></tbody></table>'
        : opts.page === 'docker'
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
    // jQuery's own ajax, for the one request a test sends through it (fakeXhr above answers it)
    const realAjax = $.ajax;

    // HTTP boundary: every $.get and $.ajax is recorded and answered by the test (or by a default answer)
    // The folder endpoints answer application/json: jQuery hands the page the parsed value, or fails the request (parsererror)
    const parsed = (url, v) => {
        if (typeof v !== 'string' || !/\/read(_order|_info|_unraid_order)?\.php/.test(url)) return v;
        try { return JSON.parse(v); } catch (e) { return new Error('parsererror'); }
    };
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
            const v = parsed(url, answers[key]());
            if (v instanceof Error) d.reject({ status: v.message === 'parsererror' ? 200 : 500, statusText: v.message }); else d.resolve(v);
        }
        return d;
    };
    // jQuery rejects a request that outlives its timeout
    $.ajax = (o) => {
        const d = $.get(o.url);
        if (o.timeout) w.setTimeout(() => { if (d.state() === 'pending') d.reject({ status: 0, statusText: 'timeout' }); }, o.timeout);
        return d;
    };
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
    const observing = [];
    w.ResizeObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { if (!observing.some(([o, t]) => o === this && t === el)) observing.push([this, el]); }
        disconnect() { for (let i = observing.length - 1; i >= 0; i--) if (observing[i][0] === this) observing.splice(i, 1); }
    };
    // Calls back each observer watching el (default: the page), as a resize of el would
    const resized = (el = w.document.documentElement) => observing.filter(([, t]) => t === el).forEach(([o]) => o.cb([{ target: el }], o));
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
        // Unraid's own Reset Order handler: docker.js only patches it when it is there
        w.resetSorting = () => {};
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
    run(scriptHelpers(read('langs/script.php'), opts.decimal), 'script.php');
    run(read('scripts/include/customEvents.js'), 'customEvents.js');
    run(read('scripts/debug.js'), 'debug.js');
    run(read('scripts/shared.js'), 'shared.js');
    // A community extension from /boot/config/plugins/folder.view3/scripts (custom.php runs right after shared.js)
    if (opts.extension) run(opts.extension, 'extension.js');
    run(read('scripts/advanced-preview.js'), 'advanced-preview.js');
    // Unraid's own VM list loader, which vm.js patches
    if (opts.page === 'vm') { w.loadlist = () => {}; run(read('scripts/vm.js'), 'vm.js'); }
    else if (opts.page === 'docker') run(read('scripts/docker.js'), 'docker.js');
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
    return { w, $, g, run, tick, gets, sockets, nchan, tips, attach, ct, cell, samples, errors, pendingTimers, realNow, realAjax, resized };
};

const FOLDER_SETTINGS = {
    folder_webui: false, folder_webui_url: '', preview: 0, preview_hover: false, preview_update: true, preview_update_folder: false, preview_text_width: '',
    preview_grayscale: false, preview_status: 'none', preview_webui: true, preview_logs: true, preview_console: true, preview_vertical_bars: false,
    preview_overflow: 0, preview_row_separator: false, context: 0, context_trigger: 0, context_graph: 0, context_graph_time: 60, preview_border: false,
    lock_colors: true, update_column: false, use_global_defaults: false, default_action: false, expand_tab: false, override_default_actions: false, expand_dashboard: false,
};
// Unraid's row for one container (DockerContainers.php), cut to the cells docker.js reads
const dockerRow = (name, sid) => `<tr class="sortable" id="ct-${name}"><td class="ct-name"><span class="outer"><span id="${sid}" class="hand"><img class="img" src=""></span>` +
    `<span class="inner"><span class="appname"><a class="exec">${name}</a></span><br><i id="load-${sid}" class="fa fa-play started green-text"></i><span class="state">started</span></span></span></td>` +
    '<td class="updatecolumn"><span class="green-text">up-to-date</span></td><td></td><td></td><td></td><td></td><td></td><td class="advanced"></td>' +
    `<td><input type="checkbox" class="autostart" container="${name}"></td><td></td></tr>`;

// The Docker page drawn by the real createFolders() from docker.json's folders, Docker's container names and userprefs.cfg's values
const drawDocker = async ({ folders, containers, prefs, listed }) => {
    const sid = (i) => String(i).padStart(12, 'a');
    const defs = Object.fromEntries(Object.entries(folders).map(([id, f]) => [id, { ...f, icon: '', settings: { ...FOLDER_SETTINGS }, hidden_preview: [], actions: [] }]));
    const saved = prefs.filter((n) => containers.includes(n));
    const missing = containers.filter((n) => !prefs.includes(n));
    // Unraid draws saved containers in userprefs.cfg order and one missing from it on top (DockerContainers.php: array_search
    // false = 0); how it orders several missing ones among themselves is its own tie-break, so they stay as given
    const shown = missing.concat(saved);
    const info = {};
    const p = await makePage({ page: 'docker', api: false, answers: {
        'read.php': () => JSON.stringify(defs),
        'read_order.php': () => JSON.stringify(prefs),
        'read_info.php': () => JSON.stringify(info),
        // read_unraid_order.php lists the saved ones first, the missing ones last; page_order_test.php holds the real
        // readUnraidOrder() to the fixture's own list
        'read_unraid_order.php': () => JSON.stringify(listed || saved.concat(missing)),
    } });
    shown.forEach((n, i) => { info[n] = p.ct(sid(i), n); });
    const posts = [];
    // A request whose url holds an entry of `failing` is refused (503, with a reason as sync_order.php gives one). One in
    // `dropped` goes through jQuery's own ajax and gets the empty 200 Unraid before 7.4 answers a stale csrf_token with
    const failing = new Set();
    const dropped = new Set();
    fakeXhr(p.w, () => ({ status: 200, body: '' }));
    p.$.post = (url, data) => {
        posts.push({ url, data });
        if ([...dropped].some((part) => url.includes(part))) return p.realAjax({ url, type: 'POST', data });
        return [...failing].some((part) => url.includes(part)) ? p.$.Deferred().reject({ status: 503, responseJSON: { error: 'refused by the test' } }) : p.$.Deferred().resolve('ok');
    };
    p.$('#docker_containers').prepend(`<thead><tr>${'<th></th>'.repeat(10)}</tr></thead>`);
    // One list load: Unraid replaces the rows, then the page builds its folders. The harness clock is manual, so tick() moves it
    const render = () => {
        p.$('#docker_list').empty();
        shown.forEach((n, i) => p.$(dockerRow(n, sid(i))).appendTo('#docker_list'));
    };
    const draw = async () => {
        render();
        p.g('loadlist()');
        let built = false;
        p.g('createFolders()').then(() => { built = true; }, (e) => p.errors.push(`createFolders: ${e && e.stack || e}`));
        for (let i = 0; i < 50 && !built && !p.errors.length; i++) await p.tick(100);
        return built;
    };
    const rows = () => p.$('#docker_list > tr.sortable, #docker_list > tr.folder').toArray().map((tr) => {
        const m = tr.className.match(/folder-id-(\S+)/);
        return m ? `folder-${m[1]}` : tr.id.replace(/^ct-/, '');
    });
    const members = (id) => p.$(`#docker_list tr.folder-${id}-element`).toArray().map((tr) => tr.id.replace(/^ct-/, ''));
    // Every row top-down, a folder's members ahead of its placeholder: the shape fv3_page_order() returns
    const drawn = () => rows().flatMap((r) => (r.startsWith('folder-') ? [...members(r.slice(7)), r] : [r]));
    return { p, posts, failing, dropped, render, draw, rows, members, drawn };
};

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};
// A run that ends before done() must not pass: an await that never settles just empties the event loop
process.exitCode = 1;
const done = () => { console.log(failed ? `\n${failed} FAILED` : '\nall passed'); process.exit(failed ? 1 : 0); };

module.exports = { makePage, drawDocker, fakeXhr, scriptHelpers, check, done, flush, read };
