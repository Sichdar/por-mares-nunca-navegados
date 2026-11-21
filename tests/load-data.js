// Reads the game's data files in Node (the browser fetches the same files).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/files.js';

export const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', rel), 'utf8'));
export function fightData(id = 'zeehond') {
  const fight = readData(`fights/${id}.json`);
  return { fight, map: readData(`maps/${fight.map}.json`), classes: readData('ships.json') };
}
