// node .github/scripts/rename_update_test.js — what a Docker or VMs page posts when it finds a renamed container (customEvents.js), sent on
// to the shipped update_ids.php: the renames and identity entries it found, so a save another tab made since the page loaded is kept (needs php)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const { fakeXhr, check, done, read, phpServer } = require('./preview_pages_harness.js');

const { config, server, cleanup } = phpServer('rename-update-test');
const onDisk = () => JSON.parse(fs.readFileSync(path.join(config, 'docker.json'), 'utf8'));

// A page with jQuery and the shipped customEvents.js; every POST it sends is kept
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://tower.local/Docker', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window;
w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
new vm.Script(read('scripts/include/customEvents.js'), { filename: 'customEvents.js' }).runInContext(dom.getInternalVMContext());
const posted = [];
fakeXhr(w, (method, url, body) => { posted.push({ file: url.split('/').pop(), fields: Object.fromEntries(new URLSearchParams(body)) }); return { status: 200, body: '{"success":true}', type: 'application/json' }; });
const sent = () => posted.map((p) => [p.file, p.fields.type, JSON.parse(p.fields.data)]);
// What Docker runs now, as the page gets it: name => image
const dockerInfo = (running) => Object.fromEntries(Object.entries(running).map(([name, image]) => [name, { info: { Config: { Image: image } } }]));
// The page's load: its folders from read.php, then the rename pass over what Docker runs now
const pageLoad = (running) => {
    posted.length = 0;
    const folders = JSON.parse(server('read.php', 'GET', { type: 'docker' }));
    w.fv3ResolveRenamedContainers(folders, dockerInfo(running), 'docker');
    return folders;
};

const folder = (name, containers, more = {}) => ({ name, icon: '', regex: '', containers, settings: {}, actions: [], ...more });
// `constructor` is a folder id the server takes, and a member of every plain JavaScript object
fs.writeFileSync(path.join(config, 'docker.json'), JSON.stringify({
    abc: folder('Media', ['app-a', 'app-old'], { containerImages: { 'app-a': 'img/a', 'app-old': 'img/x' }, hidden_preview: ['app-old'] }),
    def: folder('Tools', ['app-t'], { containerImages: { 'app-t': 'img/t' } }),
    leg: folder('From an older version', ['app-l']),
    constructor: folder('An id that is also an Object member', ['app-c']),
}));
const RUNNING = { 'app-a': 'img/a', 'app-new': 'img/x', 'app-t': 'img/t', 'app-l': 'img/l', 'app-c': 'img/c', 'app-b': 'img/b', 'app-u': 'img/u' };

// The page reads its folders. Before its rename pass posts, another tab saves two of them
const before = JSON.parse(server('read.php', 'GET', { type: 'docker' }));
server('update.php', 'POST', { type: 'docker', id: 'abc', content: JSON.stringify({ ...before.abc, containers: ['app-a', 'app-old', 'app-b'] }) });
server('update.php', 'POST', { type: 'docker', id: 'def', content: JSON.stringify({ ...before.def, containers: ['app-t', 'app-u'], name: 'Tools 2' }) });
posted.length = 0;
w.fv3ResolveRenamedContainers(before, dockerInfo(RUNNING), 'docker');

check('the page posts one id update: the rename it found in Media and the images it learned for two folders, and nothing of the folder it did not touch',
    JSON.stringify(sent()) === JSON.stringify([['update_ids.php', 'docker', { abc: { renames: { 'app-old': 'app-new' }, identity: {} },
        leg: { renames: {}, identity: { 'app-l': 'img/l' } }, constructor: { renames: {}, identity: { 'app-c': 'img/c' } } }]]), sent());
check('its own copy shows the rename at once', before.abc.containers.join() === 'app-a,app-new' && before.abc.containerImages['app-new'] === 'img/x'
    && before.abc.hidden_preview.join() === 'app-new', before.abc);

const answer = server('update_ids.php', 'POST', posted[0].fields);
const after = onDisk();
check('the server applies it to the folders as the other tab left them: Media keeps its new member, Tools its new name and member',
    answer === '{"success":true}' && after.abc.containers.join() === 'app-a,app-new,app-b' && after.def.containers.join() === 'app-t,app-u' && after.def.name === 'Tools 2', after);
check('the renamed container\'s image and hidden-preview entry moved with it, and the two folders without images now know theirs',
    JSON.stringify(after.abc.containerImages) === JSON.stringify({ 'app-a': 'img/a', 'app-new': 'img/x' }) && after.abc.hidden_preview.join() === 'app-new'
    && JSON.stringify(after.leg.containerImages) === JSON.stringify({ 'app-l': 'img/l' })
    && JSON.stringify(after.constructor.containerImages) === JSON.stringify({ 'app-c': 'img/c' }), after);

const next = pageLoad(RUNNING);
check('the next page load has what it needs and learns the new members\' images once', posted.length === 1
    && JSON.stringify(JSON.parse(posted[0].fields.data)) === JSON.stringify({ abc: { renames: {}, identity: { 'app-b': 'img/b' } }, def: { renames: {}, identity: { 'app-u': 'img/u' } } })
    && next.abc.containers.join() === 'app-a,app-new,app-b', posted);
server('update_ids.php', 'POST', posted[0].fields);
pageLoad(RUNNING);
check('and the load after that posts nothing: the page and the file agree', posted.length === 0, posted);

// The VMs page finds a rename by UUID. It leaves a name that some folder lists already where it is, as the Docker pass and the server do
const vmPass = (folders, vms) => {
    posted.length = 0;
    w.fv3ResolveRenamedContainers(folders, Object.fromEntries(Object.entries(vms).map(([name, uuid]) => [name, { uuid }])), 'vm');
    return sent().map((s) => s[2]);
};
const renamedVm = { a: folder('Desktops', ['win10'], { containerIds: { win10: 'uuid-1' } }) };
check('a renamed VM is reported by its UUID', JSON.stringify(vmPass(renamedVm, { win11: 'uuid-1' })) === JSON.stringify([{ a: { renames: { win10: 'win11' }, identity: {} } }])
    && renamedVm.a.containers.join() === 'win11', renamedVm);
const listedElsewhere = { a: folder('Desktops', ['win10'], { containerIds: { win10: 'uuid-1' } }), b: folder('Lab', ['win11'], { containerIds: {} }) };
const reported = vmPass(listedElsewhere, { win11: 'uuid-1' });
check('a VM renamed to a name another folder lists is not taken from that folder: no rename is reported, on this load or the next',
    JSON.stringify(reported) === JSON.stringify([{ b: { renames: {}, identity: { win11: 'uuid-1' } } }]) && listedElsewhere.a.containers.join() === 'win10'
    && vmPass(listedElsewhere, { win11: 'uuid-1' }).length === 0, { reported, a: listedElsewhere.a });

cleanup();
done();
