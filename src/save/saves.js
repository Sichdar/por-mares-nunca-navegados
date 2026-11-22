// Campaign saves (Phase 8): the autosave plus 3 slots in the browser's database,
// and a file to export and import (the backup, and the way to move to another phone).
// Safe writing: the new save is written beside the old one, read back and compared,
// and only then put in place, so closing the browser mid-save can't break it.
import * as store from './store.js';
import { SAVE_VERSION, migrate } from './migrate.js';

export const FORMAT = 'pmnn-save';
export const SLOTS = ['auto', '1', '2', '3'];
const key = (slot) => 'save.' + slot;

// A save is a small wrapper around a copy of the voyage state.
export function pack(V, gameVersion) {
  return {
    format: FORMAT, v: SAVE_VERSION, game: gameVersion, savedAt: new Date().toISOString(),
    where: { day: V.day, port: V.at, mission: V.mission },
    state: JSON.parse(JSON.stringify(V)),
  };
}

// Reads a save (from the database or a file) and returns the voyage state, upgraded
// to this version. Throws an Error whose message is a reason key: notSave, tooNew, broken.
export function unpack(obj) {
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { throw new Error('notSave'); }
  }
  if (!obj || obj.format !== FORMAT || typeof obj.v !== 'number' || !obj.state) throw new Error('notSave');
  if (obj.v > SAVE_VERSION) throw new Error('tooNew');
  const state = migrate(JSON.parse(JSON.stringify(obj.state)), obj.v);
  if (!Array.isArray(state.fleet) || !state.fleet.length || typeof state.day !== 'number' || !state.ports) throw new Error('broken');
  return state;
}

export async function write(slot, V, gameVersion) {
  const doc = pack(V, gameVersion);
  const text = JSON.stringify(doc);
  await store.set(key(slot) + '.new', doc);
  const back = await store.get(key(slot) + '.new');
  if (JSON.stringify(back) !== text) throw new Error('writeFailed');
  await store.set(key(slot), doc);
  await store.del(key(slot) + '.new');
  return doc;
}

// The save in a slot (wrapper with `where` and `savedAt`), or null.
export async function peek(slot) {
  const doc = await store.get(key(slot));
  if (doc) return doc;
  // a save that was half put in place: the checked copy is still there
  const pending = await store.get(key(slot) + '.new');
  return pending || null;
}

export async function read(slot) {
  const doc = await peek(slot);
  return doc ? unpack(doc) : null;
}

export async function remove(slot) {
  await store.del(key(slot));
  await store.del(key(slot) + '.new');
}

// ---- files ----
export function fileName(doc) {
  const stamp = doc.savedAt.slice(0, 16).replace(/[:T]/g, '-');
  return `por-mares-save-${stamp}.json`;
}

export function exportFile(doc) {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName(doc);
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Opens the phone's file picker; resolves with the file's text, or null if cancelled.
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    });
    input.click();
  });
}
