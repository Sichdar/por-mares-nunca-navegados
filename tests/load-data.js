// Reads the game's data files in Node (the browser fetches the same files).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/files.js';

export const readData = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', rel), 'utf8'));
export function fightData(id = 'zeehond') {
  const fight = readData(`fights/${id}.json`);
  return { fight, map: readData(`maps/${fight.map}.json`), classes: readData('ships.json') };
}

// Everything a voyage needs (src/sim/voyage.js "D"), plus one mission.
export function voyageData(missionId = 'm2-pepper') {
  const g = readData('goods.json');
  return {
    D: { goods: g.goods, rules: g.rules, ports: readData('ports.json').ports, classes: readData('ships.json'), routes: readData('routes.json').routes },
    mission: readData(`missions/${missionId}.json`),
  };
}
