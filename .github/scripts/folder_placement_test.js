// node .github/scripts/folder_placement_test.js — where each folder lands in the list Unraid renders: every folder is shown,
// at its saved place, on the VMs and Docker pages and the Dashboard, also next to another folder or in a list with no entries
'use strict';
const { makePage, drawDocker, check, done } = require('./preview_pages_harness.js');

const F = (name, containers, settings = {}) => ({ name, icon: '', regex: '', containers, settings, hidden_preview: [], actions: [] });
const xhr = (p) => {
    const sent = [];
    p.w.XMLHttpRequest = class {
        open(method, url) { this.url = url; }
        setRequestHeader() {}
        getAllResponseHeaders() { return 'Content-Type: text/html\r\n'; }
        send() { sent.push(this); }
        abort() {}
    };
    return () => { Object.assign(sent[0], { status: 200, statusText: 'OK', responseText: 'rows', readyState: 4 }); sent[0].onload(); };
};

// Unraid's VM rows (VMMachines.php), cut to the cells vm.js reads: each VM is a row and a hidden detail row under it.
// With no VMs Unraid sends one message row instead
const vmRow = (name, i) => `<tr parent-id="${i}" class="sortable"><td class="vm-name"><span class="outer"><span id="vm-u${i}" class="hand"><img class="img" src=""></span>` +
    `<span class="inner"><a href="#" onclick='return toggle_id("name-${i}")'>${name}</a><br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span></td><td></td>` +
    `<td><input class="autostart" type="checkbox" uuid="u${i}"></td></tr><tr child-id="${i}" id="name-${i}" style="display:none"><td colspan="3"></td></tr>`;
const NO_VMS = '<tr><td colspan="8" style="text-align:center;padding-top:12px">No Virtual Machines installed</td></tr>';

// The VMs page after one list load: its rows (`[name:vm,vm]` a folder, `msg` Unraid's message) and whether each detail row
// was under its VM when the page reported its folders built. `listed`: the VMs Unraid's list holds, when not all of them
const vmPage = async (vms, folders, prefs, listed = vms) => {
    const info = Object.fromEntries(vms.map((n, i) => [n, { uuid: `u${i}`, state: 'shutoff', autostart: false }]));
    const p = await makePage({ page: 'vm', api: false, answers: {
        'read.php': () => JSON.stringify(folders), 'read_order.php': () => JSON.stringify(prefs),
        'read_unraid_order.php': () => JSON.stringify(vms), 'read_info.php': () => JSON.stringify(info),
    } });
    const land = xhr(p);
    const warns = [];
    p.w.fv3DebugWarn = (...args) => warns.push(args.join(' '));
    p.w.loadlist_original = () => p.realAjax({ url: '/plugins/dynamix.vm.manager/include/VMMachines.php', data: { show: '' },
        success: () => { p.$('#kvm_list').html(listed.length ? listed.map(vmRow).join('') : NO_VMS); } });
    let paired = null;
    p.w.folderEvents.addEventListener('vm-post-folders-creation', () => {
        paired = p.$('tr[child-id]').toArray().every((tr) => p.$(tr).prev().attr('parent-id') === tr.getAttribute('child-id'));
    });
    p.g('loadlist()');
    land();
    for (let i = 0; i < 30; i++) await p.tick(100);
    const rows = p.$('#kvm_list > tr').toArray().filter((tr) => !tr.hasAttribute('child-id')).map((tr) => {
        if (p.$(tr).hasClass('folder')) return `[${p.$(tr).find('.folder-appname').first().text()}:${p.$(tr).find('div.folder-storage > tr td.vm-name span.inner a').toArray().map((a) => a.textContent).join(',')}]`;
        return tr.hasAttribute('parent-id') ? p.$(tr).find('td.vm-name span.inner a').first().text() : 'msg';
    }).join(' ');
    return { rows, paired, warns, errors: p.errors };
};

