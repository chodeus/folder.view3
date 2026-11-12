// node .github/scripts/rename_update_test.js — what a Docker page posts when it finds a renamed container (customEvents.js), sent on to the
// shipped update_ids.php: the renames and identity entries it found, so a save another tab made since the page loaded is kept (needs php)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const { fakeXhr, check, done, read } = require('./preview_pages_harness.js');

const PLUGIN = process.env.FV3_PLUGIN || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'fv3-rename-update-test-'));
const config = path.join(tmp, 'config');
// lib.php requires these two Unraid host files at load time
for (const [rel, src] of [['webGui/include/Helpers.php', '<?php'],
    ['plugins/dynamix.docker.manager/include/DockerClient.php', '<?php class DockerClient { function getDockerContainers() { return []; } function getDockerJSON($url) { return []; } } class DockerUpdate {}']]) {
    fs.mkdirSync(path.dirname(path.join(tmp, 'docroot', rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docroot', rel), src);
}
fs.mkdirSync(config);
fs.mkdirSync(path.join(tmp, 'dockerMan'));
const quote = (text) => `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
// One request to a shipped endpoint, as its own process: the body it answers
const server = (name, method, fields) => {
    const copy = path.join(tmp, name);
    fs.writeFileSync(copy, fs.readFileSync(path.join(PLUGIN, 'server', name), 'utf8').replace('require_once("/usr/local/emhttp/plugins/folder.view3/server/lib.php");',
        `require_once(${quote(path.join(PLUGIN, 'server/lib.php'))}); $configDir = ${quote(config)}; $fv3DockerManDir = ${quote(path.join(tmp, 'dockerMan'))};`));
    const boot = `$_SERVER["DOCUMENT_ROOT"] = ${quote(path.join(tmp, 'docroot'))}; $_SERVER["REQUEST_METHOD"] = ${quote(method)};`
        + ` $_${method} = json_decode(${quote(JSON.stringify(fields))}, true); include ${quote(copy)};`;
    return execFileSync('php', ['-d', 'display_errors=0', '-r', boot], { encoding: 'utf8' });
};
const onDisk = () => JSON.parse(fs.readFileSync(path.join(config, 'docker.json'), 'utf8'));

// A page with jQuery and the shipped customEvents.js; every POST it sends is kept
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://tower.local/Docker', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const w = dom.window;
w.eval(fs.readFileSync(require.resolve('jquery/dist/jquery.js'), 'utf8'));
new vm.Script(read('scripts/include/customEvents.js'), { filename: 'customEvents.js' }).runInContext(dom.getInternalVMContext());
const posted = [];
fakeXhr(w, (method, url, body) => { posted.push({ file: url.split('/').pop(), fields: Object.fromEntries(new URLSearchParams(body)) }); return { status: 200, body: '{"success":true}', type: 'application/json' }; });
// The page's load: its folders from read.php, then the rename pass over what Docker runs now
const pageLoad = (running) => {
    posted.length = 0;
    const folders = JSON.parse(server('read.php', 'GET', { type: 'docker' }));
    w.fv3ResolveRenamedContainers(folders, Object.fromEntries(Object.entries(running).map(([name, image]) => [name, { info: { Config: { Image: image } } }])), 'docker');
    return folders;
};

const folder = (name, containers, more = {}) => ({ name, icon: '', regex: '', containers, settings: {}, actions: [], ...more });
fs.writeFileSync(path.join(config, 'docker.json'), JSON.stringify({
    abc: folder('Media', ['app-a', 'app-old'], { containerImages: { 'app-a': 'img/a', 'app-old': 'img/x' }, hidden_preview: ['app-old'] }),
    def: folder('Tools', ['app-t'], { containerImages: { 'app-t': 'img/t' } }),
    leg: folder('From an older version', ['app-l']),
}));
const RUNNING = { 'app-a': 'img/a', 'app-new': 'img/x', 'app-t': 'img/t', 'app-l': 'img/l', 'app-b': 'img/b', 'app-u': 'img/u' };

// The page reads its folders. Before its rename pass posts, another tab saves two of them
const before = JSON.parse(server('read.php', 'GET', { type: 'docker' }));
server('update.php', 'POST', { type: 'docker', id: 'abc', content: JSON.stringify({ ...before.abc, containers: ['app-a', 'app-old', 'app-b'] }) });
server('update.php', 'POST', { type: 'docker', id: 'def', content: JSON.stringify({ ...before.def, containers: ['app-t', 'app-u'], name: 'Tools 2' }) });
posted.length = 0;
w.fv3ResolveRenamedContainers(before, Object.fromEntries(Object.entries(RUNNING).map(([name, image]) => [name, { info: { Config: { Image: image } } }])), 'docker');

const sent = posted.map((p) => [p.file, p.fields.type, JSON.parse(p.fields.data)]);
check('the page posts one id update: the rename it found in Media and the image it learned for the older folder, and nothing of the folder it did not touch',
    JSON.stringify(sent) === JSON.stringify([['update_ids.php', 'docker', {
        abc: { renames: { 'app-old': 'app-new' }, identity: {} }, leg: { renames: {}, identity: { 'app-l': 'img/l' } } }]]), sent);
check('its own copy shows the rename at once', before.abc.containers.join() === 'app-a,app-new' && before.abc.containerImages['app-new'] === 'img/x'
    && before.abc.hidden_preview.join() === 'app-new', before.abc);

const answer = server('update_ids.php', 'POST', posted[0].fields);
const after = onDisk();
check('the server applies it to the folders as the other tab left them: Media keeps its new member, Tools its new name and member',
    answer === '{"success":true}' && after.abc.containers.join() === 'app-a,app-new,app-b' && after.def.containers.join() === 'app-t,app-u' && after.def.name === 'Tools 2', after);
check('the renamed container\'s image and hidden-preview entry moved with it, and the older folder now knows its container\'s image',
    JSON.stringify(after.abc.containerImages) === JSON.stringify({ 'app-a': 'img/a', 'app-new': 'img/x' }) && after.abc.hidden_preview.join() === 'app-new'
    && JSON.stringify(after.leg.containerImages) === JSON.stringify({ 'app-l': 'img/l' }), after);

const next = pageLoad(RUNNING);
check('the next page load has what it needs and learns the new members\' images once', posted.length === 1
    && JSON.stringify(JSON.parse(posted[0].fields.data)) === JSON.stringify({ abc: { renames: {}, identity: { 'app-b': 'img/b' } }, def: { renames: {}, identity: { 'app-u': 'img/u' } } })
    && next.abc.containers.join() === 'app-a,app-new,app-b', posted);
server('update_ids.php', 'POST', posted[0].fields);
pageLoad(RUNNING);
check('and the load after that posts nothing: the page and the file agree', posted.length === 0, posted);

fs.rmSync(tmp, { recursive: true, force: true });
done();
