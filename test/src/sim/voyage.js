// The voyage: everything a campaign keeps between screens (GDD Phases 2, 5, 8):
// date, gold, the fleet with its cargo and stores, every port's market, the
// mission and its goal, and the dice. It is plain data, so a save is just a copy.
//
// D (the data) = { goods, rules, ports, classes, routes } from data/*.json.
// Functions that can refuse return null when done, or a reason key ('noGold', …).
import { createRng } from './rng.js';
import { parseDay, ymd, season, portOpen, daysToMonsoon, atSeaDamagePerDay } from './calendar.js';
import { makeMarket, quote, affordable, move, drift, shownPrice } from './trade.js';

export const STORES = ['powder', 'food'];

export function newShip(D, def) {
  const cls = D.classes[def.cls];
  if (!cls) throw new Error('unknown ship class ' + def.cls);
  const foodMax = Math.round(cls.crew * D.rules.foodPerSailorDay * D.rules.foodDaysCarried);
  return {
    id: def.id, name: def.name, cls: def.cls,
    hull: cls.hull, hullMax: cls.hull, sails: 100,
    crew: def.crew ?? cls.crew, crewMax: cls.crew, morale: def.morale ?? 70,
    powder: Math.round(cls.powder * (def.powder ?? 1)), powderMax: cls.powder,
    food: Math.round(foodMax * (def.food ?? 1)), foodMax,
    hold: cls.hold, cargo: {},
  };
}

export function createVoyage(D, mission, seed = 1638) {
  const day = parseDay(mission.start.date);
  const V = {
    mission: mission.id, map: mission.map, seed, rng: createRng(seed).getState(),
    day, startDay: day, difficulty: mission.start.difficulty || 'captain',
    gold: mission.start.gold, startGold: mission.start.gold,
    fleet: mission.fleet.map((f) => newShip(D, f)),
    ports: {}, at: mission.start.port, wagesOwed: 0,
    goal: { ...mission.goal }, result: null,
    stats: { bought: 0, sold: 0, repairs: 0, wages: 0, hired: 0, days: 0 },
    hinted: {},
  };
  for (const [id, p] of Object.entries(D.ports)) {
    if (p.map !== mission.map) continue;
    V.ports[id] = { market: makeMarket(p, (mission.markets || {})[id]), visits: 0 };
  }
  V.ports[V.at].visits = 1;
  return V;
}

// ---- cargo ----
export const cargoUsed = (s) => Object.values(s.cargo).reduce((a, n) => a + n, 0);
export const holdSize = (V) => V.fleet.reduce((a, s) => a + s.hold, 0);
export const holdUsed = (V) => V.fleet.reduce((a, s) => a + cargoUsed(s), 0);
export const cargoOf = (V, good) => V.fleet.reduce((a, s) => a + (s.cargo[good] || 0), 0);
export const storeOf = (V, good) => V.fleet.reduce((a, s) => a + s[good], 0);
export const storeRoom = (V, good) => V.fleet.reduce((a, s) => a + s[good + 'Max'] - s[good], 0);
export const isStore = (good) => STORES.includes(good);

function loadCargo(V, good, n) {
  for (const s of V.fleet) {
    const k = Math.min(n, s.hold - cargoUsed(s));
    if (k > 0) { s.cargo[good] = (s.cargo[good] || 0) + k; n -= k; }
  }
}
function unloadCargo(V, good, n) {
  for (const s of V.fleet) {
    const k = Math.min(n, s.cargo[good] || 0);
    if (k > 0) { s.cargo[good] -= k; if (!s.cargo[good]) delete s.cargo[good]; n -= k; }
  }
}
function addStore(V, good, n) {
  for (const s of V.fleet) { const k = Math.min(n, s[good + 'Max'] - s[good]); s[good] += k; n -= k; }
}
function takeStore(V, good, n) {
  for (const s of V.fleet) { const k = Math.min(n, s[good]); s[good] -= k; n -= k; }
}

// ---- the port ----
export const here = (V) => (V.at ? V.ports[V.at] : null);

export function canTrade(V, D) {
  if (V.result) return 'over';
  if (!V.at) return 'atSea';
  if (!portOpen(D.ports[V.at], V.day)) return 'closed';
  return null;
}

export function price(V, D, good, side) {
  return shownPrice(D.goods, D.rules, here(V).market, good, side, V.difficulty);
}

// The most units of `good` that can be bought now (gold, stock and room allow).
export function maxBuy(V, D, good) {
  if (canTrade(V, D)) return 0;
  const room = isStore(good) ? storeRoom(V, good) : holdSize(V) - holdUsed(V);
  return affordable(D.goods, D.rules, here(V).market, good, V.gold, room, V.difficulty);
}

export function buy(V, D, good, n) {
  const why = canTrade(V, D);
  if (why) return why;
  const market = here(V).market;
  if (!market[good]) return 'noGood';
  if (market[good].s < n) return 'noStock';
  const room = isStore(good) ? storeRoom(V, good) : holdSize(V) - holdUsed(V);
  if (n > room) return isStore(good) ? 'storesFull' : 'holdFull';
  const cost = quote(D.goods, D.rules, market, good, n, 'buy', V.difficulty);
  if (cost > V.gold) return 'noGold';
  move(market, good, n, 'buy');
  V.gold -= cost; V.stats.bought += cost;
  if (isStore(good)) addStore(V, good, n); else loadCargo(V, good, n);
  checkGoal(V);
  return null;
}