const NO_CONTAINERS = "<tr><td colspan='10' style='text-align:center;padding-top:12px'>No Docker containers installed</td></tr>";

(async () => {
    {
        const t = await vmPage(['vm-a', 'vm-b', 'vm-c'], { A: F('A', ['vm-a']), B: F('B', ['vm-b']) }, ['folder-A', 'folder-B', 'vm-c']);
        check('VMs, two folders side by side, then a VM: both folders, in the saved order, with no warning', t.rows === '[A:vm-a] [B:vm-b] vm-c' && t.warns.length === 0, t);
        check('VMs, two folders side by side: when the page says its folders are built, each VM\'s detail row is right under it', t.paired === true && t.errors.length === 0, t);
    }
    {
        const t = await vmPage(['vm-a', 'vm-b', 'vm-c'], { A: F('A', ['vm-a']), B: F('B', ['vm-b']) }, ['vm-c', 'folder-A', 'folder-B']);
        check('VMs, a VM then two folders: the second folder is shown too', t.rows === 'vm-c [A:vm-a] [B:vm-b]', t.rows);
    }
    {
        const t = await vmPage(['vm-a', 'vm-b', 'vm-c'], { A: F('A', ['vm-a']), B: F('B', ['vm-b']), C: F('C', ['vm-c']) }, ['folder-A', 'folder-B', 'folder-C']);
        check('VMs, every VM in a folder: each folder is shown with its VM, and no VM is left loose', t.rows === '[A:vm-a] [B:vm-b] [C:vm-c]', t.rows);
    }
    {
        // A VM between each pair of folders, and a folder missing from the saved order
        const t = await vmPage(['vm-a', 'vm-b', 'vm-c'], { T: F('T', []), H: F('H', ['vm-a', 'vm-c']), D: F('D', ['vm-b']) },
            ['folder-H', 'vm-a', 'folder-T', 'vm-b', 'folder-gone', 'vm-c']);
        check('VMs, a VM between the folders: the same rows as before, each detail row under its VM', t.rows === '[D:vm-b] [H:vm-a,vm-c] [T:]' && t.paired === true, t);
    }
    {
        const t = await vmPage(['vm-a', 'vm-b', 'vm-c'], { A: F('A', ['vm-a'], { expand_tab: true }), B: F('B', ['vm-b']) }, ['folder-A', 'folder-B', 'vm-c']);
        const opened = t.rows.split(' ');
        check('VMs, an opened folder then another folder: the second comes after the first one\'s VM, then the loose VM', opened[0].startsWith('[A:')
            && opened.slice(-2).join(' ') === '[B:vm-b] vm-c' && t.paired === true, t);
    }
    {
        const t = await vmPage(['vm-a', 'vm-new'], { A: F('A', []) }, ['vm-a', 'vm-new', 'folder-A'], ['vm-a']);
        check('VMs, a folder saved after a VM that Unraid\'s list does not hold yet: shown after the last VM, with a debug warning', t.rows === 'vm-a [A:]'
            && t.warns.join() === 'fv3PlaceFolder place 2 of 1 entries' && t.errors.length === 0, t);
    }
    {
        const t = await vmPage([], { A: F('A', []), B: F('B', []) }, []);
        const [msg, ...rest] = t.rows.split(' ');
        check('VMs, no VMs: Unraid\'s message stays, and both folders are shown', msg === 'msg' && rest.sort().join(' ') === '[A:] [B:]' && t.errors.length === 0, t);
    }
    {
        const page = await drawDocker({ folders: { f: F('F', []), g: F('G', []), h: F('H', []) }, containers: [], prefs: ['folder-f', 'folder-g', 'folder-h'] });
        const { p } = page;
        p.w.loadlist_original = () => {};
        p.g('loadlist()');
        page.render();
        p.$('#docker_list').append(NO_CONTAINERS);
        p.g('listview()');
        for (let i = 0; i < 30; i++) await p.tick(100);
        const rows = p.$('#docker_list > tr').toArray().map((tr) => (p.$(tr).hasClass('folder') ? tr.className.match(/folder-id-(\S+)/)[1] : 'msg')).join(' ');
        check('Docker, no containers, folders saved from before: Unraid\'s message stays, and all three folders follow it in the saved order', rows === 'msg f g h' && p.errors.length === 0, { rows, errors: p.errors });
    }
    {
        // Both Dashboard tiles as DashboardApps.php sends them, each ending in its hidden "nothing here" line; a folder saved
        // between two entries lands between them. With no entries only that line is there
        const tiles = async (names) => {
            const dinfo = {};
            const vinfo = Object.fromEntries(names.map((n, i) => [n, { uuid: `u${i}`, state: 'shutoff', autostart: false }]));
            const p = await makePage({ page: 'dashboard', api: false, answers: {
                'read.php': () => JSON.stringify({ f: F('F', []), g: F('G', []) }), 'read_order.php': () => JSON.stringify(names.length ? ['c1', 'folder-f', 'c2', 'folder-g'] : []),
                'read_unraid_order.php': () => JSON.stringify(names), 'read_info.php': () => JSON.stringify(dinfo), 'docker_load.php': () => '',
            } });
            names.forEach((n, i) => { dinfo[n] = p.ct(String(i).padStart(12, 'a'), n); });
            const get = p.$.get;
            p.$.get = (url) => (url.includes('read_info.php?type=vm') ? p.$.Deferred().resolve(JSON.parse(JSON.stringify(vinfo))) : get(url));
            p.$('.Dashboard table').after('<table><tbody id="vm_view"></tbody></table>');
            const land = xhr(p);
            const docker = names.map((n, i) => `<span class="outer solid apps started"><span id="${String(i).padStart(12, 'a')}" class="hand"><img class="img" src=""></span>`
                + `<span class="inner"><span>${n}</span><br><i class="fa fa-play started green-text"></i><span class="state">started</span></span></span>`).join('');
            const vms = names.map((n, i) => `<span class="outer solid vms stopped"><span id="vm-u${i}" class="hand"><img class="img" src=""></span>`
                + `<span class="inner">${n}<br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span>`).join('');
            p.w.loadlist_original = () => p.realAjax({ url: '/webGui/include/DashboardApps.php', type: 'POST', data: {}, success: () => {
                p.$('#docker_view tr.updated').remove();
                p.$('#docker_view').append(`<tr title='' class='updated'><td>${docker}<span id='no_apps' style='display:none'>No docker containers defined<br><br></span></td></tr>`);
                p.$('#vm_view tr.updated').remove();
                p.$('#vm_view').append(`<tr title='' class='updated'><td>${vms}<span id='no_vms' style='display:none'>No virtual machines defined<br><br></span></td></tr>`);
            } });
            p.g('loadlist()');
            land();
            for (let i = 0; i < 30; i++) await p.tick(100);
            const tile = (tb) => p.$(`tbody#${tb} > tr.updated > td`).children().not('#no_apps, #no_vms').toArray().map((el) => (p.$(el).hasClass('folder-showcase-outer')
                ? `[${el.className.match(/folder-showcase-outer-(\S+)/)[1]}]` : p.$(el).find('span.inner').contents().first().text().trim())).join(' ');
            return { docker: tile('docker_view'), vm: tile('vm_view'), errors: p.errors };
        };
        const t = await tiles(['c1', 'c2']);
        check('Dashboard, a folder saved between two entries and one after the last: in place in both tiles', t.docker === 'c1 [f] c2 [g]' && t.vm === 'c1 [f] c2 [g]' && t.errors.length === 0, t);
        const e = await tiles([]);
        check('Dashboard, both tiles with no entries: both folders are shown in each', e.docker.split(' ').sort().join() === '[f],[g]' && e.vm.split(' ').sort().join() === '[f],[g]' && e.errors.length === 0, e);
    }
    done();
})();
