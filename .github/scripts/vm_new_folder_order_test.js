// node .github/scripts/vm_new_folder_order_test.js — where the VMs page draws folders missing from its userprefs.cfg (npm ci in this folder first)
// The FolderView Plus import writes its folders in reverse for this rule; foreign_import_test.php checks the Docker order (fv3_page_order)
'use strict';
const { makePage, check, done } = require('./preview_pages_harness.js');

const folder = (name, vm) => ({ name, icon: '', regex: '', containers: [vm], settings: {}, hidden_preview: [], actions: [] });
// Unraid's rows for one VM (VMMachines.php), cut to the cells vm.js reads
const vmRow = (vm, i) => `<tr parent-id="${i}" class="sortable"><td class="vm-name"><span class="outer"><span id="vm-u${i}" class="hand"><img class="img" src=""></span>` +
    `<span class="inner"><a>${vm}</a><br><i class="fa fa-square stopped red-text"></i><span class="state">stopped</span></span></span></td><td></td>` +
    `<td><input class="autostart" type="checkbox" uuid="u${i}"></td></tr><tr child-id="${i}" id="name-${i}" style="display:none"><td colspan="3"></td></tr>`;

(async () => {
    // As the import leaves vm.json for FolderView Plus's order Alpha, Bravo, Charlie: the last one first, after a saved folder
    const folders = { keep: folder('Existing', 'vm-k'), zz: folder('Charlie', 'vm-c'), yy: folder('Bravo', 'vm-b'), xx: folder('Alpha', 'vm-a') };
    const vms = ['vm-k', 'vm-a', 'vm-b', 'vm-c'];
    const p = await makePage({ page: 'vm', api: false, answers: {
        'read.php': () => JSON.stringify(folders), 'read_order.php': () => JSON.stringify(['folder-keep', 'vm-k']),
        'read_unraid_order.php': () => JSON.stringify(vms),
        'read_info.php': () => JSON.stringify(Object.fromEntries(vms.map((vm, i) => [vm, { uuid: `u${i}`, state: 'shutoff', autostart: false }]))),
    } });
    p.w.loadlist_original = () => p.$('#kvm_list').html(vms.map(vmRow).join(''));
    p.g('loadlist()');
    let built = false;
    p.g('createFolders()').then(() => { built = true; }, (e) => p.errors.push(`createFolders: ${e && e.stack || e}`));
    for (let i = 0; i < 50 && !built && !p.errors.length; i++) await p.tick(100);
    const shown = p.$('#kvm_list > tr.folder a.folder-appname').toArray().map((a) => a.textContent);
    check('createFolders finished', built);
    check('folders missing from userprefs.cfg are drawn on top, the last in vm.json first; the saved folder after them', shown.join() === 'Alpha,Bravo,Charlie,Existing', shown);
    check('no page errors', p.errors.length === 0, p.errors);
    done();
})();
