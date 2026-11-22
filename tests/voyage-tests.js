// Rule tests for M2: calendar and monsoon, trade prices, the voyage (gold, cargo,
// wages, repairs, days passing, the profit goal) and saves. Built with small data
// written here, so they also run in the browser (tests/run.html).
import { dayOf, ymd, parseDay, season, portOpen, daysToMonsoon, reopenDay } from '../src/sim/calendar.js';
import { priceAt, quote, shownPrice, drift, makeMarket, affordable } from '../src/sim/trade.js';
import {
  createVoyage, buy, sell, maxBuy, cargoOf, holdUsed, passDay, sailTo, repairAll, repairCost, hireCrew,
  payWages, wagesDue, profit, daysLeft, enterPort,
} from '../src/sim/voyage.js';
import { pack, unpack } from '../src/save/saves.js';
import { SAVE_VERSION } from '../src/save/migrate.js';

function equal(a, b, what) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function check(cond, what) { if (!cond) throw new Error(what); }

const RULES = {
  priceSwing: 0.6, priceMin: 0.4, priceMax: 2.5, driftPerDay: 0.05, wagePerSailorMonth: 2,
  repairPerHull: 10, repairPerSail: 3, hirePerSailor: 4, foodPerSailorDay: 0.02, foodDaysCarried: 30,
};
const GOODS = { pepper: { base: 20 }, cloth: { base: 15 }, powder: { base: 5 }, food: { base: 2 } };
const market = (pepper, cloth) => ({
  pepper: { t: 150, s: pepper }, cloth: { t: 150, s: cloth }, powder: { t: 100, s: 1 }, food: { t: 200, s: 1 },
});
const D = {
  goods: GOODS, rules: RULES,
  classes: { patacho: { guns: 10, hull: 100, crew: 150, powder: 40, hold: 80 } },
  ports: {
    quilon: { map: 'm', monsoonClosed: true, services: ['market', 'shipyard', 'tavern'], market: market(1.6, 0.5) },
    cochin: { map: 'm', monsoonClosed: true, services: ['market', 'tavern'], market: market(1.0, 1.5) },
    goa: { map: 'other', monsoonClosed: true, services: ['market'], market: market(0.5, 1) },
  },
  routes: [['quilon', 'cochin', 2], ['cochin', 'goa', 5]],
};
const MISSION = {
  id: 'test', map: 'm', start: { date: '1638-03-01', port: 'quilon', gold: 1000 },
  fleet: [{ id: 'p1', name: 'São Brás', cls: 'patacho' }],
  markets: { cochin: { pepper: 0.45 } }, goal: { type: 'profit', gold: 800, by: 'monsoon' },
};
const voyage = () => createVoyage(D, MISSION);

