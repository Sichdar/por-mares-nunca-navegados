// Runs every automatic check in one go (Phase 8): `node tools/check.js`
// Exit code 0 = all passed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, gameFiles, swFiles, swVersion } from './files.js';
import { tests } from '../tests/sim-tests.js';
import { balanceReport } from '../tests/balance.js';
import { checkTexts } from '../tests/text-check.js';
import { VERSION } from '../src/version.js';

let failed = 0;
const ok = (msg) => console.log('  ✓ ' + msg);
const bad = (msg) => { failed++; console.log('  ✗ ' + msg); };

console.log('Rule tests');
for (const { name, fn } of tests) {
  try { await fn(); ok(name); } catch (e) { bad(`${name}: ${e.message}`); }
}

console.log('Balance runs (16 bot fights each; targets are for tuning, so they warn but never fail)');
const bal = balanceReport(16);
bal.lines.forEach((l) => console.log('  · ' + l));
bal.checks.forEach((c) => console.log((c.ok ? '  ✓ ' : '  ! ') + c.text));

console.log('Text check (en / pt)');
const report = checkTexts();
report.errors.forEach(bad);
report.warnings.forEach((w) => console.log('  ! ' + w));
if (!report.errors.length) ok(`${report.keyCount} keys in both languages, all used keys present`);

console.log('Offline helper');
const listed = swFiles().filter((f) => f !== './');
const present = gameFiles();
const missing = present.filter((f) => !listed.includes(f));
const extra = listed.filter((f) => !present.includes(f));
if (missing.length) bad('game files missing from sw.js FILES: ' + missing.join(', '));
if (extra.length) bad('sw.js FILES lists files that do not exist: ' + extra.join(', '));
if (!missing.length && !extra.length) ok(`sw.js lists all ${present.length} game files`);
if (swVersion() === VERSION) ok(`sw.js version matches src/version.js (${VERSION})`);
else bad(`sw.js version ${swVersion()} ≠ src/version.js ${VERSION}`);

console.log('Page');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (/Content-Security-Policy/.test(html)) ok('content security policy present');
else bad('index.html has no content security policy');
if (/https?:\/\//.test(html.replace(/http-equiv="Content-Security-Policy"[^>]*>/, ''))) bad('index.html loads something from outside');
else ok('index.html loads nothing from outside');

console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
