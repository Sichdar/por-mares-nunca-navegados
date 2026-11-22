// Trade runs with the real data (Node only, from tools/check.js): a simple trader bot
// plays mission 2 "Pepper for Cochin" by quick passages, to check test T5's target
// (Phase 11: profit in the 800–1,500 range; Phase 5: 800 gold before the monsoon),
// and checks that the obvious route the hints point to also wins.
// Also checks the data files fit together, and that every saved test save still loads.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../tools/files.js';
import { voyageData } from './load-data.js';
import { createVoyage, buy, sell, maxBuy, cargoOf, sailTo, payWages, profit, daysLeft, wagesDue } from '../src/sim/voyage.js';
import { pack, unpack } from '../src/save/saves.js';
import { quote } from '../src/sim/trade.js';

// Buy whatever earns most at the other port (by the real quotes), sell everything on arrival,
// pay wages in port, keep a little gold for food, buy nothing when the monsoon is too close.
function trader(D, V, keepGold = 150) {
  const goods = Object.keys(D.goods).filter((g) => D.goods[g].kind === 'good');
  const other = { cochin: 'quilon', quilon: 'cochin' };
  let trips = 0;
  while (!V.result && trips < 80) {
    for (const g of goods) if (cargoOf(V, g)) sell(V, D, g, cargoOf(V, g));
    if (wagesDue(V) && V.gold > wagesDue(V) + keepGold) payWages(V, D);
    const to = other[V.at];
    let best = null, bestGain = 0, bestN = 0;
    if (daysLeft(V) > 2) for (const g of goods) {
      const saved = V.gold; V.gold = Math.max(0, V.gold - keepGold);
      const n = maxBuy(V, D, g);
      V.gold = saved;
      // try amounts in steps of 5: the last units bought push the price up, so a full hold isn't always best
      for (let k = 5; k <= n; k += 5) {
        const gain = quote(D.goods, D.rules, V.ports[to].market, g, k, 'sell', V.difficulty)
          - quote(D.goods, D.rules, V.ports[V.at].market, g, k, 'buy', V.difficulty);
        if (gain > bestGain) { best = g; bestGain = gain; bestN = k; }
      }
    }
    if (best) buy(V, D, best, bestN);
    sailTo(V, D, to);
    trips++;
  }
  return trips;
}

// The obvious play: a full hold of pepper at Quilon, sell it all at Cochin, pay wages, repeat.
function obvious(D, V) {
  let peak = -Infinity;
  for (let trips = 0; !V.result && trips < 80; trips++) {
    if (cargoOf(V, 'pepper')) sell(V, D, 'pepper', cargoOf(V, 'pepper'));
    peak = Math.max(peak, profit(V));
    if (V.result) break;
    payWages(V, D);
    if (V.at === 'quilon') buy(V, D, 'pepper', maxBuy(V, D, 'pepper'));
    sailTo(V, D, V.at === 'quilon' ? 'cochin' : 'quilon');
  }
  return peak;
}

export function tradeReport() {
  const lines = [], checks = [], errors = [];
  const { D, mission } = voyageData('m2-pepper');

  // data fit together
  for (const [id, p] of Object.entries(D.ports)) {
    for (const g of Object.keys(D.goods)) if (!p.market[g]) errors.push(`ports.json: ${id} has no market line for ${g}`);
  }
  for (const [a, b] of D.routes) for (const p of [a, b]) if (!D.ports[p]) errors.push(`routes.json: unknown port ${p}`);
  for (const f of mission.fleet) if (!D.classes[f.cls] || !D.classes[f.cls].hold) errors.push(`mission fleet: class ${f.cls} missing or has no hold`);

  // 1. playing to the goal: how many days to 800 profit?
  const V = createVoyage(D, mission);
  const trips = trader(D, V);
  const won = V.result && V.result.kind === 'won';
  lines.push(`mission 2 bot: ${won ? 'won' : 'lost'} after ${trips} passages, day ${V.day - V.startDay} of ${V.day - V.startDay + daysLeft(V)}, profit ${profit(V)}`);
  checks.push({ ok: won, text: 'a plain pepper-and-cloth trader reaches 800 profit before the monsoon' });
  checks.push({ ok: won && V.day - V.startDay >= 10 && V.day - V.startDay <= 60, text: 'it takes some work: won between day 10 and day 60 of 92' });

  // 1b. the obvious route also wins (the hints point to it)
  const O = createVoyage(D, mission);
  obvious(D, O);
  const oWon = O.result && O.result.kind === 'won';
  lines.push(`obvious route (full hold of pepper, Quilon → Cochin): ${oWon ? 'won' : 'lost'} on day ${O.result.day - O.startDay}, profit ${profit(O)}`);
  checks.push({ ok: oWon, text: 'the obvious pepper route the hints point to also wins' });

  // 2. the whole season: how much can trade alone make before the monsoon?
  const W = createVoyage(D, { ...mission, goal: { ...mission.goal, gold: 1e9 } });
  trader(D, W);
  lines.push(`whole season by trade alone: profit ${profit(W)} in ${W.day - W.startDay} days`);
  checks.push({ ok: profit(W) >= 800 && profit(W) <= 2500, text: 'a full season of trade by one patacho stays modest (800–2,500), so fights and prizes still matter (P3)' });

  // saves kept from earlier versions still load
  const dir = path.join(ROOT, 'tests', 'saves');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    try { unpack(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { errors.push(`tests/saves/${f} no longer loads: ${e.message}`); }
  }
  return { lines, checks, errors, saves: files.length, sample: () => pack(createVoyage(D, mission), 'sample') };
}
