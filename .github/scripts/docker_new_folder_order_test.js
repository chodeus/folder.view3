// node .github/scripts/docker_new_folder_order_test.js — where the Docker page draws folders and containers missing from userprefs.cfg (npm ci in this folder first)
// page_order_test.php holds the server's autostart order to the same fixture.
'use strict';
const fs = require('fs');
const path = require('path');
const { makePage, check, done } = require('./preview_pages_harness.js');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'new-folder-order.json'), 'utf8'));
const SETTINGS = {
    folder_webui: false, folder_webui_url: '', preview: 0, preview_hover: false, preview_update: true, preview_update_folder: false, preview_text_width: '',
    preview_grayscale: false, preview_status: 'none', preview_webui: true, preview_logs: true, preview_console: true, preview_vertical_bars: false,
    preview_overflow: 0, preview_row_separator: false, context: 0, context_trigger: 0, context_graph: 0, context_graph_time: 60, preview_border: false,
    lock_colors: true, update_column: false, use_global_defaults: false, default_action: false, expand_tab: false, override_default_actions: false, expand_dashboard: false,
};
// Unraid's row for one container (DockerContainers.php), cut to the cells docker.js reads
const ROW = (name, sid) => `<tr class="sortable" id="ct-${name}"><td class="ct-name"><span class="outer"><span id="${sid}" class="hand"><img class="img" src=""></span>` +
    `<span class="inner"><span class="appname"><a class="exec">${name}</a></span><br><i id="load-${sid}" class="fa fa-play started green-text"></i><span class="state">started</span></span></span></td>` +
    '<td class="updatecolumn"><span class="green-text">up-to-date</span></td><td></td><td></td><td></td><td></td><td></td><td class="advanced"></td>' +
    `<td><input type="checkbox" class="autostart" container="${name}"></td><td></td></tr>`;

(async () => {
    const sid = (i) => String(i).padStart(12, 'a');
    const folders = Object.fromEntries(Object.entries(fixture.folders).map(([id, f]) => [id, { ...f, icon: '', settings: { ...SETTINGS }, hidden_preview: [], actions: [] }]));
    const p = await makePage({ page: 'docker', api: false, answers: {
        'read.php': () => JSON.stringify(folders),
        'read_order.php': () => JSON.stringify(fixture.prefs),
        'read_info.php': () => JSON.stringify(info),
        'read_unraid_order.php': () => JSON.stringify(listed),
    } });
    const saved = fixture.prefs.filter((n) => fixture.containers.includes(n));
    const missing = fixture.containers.filter((n) => !fixture.prefs.includes(n));
    // Unraid draws saved containers in userprefs.cfg order and one missing from it on top (DockerContainers.php: array_search
    // false = 0); how it orders several missing ones among themselves is its own tie-break, so the fixture keeps them A-Z
    const shown = missing.concat(saved);
    // read_unraid_order.php (readUnraidOrder) lists the saved ones first, the missing ones last
    const listed = saved.concat(missing);
    const info = Object.fromEntries(shown.map((n, i) => [n, p.ct(sid(i), n)]));
    p.$('#docker_containers').prepend(`<thead><tr>${'<th></th>'.repeat(10)}</tr></thead>`);
    shown.forEach((n, i) => p.$(ROW(n, sid(i))).appendTo('#docker_list'));

    p.g('loadlist()');
    let built = false;
    p.g('createFolders()').then(() => { built = true; }, (e) => p.errors.push(`createFolders: ${e && e.stack || e}`));
    // The harness clock is manual: the page's requests and timers only move on tick()
    for (let i = 0; i < 50 && !built && !p.errors.length; i++) await p.tick(100);
    check('createFolders finished', built, p.gets.filter((r) => r.d.state() === 'pending').map((r) => r.url));

    const rows = p.$('#docker_list > tr.sortable').toArray().map((tr) => {
        const m = tr.className.match(/folder-id-(\S+)/);
        return m ? `folder-${m[1]}` : tr.id.replace(/^ct-/, '');
    });
    check('new folders on top, the last one the page meets first; new containers below them', JSON.stringify(rows) === JSON.stringify(fixture.rows), rows);
    const members = (id) => p.$(`tr.folder-id-${id} div.folder-storage > tr`).toArray().map((tr) => tr.id.replace(/^ct-/, ''));
    const drawn = rows.flatMap((r) => (r.startsWith('folder-') ? [...members(r.slice(7)), r] : [r]));
    check('the autostart order the server writes is the order drawn', JSON.stringify(drawn) === JSON.stringify(fixture.autostart), drawn);
    check('no page errors', p.errors.length === 0, p.errors);
    done();
})();
