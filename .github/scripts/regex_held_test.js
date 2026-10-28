// node .github/scripts/regex_held_test.js [plugin-dir] — which containers the folder editor treats as held by another folder's regex, run from the page source
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
// One top-level `window.<name> = …` statement (one line, or up to the first closing line at its own indent): the rest of folder.js needs a page
const lift = (rel, name) => {
    const lines = fs.readFileSync(path.join(plugin, rel), 'utf8').split('\n');
    const start = lines.findIndex((l) => l.trimStart().startsWith(`window.${name} = `));
    if (start < 0) throw new Error(`${rel}: window.${name} not found`);
    if (lines[start].trimEnd().endsWith(';')) return lines[start];
    const indent = lines[start].match(/^\s*/)[0];
    const end = lines.findIndex((l, i) => i > start && l === `${indent}};`);
    return lines.slice(start, end + 1).join('\n');
};
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const name of ['fv3RegexHeld', 'fv3RegexRowHolders', 'fv3RegexRowVisible']) vm.runInContext(lift('scripts/folder.js', name), ctx);

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};

const names = ['immich_server', 'immich_postgres', 'nextcloud-aio-mastercontainer', 'penpot-frontend', 'ci-runner-1', 'plex', 'sonarr', 'backup'];
const held = (regexes, list = names) => {
    const map = ctx.fv3RegexHeld(regexes.map((regex, i) => ({ name: `F${i}`, regex })), list);
    return Object.fromEntries([...map].map(([n, hs]) => [n, hs.map((h) => h.name)]));
};
const none = (map) => Object.keys(map).length === 0;

for (const r of ['^', '.*', '.', '.+', '^(?!backup)', 'x?', '^$']) {
    check(`a catch-all ${r} holds nothing, so its members stay pickable`, none(held([r])), held([r]));
}
// These also match an empty name, but only because they are anchored at both ends
check('^(plex)?$ is specific: it holds plex', JSON.stringify(held(['^(plex)?$'])) === '{"plex":["F0"]}', held(['^(plex)?$']));
check('plex|^$ is specific: it holds plex', JSON.stringify(held(['plex|^$'])) === '{"plex":["F0"]}', held(['plex|^$']));
const specific = held(['^immich']);
check('a specific regex holds exactly what it matches', JSON.stringify(specific) === JSON.stringify({ immich_server: ['F0'], immich_postgres: ['F0'] }), specific);
const holder = ctx.fv3RegexHeld([{ name: 'Immich', regex: '^immich' }], names).get('immich_server');
check('each holder carries its folder name and regex for the tag', JSON.stringify(holder) === JSON.stringify([{ name: 'Immich', regex: '^immich' }]), holder);
const both = held(['^immich', 'postgres$', '^']);
check('two specific regexes on one container are both named, in folder order; the catch-all is not', JSON.stringify(both.immich_postgres) === '["F0","F1"]' && JSON.stringify(both.immich_server) === '["F0"]', both);
check('a regex matching nothing holds nothing', none(held(['^jellyfin'])));
check('matching is case-sensitive, as on the Docker page', none(held(['^Immich'])));
check('an invalid regex is skipped, as on the Docker page', JSON.stringify(held(['[', 'plex'])) === '{"plex":["F1"]}', held(['[', 'plex']));
// VM names can hold spaces, so a blank regex would match some of them; the Docker page skips it
const vms = ['Windows 11', 'Home Assistant', 'debian', 'app5'];
const blank = ctx.fv3RegexHeld([{ name: 'A' }, { name: 'B', regex: '' }, { name: 'C', regex: ' ' }, { name: 'D', regex: null }, { name: 'E', regex: 5 }], vms);
check('a missing, empty, blank or non-string regex holds nothing', blank.size === 0, [...blank.keys()]);
check('with one container, a specific regex matching it still holds it', JSON.stringify(held(['^plex'], ['plex'])) === '{"plex":["F0"]}', held(['^plex'], ['plex']));
check('a specific regex matching every installed container still holds them', Object.keys(held(['^(immich|plex)'], ['immich_server', 'plex'])).length === 2);
check('with no containers, nothing is held', none(held(['^plex'], [])));

const map = ctx.fv3RegexHeld([{ name: 'Immich', regex: '^immich' }], names);
const folderNames = new Set(['Immich', 'Penpot']);
const rowHolders = (el, fldName = 'Apps') => ctx.fv3RegexRowHolders(el, fldName, map, folderNames);
check('a held row lists its holders', JSON.stringify(rowHolders({ Name: 'immich_server' })) === '[{"name":"Immich","regex":"^immich"}]', rowHolders({ Name: 'immich_server' }));
check('a row no regex holds has no holders', rowHolders({ Name: 'plex' }) === undefined);
check('a row labelled for another folder has no regex holders (the label wins)', rowHolders({ Name: 'immich_server', Label: 'Penpot' }) === undefined);
check('a row labelled for this folder, even unsaved, has no regex holders', rowHolders({ Name: 'immich_server', Label: 'Apps' }) === undefined);
check('a label naming no folder claims nothing, so the regex still holds it', rowHolders({ Name: 'immich_server', Label: 'Gone' }) !== undefined);

const visible = (toggle, ticked = false, before = false) => ctx.fv3RegexRowVisible(toggle, ticked, before);
check('a held row hides while the tick box is off', visible({ checked: false }) === false);
check('the tick box shows it', visible({ checked: true }) === true);
check('a row ticked here stays visible with the box off', visible({ checked: false }, true) === true);
check('a row ticked before a regex edit reset stays visible', visible({ checked: false }, false, true) === true);
check('with no tick box on the page, nothing stays hidden', visible(null) === true);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
