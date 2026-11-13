// node .github/scripts/name_order_test.js — the server's fv3_name_cmp() sorts names as the pages do in the browser
// (localeCompare(b, undefined, {numeric: true, sensitivity: 'base'})): the shipped PHP function against node's ICU on the same names (needs php)
'use strict';
const { execFileSync } = require('child_process');
const { check, done, read } = require('./preview_pages_harness.js');

// The shipped function, taken from lib.php as written
const fn = read('server/lib.php').match(/^ {4}function fv3_name_cmp\([\s\S]*?\n {4}}\n/m)[0];
const phpSort = (names) => JSON.parse(execFileSync('php', ['-r', `${fn} $l = json_decode(stream_get_contents(STDIN), true); usort($l, 'fv3_name_cmp'); echo json_encode($l);`],
    { input: JSON.stringify(names), encoding: 'utf8' }));
const browserSort = (names) => names.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

let seed = 11;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (s) => s[Math.floor(rnd() * s.length)];
// Every printable ASCII character, letters and digits weighted up so names read like names
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');
const name = () => Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => (rnd() < 0.55 ? pick('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') : rnd() < 0.5 ? pick('0123456789') : pick(ASCII))).join('');
const names = Array.from({ length: 400 }, name).concat(['Alpha 9', 'Alpha 10', 'alpha 09', '_Downloads', '-Tools', '[Media]', '~Misc', 'Apps', 'apps', 'zebra', '', ' x', 'x', '0', '00', '007', 'a1b2', 'A1B10']);

const php = phpSort(names);
const browser = browserSort(names);
const firstDiff = php.findIndex((n, i) => n !== browser[i]);
check(`${names.length} ASCII names (every printable character, digit runs, mixed case): the server sorts them as the browser does`,
    firstDiff === -1, firstDiff === -1 ? null : { at: firstDiff, php: php.slice(firstDiff, firstDiff + 4), browser: browser.slice(firstDiff, firstDiff + 4) });
check('names that start with punctuation come before letters, numbers by value, case ignored',
    JSON.stringify(phpSort(['Apps', '_Downloads', 'zebra', '[Media]', '~Misc', '-Tools', 'Alpha 10', 'alpha 9'])) === JSON.stringify(['_Downloads', '-Tools', '[Media]', '~Misc', 'alpha 9', 'Alpha 10', 'Apps', 'zebra']));
done();
