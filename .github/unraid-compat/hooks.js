// Unraid's own parts FV3 relies on: each names the FV3 file that uses it and what the user loses without it. browser_test.js
// checks each on Unraid alone, and that the file still mentions it. any: FV3 takes whichever exists; since: FV3 needs it only from there
'use strict';
const D = 'Docker', V = 'VMs', B = 'Dashboard', ALL = 'any page';
const HOOKS = [
    // Docker's list and its rows
    { page: D, dom: '#docker_list > tr.sortable', file: 'scripts/docker.js', loses: 'folders never draw' },
    { page: D, dom: '#docker_containers > thead > tr > th', file: 'scripts/docker.js', loses: 'folder rows lose their column spans and widths' },
    { page: D, dom: '#docker_list td.ct-name > span.outer > span.hand > img.img', file: 'scripts/docker.js', loses: "folder previews show no containers' icons" },
    { page: D, dom: '#docker_list td.ct-name span.inner > span.appname > a.exec', file: 'scripts/docker.js', loses: 'containers are not read into their folders' },
    { page: D, dom: '#docker_list td.ct-name span.outer i[id^="load-"]', file: 'scripts/docker.js', loses: "folder icons stop showing their containers' state" },
    { page: D, dom: 'td.updatecolumn', file: 'scripts/shared.js', loses: 'incognito leaves version text showing' },
    { page: D, dom: '#docker_list td.advanced', file: 'scripts/docker.js', loses: "the folder autostart switch cannot find its containers' switches" },
    { page: D, dom: '#docker_list input.autostart', file: 'scripts/docker.js', loses: 'the folder autostart switch does nothing' },
    { page: D, dom: '.switch-button-background', file: 'scripts/docker.js', loses: 'the folder autostart switch is unstyled' },
    { page: D, dom: '#docker_containers th.nine', file: 'scripts/shared.js', loses: 'the autostart column is sized wrong' },
    { page: D, dom: '.advancedview', file: 'scripts/docker.js', loses: 'folders are not redrawn on the basic/advanced toggle' },
    { page: D, any: ['.js-actions', 'input[value="Add Container"]'], file: 'folder.view3.Docker.page', loses: 'no Add Folder button' },
    { page: D, dom: 'div.spinner.fixed', file: 'scripts/docker.js', loses: 'no spinner during folder actions' },
    // VMs' list and its rows
    { page: V, dom: '#kvm_list > tr.sortable', file: 'scripts/vm.js', loses: 'folders never draw' },
    { page: V, dom: '#kvm_table > thead > tr', file: 'scripts/vm.js', loses: 'folder rows lose their column spans' },
    { page: V, dom: '#kvm_list td.vm-name span.outer span.inner a', file: 'scripts/vm.js', loses: 'VMs are not read into their folders' },
    { page: V, dom: '#kvm_list td.vm-name span.hand > img.img', file: 'scripts/vm.js', loses: "folder previews show no VMs' icons" },
    { page: V, dom: '#kvm_list tr[id^="name-"]', file: 'scripts/vm.js', loses: 'VM detail rows escape their folders' },
    { page: V, dom: '#kvm_list a[onclick*="toggle_id"]', file: 'scripts/vm.js', loses: 'VM detail rows escape their folders' },
    { page: V, dom: '#kvm_table th.th1', file: 'scripts/vm.js', loses: 'the name column is not sized' },
    { page: V, dom: '#kvm_list input.autostart', file: 'scripts/vm.js', loses: 'the folder autostart switch throws' },
    { page: V, any: ['.js-actions', 'input[value="Add VM"]'], file: 'folder.view3.VMs.page', loses: 'no Add Folder button' },
    // The Dashboard's tiles
    { page: B, dom: 'tbody#docker_view > tr.updated > td', file: 'scripts/dashboard.js', loses: 'Docker folders never draw' },
    { page: B, dom: 'tbody#vm_view > tr.updated > td', file: 'scripts/dashboard.js', loses: 'VM folders never draw' },
    { page: B, dom: 'tbody#docker_view span.outer.solid.apps > span.hand', file: 'scripts/dashboard.js', loses: 'containers are not moved into folder tiles' },
    { page: B, dom: 'tbody#docker_view span.outer.apps > span.inner', file: 'scripts/dashboard.js', loses: "containers' names are not read" },
    { page: B, dom: 'tbody#vm_view span.outer.vms > span.hand', file: 'scripts/dashboard.js', loses: 'VMs are not moved into folder tiles' },
    { page: B, dom: 'input#apps', file: 'scripts/dashboard.js', loses: "hide-stopped ignores Docker folders" },
    { page: B, dom: 'input#vms', file: 'scripts/dashboard.js', loses: 'hide-stopped ignores VM folders' },
    { page: B, dom: 'table.dashboard', file: 'styles/dashboard.css', loses: 'folder tiles lose their padding' },
    // Every page
    { page: ALL, dom: 'link[href*="default-base"]', since: '7.1', file: 'scripts/include/customEvents.js', loses: "FV3 styles the page as 7.0's layout" },
    // Classes FV3 puts on its own markup for Unraid's stylesheet to colour
    { page: ALL, css: 'green-text', file: 'scripts/docker.js', loses: 'a started folder loses its green state' },
    { page: ALL, css: 'red-text', file: 'scripts/docker.js', loses: 'a stopped folder loses its red state' },
    { page: ALL, css: 'orange-text', file: 'scripts/docker.js', loses: "a folder's drag handle and update mark lose their colour" },
    // Unraid's functions and jQuery plugins
    { page: D, js: 'loadlist', file: 'scripts/docker.js', loses: 'folders never draw' },
    { page: D, js: 'listview', file: 'scripts/docker.js', loses: 'folders are not redrawn after a view toggle' },
    { page: D, js: 'openDocker', file: 'scripts/docker.js', loses: "a folder's Update does nothing" },
    { page: D, js: 'openTerminal', file: 'scripts/docker.js', loses: 'the console and log buttons do nothing' },
    { page: D, js: 'dockerload', file: 'scripts/docker.js', loses: 'no CPU and memory stats without the Unraid API' },
    { page: V, js: 'loadlist', file: 'scripts/vm.js', loses: 'folders never draw' },
    { page: ALL, js: 'context.attach', file: 'scripts/docker.js', loses: 'folders have no menus' },
    { page: ALL, js: 'swal', file: 'scripts/shared.js', loses: 'no confirm or error dialogs' },
    { page: ALL, js: 'csrf_token', file: 'scripts/include/customEvents.js', loses: "every FV3 save is refused" },
    { page: ALL, js: '$.fn.tooltipster', file: 'scripts/advanced-preview.js', loses: 'no advanced preview' },
    { page: D, js: '$.fn.switchButton', file: 'scripts/docker.js', loses: 'the folder autostart switch never draws' },
    { page: D, js: '$.fn.sortable', file: 'scripts/docker.js', loses: 'folders cannot be dragged' },
    { page: D, js: '$.cookie', file: 'scripts/docker.js', loses: 'the advanced view is not detected' },
    { page: D, js: '$.fn.readmore', file: 'scripts/shared.js', loses: "an opened folder's long descriptions are not folded" },
    { page: ALL, js: 'openBox', file: 'scripts/shared.js', loses: "a folder's user script actions do nothing" },
    // Unraid's endpoints FV3 intercepts or calls, as files in the webGUI
    { url: '/plugins/dynamix.docker.manager/include/UserPrefs.php', file: 'scripts/docker.js', loses: "Unraid saves an order without FV3's folders" },
    { url: '/plugins/dynamix.vm.manager/include/UserPrefs.php', file: 'scripts/vm.js', loses: "Unraid saves an order without FV3's folders" },
    { url: '/plugins/dynamix.vm.manager/include/VMMachines.php', file: 'scripts/vm.js', loses: 'folders are not redrawn when the VM list reloads' },
    { url: '/webGui/include/DashboardApps.php', file: 'scripts/dashboard.js', loses: 'Dashboard folders are not redrawn when the tiles reload' },
    { url: '/plugins/dynamix.docker.manager/include/UpdateConfig.php', file: 'scripts/docker.js', loses: 'folder autostart falls out of step' },
    { url: '/plugins/dynamix.docker.manager/include/DockerUpdate.php', file: 'scripts/docker.js', loses: 'folders are not redrawn after an update' },
    { url: '/plugins/dynamix.vm.manager/include/VMajax.php', file: 'scripts/shared.js', loses: 'VM folder actions fail' },
    { url: '/plugins/dynamix.vm.manager/vnc.html', file: 'scripts/vm.js', loses: "a folder member's VNC button does nothing" },
    { url: '/plugins/dynamix.docker.manager/images/question.png', file: 'scripts/docker.js', loses: 'folders without an icon show a broken image' },
];

