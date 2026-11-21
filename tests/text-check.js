// Text check (Phase 8): both languages have the same keys and the same {placeholders},
// every key the code uses exists, and unused keys are listed.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/files.js';
import { flatten } from '../src/text/i18n.js';

function readTable(lang) {
  return flatten(JSON.parse(fs.readFileSync(path.join(ROOT, 'text', `${lang}.json`), 'utf8')));
}

function codeFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) codeFiles(full, out);
    else if (/\.(js|html)$/.test(e.name)) out.push(full);
  }
  return out;
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

export function checkTexts() {
  const errors = [], warnings = [];
  const en = readTable('en'), pt = readTable('pt');
  for (const k of Object.keys(en)) {
    if (!(k in pt)) errors.push(`pt.json is missing "${k}"`);
    else if (placeholders(en[k]) !== placeholders(pt[k])) errors.push(`"${k}": {placeholders} differ between en and pt`);
    if (k in pt && !pt[k].trim()) errors.push(`pt.json "${k}" is empty`);
  }
  for (const k of Object.keys(pt)) if (!(k in en)) errors.push(`en.json is missing "${k}"`);

  const used = new Set();
  for (const f of codeFiles(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  for (const k of used) if (!(k in en)) errors.push(`code uses "${k}", which is in no text table`);
  for (const k of Object.keys(en)) if (!used.has(k)) warnings.push(`unused text key "${k}"`);
  return { errors, warnings, keyCount: Object.keys(en).length };
}
