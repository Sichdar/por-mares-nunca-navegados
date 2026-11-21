// The list of game files: what the phone downloads, what the offline helper
// stores, and what goes into the test copy. Shared by check.js and stage-test.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Top-level files and folders that belong to the game itself.
const TOP_FILES = ['index.html', 'manifest.webmanifest'];
const TOP_DIRS = ['src', 'text', 'data', 'icons', 'fonts'];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// Game files relative to ROOT with forward slashes, sorted; sw.js not included.
export function gameFiles() {
  const out = [];
  for (const f of TOP_FILES) if (fs.existsSync(path.join(ROOT, f))) out.push(path.join(ROOT, f));
  for (const d of TOP_DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), out);
  return out.map((f) => path.relative(ROOT, f).split(path.sep).join('/')).sort();
}

// The FILES list written in sw.js.
export function swFiles() {
  const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = src.match(/const FILES = \[([\s\S]*?)\];/);
  if (!m) throw new Error('sw.js: FILES list not found');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

export function swVersion() {
  const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = src.match(/const VERSION = '([^']+)'/);
  return m ? m[1] : null;
}