// What a hook's FV3 file must still mention: a selector's #ids, .classes and quoted values, a function's name, a URL's file
const tokens = (h) => (h.js ? [h.js.startsWith('$.fn.') ? h.js.slice(4) : h.js] : h.url ? [h.url.split('/').pop()] : h.css ? [h.css]
    : (h.any || [h.dom]).flatMap((s) => [...s.matchAll(/([#.][\w-]+)|"([^"]+)"/g)].map((m) => m[1] || m[2])));
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// As a whole token (a #id or .class starts at its mark); a class may also be named in a class attribute or as a quoted string
const mentions = (text, t) => new RegExp(`${/^[#.]/.test(t) ? '' : '(?<![\\w-])'}${esc(t)}(?![\\w-])`).test(text)
    || (t[0] === '.' && new RegExp(`class=["'][^"']*(?<![\\w-])${esc(t.slice(1))}(?![\\w-])|['"]${esc(t.slice(1))}['"]`).test(text));
const describe = (h) => h.dom || (h.any && `any of ${h.any.join(', ')}`) || (h.css && `a stylesheet rule for .${h.css}`) || h.url || `the global ${h.js}`;
const older = (a, b) => { const [x, y] = [a, b].map((v) => v.split('.').map(Number)); const i = x.findIndex((n, k) => n !== y[k]); return i >= 0 && x[i] < y[i]; };
const applies = (h, version) => !h.since || !older(version, h.since);

// In the page: the indexes of the hooks it lacks. Rules in @media and @import count; a sheet that cannot be read counts as none
function missingHooks(hooks) {
    const own = (sheet) => { try { return [...sheet.cssRules]; } catch { return []; } };
    const flat = (rules) => rules.flatMap((r) => (r.styleSheet ? flat(own(r.styleSheet)) : r.cssRules ? [r, ...flat([...r.cssRules])] : [r]));
    const selectors = flat([...document.styleSheets].flatMap(own))
        .map((r) => r.selectorText || '').join('\n');
    const present = (h) => {
        if (h.dom) return !!document.querySelector(h.dom);
        if (h.any) return h.any.some((s) => document.querySelector(s));
        if (h.css) return new RegExp(`\\.${h.css}(?![\\w-])`).test(selectors);
        try { return (0, eval)(`typeof ${h.js}`) !== 'undefined'; } catch { return false; }
    };
    return hooks.map((h, i) => (present(h) ? -1 : i)).filter((i) => i >= 0);
}

module.exports = { HOOKS, tokens, mentions, describe, applies, missingHooks };