export function sell(V, D, good, n) {
  const why = canTrade(V, D);
  if (why) return why;
  const market = here(V).market;
  if (!market[good]) return 'noGood';
  const have = isStore(good) ? storeOf(V, good) : cargoOf(V, good);
  if (n > have) return 'noCargo';
  const gain = quote(D.goods, D.rules, market, good, n, 'sell', V.difficulty);
  move(market, good, n, 'sell');
  V.gold += gain; V.stats.sold += gain;
  if (isStore(good)) takeStore(V, good, n); else unloadCargo(V, good, n);
  checkGoal(V);
  return null;
}

// ---- shipyard and tavern ----
const hasService = (V, D, k) => !!V.at && D.ports[V.at].services.includes(k);

export function repairCost(V, D) {
  return V.fleet.reduce((a, s) => a + Math.ceil((s.hullMax - s.hull) * D.rules.repairPerHull + (100 - s.sails) * D.rules.repairPerSail), 0);
}
export function repairAll(V, D) {
  const why = canTrade(V, D) || (hasService(V, D, 'shipyard') ? null : 'noShipyard');
  if (why) return why;
  const cost = repairCost(V, D);
  if (!cost) return 'nothingToDo';
  if (cost > V.gold) return 'noGold';
  V.gold -= cost; V.stats.repairs += cost;
  for (const s of V.fleet) { s.hull = s.hullMax; s.sails = 100; }
  return null;
}

export const crewNeeded = (V) => V.fleet.reduce((a, s) => a + s.crewMax - s.crew, 0);
export const hireCost = (V, D, n = crewNeeded(V)) => n * D.rules.hirePerSailor;
export function hireCrew(V, D) {
  const why = canTrade(V, D) || (hasService(V, D, 'tavern') ? null : 'noTavern');
  if (why) return why;
  const n = crewNeeded(V);
  if (!n) return 'nothingToDo';
  const cost = hireCost(V, D, n);
  if (cost > V.gold) return 'noGold';
  V.gold -= cost; V.stats.hired += n;
  for (const s of V.fleet) s.crew = s.crewMax;
  return null;
}

export const monthlyWages = (V, D) => V.fleet.reduce((a, s) => a + s.crew, 0) * D.rules.wagePerSailorMonth;
export const wagesDue = (V) => Math.ceil(V.wagesOwed);
export function payWages(V, D) {
  const why = canTrade(V, D);
  if (why) return why;
  const due = wagesDue(V);
  if (!due) return 'nothingToDo';
  if (due > V.gold) return 'noGold';
  V.gold -= due; V.stats.wages += due; V.wagesOwed = 0;
  checkGoal(V);
  return null;
}

// ---- time ----
// One day passes (in port or at sea): markets drift, the crew eat and earn wages,
// the monsoon batters ships at sea. Returns what happened, for the screen.
export function passDay(V, D) {
  const notes = [];
  V.day++; V.stats.days++;
  for (const p of Object.values(V.ports)) drift(p.market, D.rules, 1);
  const owedBefore = V.wagesOwed;
  V.wagesOwed += monthlyWages(V, D) / 30;
  const unpaid = owedBefore > monthlyWages(V, D);
  for (const s of V.fleet) {
    const eat = s.crew * D.rules.foodPerSailorDay;
    if (s.food >= eat) s.food = Math.round((s.food - eat) * 100) / 100;
    else { s.food = 0; s.morale = Math.max(0, s.morale - 5); notes.push('hungry'); }
    if (unpaid) { s.morale = Math.max(0, s.morale - 3); notes.push('unpaid'); }
    const dmg = V.at ? 0 : atSeaDamagePerDay(V.day);
    if (dmg) { s.hull = Math.max(1, s.hull - s.hullMax * dmg); notes.push('storm'); }
  }
  checkGoal(V);
  return [...new Set(notes)];
}

export function leavePort(V) { V.at = null; }

export function enterPort(V, D, id) {
  if (!V.ports[id]) return 'notHere';
  if (!portOpen(D.ports[id], V.day)) return 'closed';
  V.at = id; V.ports[id].visits++;
  return null;
}

// Neighbouring ports on this map and the days to each (data/routes.json).
export function passages(V, D) {
  const from = V.at, out = [];
  for (const [a, b, days] of D.routes) {
    const to = a === from ? b : b === from ? a : null;
    if (to && V.ports[to]) out.push({ to, days });
  }
  return out;
}

// A quick passage to a neighbouring port: the days pass at sea, then the ship comes in.
export function sailTo(V, D, to) {
  if (V.result) return { why: 'over' };
  const p = passages(V, D).find((x) => x.to === to);
  if (!p) return { why: 'noRoute' };
  leavePort(V);
  const notes = new Set();
  for (let i = 0; i < p.days && !V.result; i++) passDay(V, D).forEach((n) => notes.add(n));
  const why = V.result ? null : enterPort(V, D, to);
  if (why) V.at = to; // closed by the monsoon: the ship waits off the port
  return { why, notes: [...notes], days: p.days };
}

// ---- the goal ----
// Unpaid wages count against the profit, so skipping pay day never "earns" anything.
export const profit = (V) => V.gold - V.startGold - wagesDue(V);

export function deadline(V) {
  if (V.goal.by === 'monsoon') return V.startDay + daysToMonsoon(V.startDay);
  return V.goal.byDay ?? Infinity;
}
export const daysLeft = (V) => Math.max(0, deadline(V) - V.day);

export function checkGoal(V) {
  if (V.result) return V.result;
  if (V.goal.type === 'profit' && profit(V) >= V.goal.gold) V.result = { kind: 'won', day: V.day, profit: profit(V) };
  else if (V.day >= deadline(V)) V.result = { kind: 'lost', why: 'monsoon', day: V.day, profit: profit(V) };
  return V.result;
}

export { season, ymd };
