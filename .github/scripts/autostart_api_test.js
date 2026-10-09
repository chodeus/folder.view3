// node .github/scripts/autostart_api_test.js [plugin-dir] — the Autostart tab's save plan: API entries and UpdateConfig.php calls
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const plugin = process.argv[2] || path.join(__dirname, '..', '..', 'src/folder.view3/usr/local/emhttp/plugins/folder.view3');
const source = fs.readFileSync(path.join(plugin, 'scripts/folderview3.js'), 'utf8').split('\n');
// One top-level `const <name> = …` statement, up to its closing `};`: the rest of the file needs the settings page
const lift = (name) => {
    const start = source.findIndex((l) => l.startsWith(`const ${name} = `));
    if (start < 0) throw new Error(`scripts/folderview3.js: const ${name} not found`);
    const end = source.findIndex((l, i) => i > start && l === '};');
    return source.slice(start, end + 1).join('\n');
};
const names = ['fv3AsFileWaits', 'fv3AsWant', 'fv3AsUpdateConfigCalls', 'fv3AsApiEntries', 'fv3AsApiSave'];
let gql = () => Promise.reject(new Error('no answer set'));
const sentQueries = [];
const page = vm.createContext({ fv3GraphQL: (q, v) => { sentQueries.push({ q, v }); return gql(q, v); }, fv3DebugWarn: () => {} });
const { fv3AsWant, fv3AsUpdateConfigCalls, fv3AsApiEntries, fv3AsApiSave } =
    vm.runInContext(names.map(lift).join('\n') + `\n({ ${names.join(', ')} })`, page);