export const voyageTests = [
  {
    name: 'calendar: day numbers and dates convert both ways (1498–1663, leap years)',
    fn() {
      for (const [y, m, d] of [[1498, 5, 20], [1600, 2, 29], [1638, 3, 1], [1640, 12, 31], [1663, 1, 7], [1970, 1, 1]]) {
        equal(ymd(dayOf(y, m, d)), { y, m, d }, `${y}-${m}-${d}`);
      }
      equal(dayOf(1970, 1, 1), 0, 'day 0');
      equal(parseDay('1638-03-01') + 1, dayOf(1638, 3, 2), 'next day');
      equal(dayOf(1700, 3, 1) - dayOf(1700, 2, 28), 1, '1700 is not a leap year');
      equal(dayOf(1600, 3, 1) - dayOf(1600, 2, 28), 2, '1600 is a leap year');
    },
  },
  {
    name: 'monsoon: north-east Oct–Apr, unsettled May, south-west Jun–Sep closes the ports',
    fn() {
      equal(season(parseDay('1638-03-01')), 'ne', 'March');
      equal(season(parseDay('1638-05-15')), 'turning', 'May');
      equal(season(parseDay('1638-07-01')), 'sw', 'July');
      equal(season(parseDay('1638-10-01')), 'ne', 'October');
      const port = { monsoonClosed: true };
      check(portOpen(port, parseDay('1638-05-31')), 'open on 31 May');
      check(!portOpen(port, parseDay('1638-06-01')), 'closed on 1 June');
      equal(daysToMonsoon(parseDay('1638-03-01')), 92, 'days from 1 March to 1 June');
      equal(daysToMonsoon(parseDay('1638-11-01')), parseDay('1639-06-01') - parseDay('1638-11-01'), 'from November: next year');
      equal(ymd(reopenDay(parseDay('1638-07-10'))), { y: 1638, m: 10, d: 1 }, 'reopens 1 October');
    },
  },
  {
    name: 'trade: price follows the stock and stays between 0.4× and 2.5× the base price',
    fn() {
      equal(priceAt(GOODS, RULES, 'pepper', 100, 100), 20, 'at target = base');
      equal(priceAt(GOODS, RULES, 'pepper', 100, 50), 26, 'half stock: 20 × 1.3');
      equal(priceAt(GOODS, RULES, 'pepper', 100, 150), 14, 'half over: 20 × 0.7');
      equal(priceAt(GOODS, RULES, 'pepper', 100, 10000), 8, 'floor 0.4×');
      equal(priceAt(GOODS, RULES, 'pepper', 100, -10000), 50, 'ceiling 2.5×');
      check(priceAt(GOODS, RULES, 'pepper', 100, 50, 'deckhand') > priceAt(GOODS, RULES, 'pepper', 100, 50, 'admiral'), 'easy has the wider spread');
    },
  },
  {
    name: 'trade: buying raises the price, and buying then selling straight back loses gold',
    fn() {
      const m = makeMarket({ market: { pepper: { t: 150, s: 1 } } });
      const p0 = shownPrice(GOODS, RULES, m, 'pepper', 'buy');
      const cost = quote(GOODS, RULES, m, 'pepper', 40, 'buy');
      m.pepper.s -= 40;
      check(shownPrice(GOODS, RULES, m, 'pepper', 'buy') > p0, 'price went up');
      const back = quote(GOODS, RULES, m, 'pepper', 40, 'sell');
      check(back < cost, `sold back for ${back}, paid ${cost}`);
      equal(affordable(GOODS, RULES, m, 'pepper', 0, 80), 0, 'no gold, nothing');
    },
  },
  {
    name: 'trade: stocks drift a share a day back to the port usual stock (5% in this test)',
    fn() {
      const m = { pepper: { t: 200, u: 200, s: 100 }, cloth: { t: 200, u: 200, s: 300 } };
      drift(m, RULES, 1);
      equal([m.pepper.s, m.cloth.s], [105, 295], 'one day');
      drift(m, RULES, 200);
      equal([m.pepper.s, m.cloth.s], [200, 200], 'back on target, no overshoot');
      const q = { pepper: { t: 150, u: 240, s: 160 } };
      drift(q, RULES, 300);
      equal(q.pepper.s, 240, 'a pepper port goes back to its own plenty, not the target');
    },
  },
  {
    name: 'voyage: buy and sell move gold, cargo and the market; refusals give a reason',
    fn() {
      const V = voyage();
      equal(V.at, 'quilon', 'starts in port');
      check(maxBuy(V, D, 'pepper') < 80, 'not enough gold for a full hold');
      V.gold = 5000; V.startGold = 5000;
      equal(maxBuy(V, D, 'pepper'), 80, 'room for 80');
      equal(buy(V, D, 'pepper', 81), 'holdFull', 'too much');
      equal(buy(V, D, 'pepper', 80), null, 'bought');
      equal([cargoOf(V, 'pepper'), holdUsed(V)], [80, 80], 'cargo');
      check(V.gold < 5000 - 80 * 12 && V.gold > 5000 - 80 * 20, `gold ${V.gold}`);
      equal(sell(V, D, 'cloth', 1), 'noCargo', 'nothing to sell');
      equal(buy(V, D, 'cloth', 1), 'holdFull', 'hold is full');
      equal(buy(V, D, 'food', 1), 'storesFull', 'food has its own room');
      V.gold = 0;
      V.fleet[0].food = 0;
      equal(buy(V, D, 'food', 1), 'noGold', 'no gold');
    },
  },
  {
    name: 'voyage: a pepper run Quilon → Cochin makes a profit; the monsoon ends the mission',
    fn() {
      const V = voyage();
      buy(V, D, 'pepper', maxBuy(V, D, 'pepper'));
      const r = sailTo(V, D, 'cochin');
      equal([r.why, V.at, r.days], [null, 'cochin', 2], 'arrived');
      sell(V, D, 'pepper', cargoOf(V, 'pepper'));
      check(profit(V) > 300, `profit after one run ${profit(V)}`);
      equal(V.result, null, 'not yet 800');
      while (!V.result) passDay(V, D);
      equal([V.result.kind, V.result.why], ['lost', 'monsoon'], 'monsoon came');
      equal(daysLeft(V), 0, 'no days left');
      equal(buy(V, D, 'pepper', 1), 'over', 'mission over: no trading');
    },
  },
  {
    name: 'voyage: reaching the profit wins; unpaid wages count against the profit',
    fn() {
      const V = voyage();
      for (let i = 0; i < 30; i++) passDay(V, D);
      equal(wagesDue(V), 300, 'a month of wages for 150 sailors');
      V.gold += 1000;
      equal(V.result, null, '1000 more gold, but 300 owed: profit 700');
      equal(payWages(V, D), null, 'paid');
      V.gold += 120; passDay(V, D);
      equal(V.result && V.result.kind, 'won', 'won at 800 (one more day of wages owed: 810 − 10)');
    },
  },
  {
    name: 'voyage: food, wages and the sea: hunger and unpaid wages lower morale',
    fn() {
      const V = voyage();
      const s = V.fleet[0];
      equal(s.foodMax, 90, '30 days of food for 150');
      s.food = 0;
      passDay(V, D);
      equal(s.morale, 65, 'hungry: −5');
      s.food = 90;
      for (let i = 0; i < 31; i++) passDay(V, D);
      check(s.morale < 65, 'unpaid for over a month: morale falls');
    },
  },
  {
    name: 'voyage: repairs and hiring cost what the rules say, and only where there is a yard or tavern',
    fn() {
      const V = voyage();
      const s = V.fleet[0];
      s.hull = 80; s.sails = 90; s.crew = 140;
      equal(repairCost(V, D), 20 * 10 + 10 * 3, 'cost');
      equal(repairAll(V, D), null, 'repaired');
      equal([s.hull, s.sails, V.gold], [100, 100, 770], 'after repair');
      equal(hireCrew(V, D), null, 'hired');
      equal([s.crew, V.gold], [150, 730], '10 sailors × 4');
      sailTo(V, D, 'cochin');
      s.hull = 50;
      equal(repairAll(V, D), 'noShipyard', 'Cochin here has no yard');
      equal(enterPort(V, D, 'goa'), 'notHere', 'Goa is on another map');
    },
  },
  {
    name: 'saves: a voyage packs and loads back identical, and bad files are refused',
    fn() {
      const V = voyage();
      buy(V, D, 'pepper', 30); passDay(V, D);
      const doc = pack(V, 'test');
      equal(doc.v, SAVE_VERSION, 'version');
      const back = unpack(JSON.stringify(doc));
      equal(back, JSON.parse(JSON.stringify(V)), 'same state');
      const reason = (x) => { try { unpack(x); return 'loaded'; } catch (e) { return e.message; } };
      equal(reason('not json'), 'notSave', 'text');
      equal(reason({ format: 'other' }), 'notSave', 'other file');
      equal(reason({ ...doc, v: SAVE_VERSION + 1 }), 'tooNew', 'from a newer game');
      equal(reason({ ...doc, state: { ...doc.state, fleet: [] } }), 'broken', 'no ships');
    },
  },
  {
    name: 'saves: the same save and the same orders give the same voyage',
    fn() {
      const run = (V) => { buy(V, D, 'pepper', 50); sailTo(V, D, 'cochin'); sell(V, D, 'pepper', 50); buy(V, D, 'cloth', 40); return V; };
      const a = run(voyage());
      const b = run(unpack(pack(voyage(), 't')));
      equal(a, b, 'same result');
    },
  },
];