let failed = 0;
const check = (label, ok, detail) => {
    if (ok) { console.log(`ok   ${label}`); return; }
    failed++;
    console.log(`FAIL ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The loop fv3SubmitAutostart ran before the API path, kept as the reference for the UpdateConfig.php calls
const legacyCalls = (cur, snapshot, lines) => {
    const liveWaits = {};
    lines.forEach(e => { liveWaits[e.name] = e.wait || 0; });
    const calls = [];
    for (const [name, on] of Object.entries(cur.toggles)) {
        if ((snapshot.toggles[name] || false) === on) continue;
        const inFile = Object.prototype.hasOwnProperty.call(liveWaits, name);
        if (on === inFile) continue;
        calls.push({ name, on, wait: on ? (cur.waits[name] > 0 ? cur.waits[name] : '') : (liveWaits[name] > 0 ? liveWaits[name] : '') });
    }
    return calls;
};

const lines = [{ name: 'app-a', wait: 0 }, { name: 'app-b', wait: 30 }, { name: 'app-c', wait: 0 }, { name: 'app-x', wait: 5 }];
const snapshot = { toggles: { 'app-a': true, 'app-b': true, 'app-c': true, 'app-d': false, 'app-e': false, 'app-f': false } };
// c turned off, d turned on with a wait; app-e was enabled elsewhere after the tab loaded; app-x is in the file but not the tab
const cur = {
    toggles: { 'app-a': true, 'app-b': true, 'app-c': false, 'app-d': true, 'app-e': false, 'app-f': false },
    waits: { 'app-a': 0, 'app-b': 30, 'app-c': 0, 'app-d': 15, 'app-e': 0, 'app-f': 0 }
};
const liveWithE = [...lines, { name: 'app-e', wait: 0 }];
const want = fv3AsWant(cur, snapshot, liveWithE);
check('a changed toggle wants the tab, with its wait', same(want['app-c'], { on: false, wait: 0, touched: true }) && same(want['app-d'], { on: true, wait: 15, touched: true }), want);
check('an unchanged toggle keeps the file, with the file wait', same(want['app-b'], { on: true, wait: 30, touched: false }) && same(want['app-f'], { on: false, wait: 0, touched: false }), want);
check('an edit made elsewhere since the tab loaded survives', same(want['app-e'], { on: true, wait: 0, touched: false }), want);
check('a file line the tab does not list stays on', same(want['app-x'], { on: true, wait: 5, touched: false }), want);
check('an untouched name enabled elsewhere after the first read is never removed',
    !fv3AsUpdateConfigCalls(want, [...liveWithE, { name: 'app-f', wait: 0 }]).some((c) => c.name === 'app-f'));

check('UpdateConfig.php calls: only what differs, removal by the file wait',
    same(fv3AsUpdateConfigCalls(want, liveWithE), [{ name: 'app-c', on: false, wait: '' }, { name: 'app-d', on: true, wait: 15 }]),
    fv3AsUpdateConfigCalls(want, liveWithE));
const offB = fv3AsWant({ toggles: { ...cur.toggles, 'app-b': false }, waits: cur.waits }, snapshot, lines);
check('turning off a line with a wait matches it by that wait', same(fv3AsUpdateConfigCalls(offB, lines).find((c) => c.name === 'app-b'), { name: 'app-b', on: false, wait: 30 }));
const dropped = lines.filter((e) => e.name !== 'app-a' && e.name !== 'app-x');
check('after an API write that dropped unchanged lines, the calls put them back with their waits',
    same(fv3AsUpdateConfigCalls(want, dropped).filter((c) => c.on).map((c) => [c.name, c.wait]), [['app-a', ''], ['app-d', 15], ['app-e', ''], ['app-x', 5]]),
    fv3AsUpdateConfigCalls(want, dropped));
check('nothing to do when the file already matches', fv3AsUpdateConfigCalls(want, [{ name: 'app-a', wait: 0 }, { name: 'app-b', wait: 30 }, { name: 'app-x', wait: 5 }, { name: 'app-e', wait: 0 }, { name: 'app-d', wait: 15 }]).length === 0);

// Without an API write the calls must be the old loop's, call for call (mulberry32: plain LCG low bits repeat)
let seed = 7;
const rand = (n) => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
};
let mismatch = null;
const seen = { removeByFileWait: 0, addWithWait: 0, repeatedLine: 0, untouched: 0 };
for (let trial = 0; trial < 3000 && !mismatch; trial++) {
    const pool = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'];
    const t = { toggles: {}, waits: {} };
    const s = { toggles: {} };
    const file = [];
    pool.forEach((n) => {
        if (rand(5)) { t.toggles[n] = !!rand(2); t.waits[n] = [0, 0, 7, 60][rand(4)]; }
        if (rand(4)) s.toggles[n] = !!rand(2);
        if (rand(2)) file.push({ name: n, wait: [0, 3, 0][rand(3)] });
    });
    if (rand(6) === 0 && file.length) file.push({ ...file[0], wait: 9 });
    const got = fv3AsUpdateConfigCalls(fv3AsWant(t, s, file), file);
    const ref = legacyCalls(t, s, file);
    if (!same(got, ref)) mismatch = { t, s, file, got, ref };
    ref.forEach((c) => {
        if (!c.on && c.wait !== '' && c.wait !== t.waits[c.name]) seen.removeByFileWait++;
        if (c.on && c.wait !== '') seen.addWithWait++;
        if (!c.on && file.filter((e) => e.name === c.name).length > 1) seen.repeatedLine++;
    });
    if (!ref.length) seen.untouched++;
}
check('without an API write, the calls equal the old loop over 3000 random tabs and files', mismatch === null, mismatch);
check('and those trials remove by a file wait the tab differs on, add with waits, remove a repeated line, and leave files alone',
    Object.values(seen).every((v) => v >= 50), seen);

const containers = [
    { id: 'id-a', names: ['/app-a'] }, { id: 'id-b', names: ['/app-b'] }, { id: 'id-c', names: ['/app-c'] },
    { id: 'id-d', names: ['app-d'] }, { id: 'id-e', names: ['/app-e'] }, { id: 'id-x', names: ['/app-x', '/alias'] },
    { id: 'id-a2', names: ['/app-a'] }, null, { id: 5, names: ['/app-n'] }, { id: 'id-s', names: 'app-s' }
];
const entries = fv3AsApiEntries(want, liveWithE, containers);
check('API entries: file order, newly enabled last, with waits',
    same(entries, [
        { id: 'id-a', autoStart: true, wait: 0 }, { id: 'id-b', autoStart: true, wait: 30 }, { id: 'id-x', autoStart: true, wait: 5 },
        { id: 'id-e', autoStart: true, wait: 0 }, { id: 'id-d', autoStart: true, wait: 15 }
    ]), entries);
check('a wanted name without an API id stops the API write', fv3AsApiEntries(want, liveWithE, containers.filter((c) => !c || c.id !== 'id-b')) === null);
check('an empty container list stops it', fv3AsApiEntries(want, liveWithE, []) === null && fv3AsApiEntries(want, liveWithE, undefined) === null);
check('a name that is off needs no id', same(fv3AsApiEntries(want, liveWithE, containers.filter((c) => !c || c.id !== 'id-c')), entries));
check('only the first name counts', fv3AsApiEntries({ alias: { on: true, wait: 0 } }, [], containers) === null);
check('a malformed container is skipped', fv3AsApiEntries({ 'app-n': { on: true, wait: 0 } }, [], containers) === null
    && fv3AsApiEntries({ 'app-s': { on: true, wait: 0 } }, [], containers) === null);
check('everything off is an empty list, which needs no ids', same(fv3AsApiEntries({ 'app-a': { on: false, wait: 0 } }, [{ name: 'app-a', wait: 0 }], []), []));
check('a file line missing from the wanted state stops it', fv3AsApiEntries({}, [{ name: 'app-a', wait: 0 }], containers) === null
    && fv3AsApiEntries({}, [{ name: 'constructor', wait: 0 }], containers) === null);
check('a repeated file line is one entry', same(fv3AsApiEntries({ 'app-a': { on: true, wait: 0 } }, [{ name: 'app-a', wait: 0 }, { name: 'app-a', wait: 0 }], containers), [{ id: 'id-a', autoStart: true, wait: 0 }]));
check('a wait that is not positive is 0', same(fv3AsApiEntries({ 'app-a': { on: true, wait: -4 } }, [], containers), [{ id: 'id-a', autoStart: true, wait: 0 }]));
check('a name shaped like an Object property is no id', fv3AsApiEntries({ constructor: { on: true, wait: 0 } }, [], containers) === null);

// fv3AsApiSave's answer decides whether the file is re-read and repaired: true once the mutation went out
(async () => {
    const isMutation = (q) => q.startsWith('mutation');
    const answer = (containers, mutation) => (q) => (isMutation(q) ? mutation() : Promise.resolve({ docker: { containers } }));
    const run = async (containers, mutation) => {
        sentQueries.length = 0;
        gql = answer(containers, mutation);
        const sent = await fv3AsApiSave(want, liveWithE);
        return { sent, mutations: sentQueries.filter((c) => isMutation(c.q)).length };
    };
    const ok = () => Promise.resolve({ docker: { updateAutostartConfiguration: true } });
    const fail = () => Promise.reject(new Error('GraphQL HTTP 502'));
    check('a written save answers true', same(await run(containers, ok), { sent: true, mutations: 1 }));
    const mutation = sentQueries.find((c) => isMutation(c.q));
    check('and sends the built entries as $entries: ids, waits, order', same(mutation.v, { entries })
        && mutation.q.includes('mutation($entries: [DockerAutostartEntryInput!]!)') && mutation.q.includes('updateAutostartConfiguration(entries: $entries)'), mutation);
    check('a mutation that fails still answers true, since it may have written', same(await run(containers, fail), { sent: true, mutations: 1 }));
    check('a missing id sends no mutation and answers false', same(await run(containers.filter((c) => !c || c.id !== 'id-b'), ok), { sent: false, mutations: 0 }));
    sentQueries.length = 0;
    gql = () => Promise.reject(new Error('Cannot query field "containers"'));
    check('a failed container read answers false', (await fv3AsApiSave(want, liveWithE)) === false && !sentQueries.some((c) => isMutation(c.q)));

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
