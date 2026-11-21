// Rule tests for the fight (M1). Built without data files, so they also run in the browser.
import { createFight, step, ship, orderMove, orderAttack, orderBoard, setTactic } from '../src/sim/world.js';
import { maxSpeed } from '../src/sim/ship.js';
import { applyHit, reloadTime, tryFire, bearingGroup } from '../src/sim/gunnery.js';
import { startClash, updClash } from '../src/sim/boarding.js';
import { onLand, radiusAt, makeLand } from '../src/sim/navigation.js';
import { DEG } from '../src/sim/geom.js';
import { BEATS, TACTICS } from '../src/sim/rules.js';

function equal(a, b, what) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function check(cond, what) { if (!cond) throw new Error(what); }

const CLASSES = {
  patacho: { nation: 'pt', model: 'patacho', guns: 10, hull: 100, crew: 150, powder: 40, top: 42, turn: 18 },
  dutchWarship: { nation: 'nl', model: 'dutchWarship', guns: 11, hull: 110, crew: 160, powder: 40, top: 38, turn: 14 },
};
function fight({ px = 2000, py = 3000, ph = 0, ex = 2000, ey = 1000, eh = 180, wind = 45, land = [], seed = 1, ai = 'none' } = {}) {
  return createFight({
    seed, classes: CLASSES,
    map: { id: 't', w: 4000, h: 4000, land },
    fight: {
      wind: { from: wind, str: 1 }, player: 'p', enemy: 'e', ships: [
        { id: 'p', name: 'P', cls: 'patacho', x: px, y: py, h: ph, ctrl: 'player' },
        { id: 'e', name: 'E', cls: 'dutchWarship', x: ex, y: ey, h: eh, ctrl: ai },
      ],
    },
  });
}
const run = (W, secs, each) => { for (let i = 0; i < secs * 20 && !W.over; i++) { if (each) each(W); step(W); } };
const offWind = (W, s) => Math.abs((((s.h - W.wind.from) / DEG) % 360 + 540) % 360 - 180);

export const fightTests = [
  {
    name: 'sailing: a ship can\'t sail straight into the wind; beam reach is fastest',
    fn() {
      const W = fight({ wind: 0 }), p = ship(W, 'p');
      p.h = 0; const into = maxSpeed(W, p);
      p.h = 60 * DEG; const close = maxSpeed(W, p);
      p.h = 90 * DEG; const beam = maxSpeed(W, p);
      p.h = 180 * DEG; const running = maxSpeed(W, p);
      check(into < p.top * 0.1, 'into the wind too fast: ' + into);
      check(beam > close && beam > running, 'beam reach should be fastest');
    },
  },
  {
    name: 'sailing: battle sail gives 65% speed; half a hull gives 75%',
    fn() {
      const W = fight({ wind: 0 }), p = ship(W, 'p');
      p.h = 90 * DEG; const full = maxSpeed(W, p);
      p.sail = 'battle'; equal(Math.round(maxSpeed(W, p) / full * 100), 65, 'battle sail %');
      p.sail = 'full'; p.hull = 50; equal(Math.round(maxSpeed(W, p) / full * 100), 75, 'half hull %');
    },
  },
  {
    name: 'sailing: a point dead upwind is reached by tacking, crossing the wind only while turning',
    fn() {
      const W = fight({ wind: 0, ph: 90, py: 3500, ex: 3900, ey: 100 }), p = ship(W, 'p');
      equal(orderMove(W, 2000, 2400), null, 'order');
      let n = 0, inIrons = 0;
      run(W, 300, (w) => { if (p.order.type === 'move') { n++; if (offWind(w, p) < 40) inIrons++; } });
      check(p.order.type === 'none', 'did not arrive: still ' + Math.round(Math.hypot(p.x - 2000, p.y - 2400)) + ' away');
      check(inIrons / n < 0.3, Math.round(inIrons / n * 100) + '% of the time pointing into the wind');
    },
  },
  {
    name: 'gunnery: a side fires only with the enemy inside its ±35° arc and in range',
    fn() {
      const W = fight({ px: 2000, py: 2000, ph: 0, ex: 2300, ey: 2000 }), p = ship(W, 'p'), e = ship(W, 'e');
      equal(bearingGroup(p, e), 1, 'enemy abeam to starboard');
      tryFire(W, p, e); equal(p.stats.broadsides, 1, 'fired');
      equal(W.proj.length, 10, 'one ball per gun');
      e.x = 2000; e.y = 1700; equal(bearingGroup(p, e), 0, 'dead ahead: bow guns');
      e.x = 2000; e.y = 2300; equal(bearingGroup(p, e), null, 'astern: nothing bears');
      e.x = 2500; e.y = 2000; equal(bearingGroup(p, e), null, 'out of range (500)');
      p.shot = 'grape'; e.x = 2200; equal(bearingGroup(p, e), null, 'grape only reaches 150');
    },
  },
  {
    name: 'gunnery: raking does 1.5× hull damage; chain shot mostly hits sails',
    fn() {
      const W = fight(), p = ship(W, 'p'), e = ship(W, 'e');
      applyHit(W, p, e, 'round', false); const plain = 110 - e.hull;
      e.hull = 110; applyHit(W, p, e, 'round', true); const raked = 110 - e.hull;
      equal(Math.round(raked / plain * 10) / 10, 1.5, 'rake multiplier');
      const W2 = fight(), e2 = ship(W2, 'e'); applyHit(W2, ship(W2, 'p'), e2, 'chain', false);
      check(100 - e2.sails > (110 - e2.hull) * 5, 'chain shot should mostly hit sails');
    },
  },
  {
    name: 'gunnery: battle sail halves damage to sails',
    fn() {
      const W = fight(), p = ship(W, 'p'), e = ship(W, 'e');
      applyHit(W, p, e, 'chain', false); const full = 100 - e.sails;
      e.sails = 100; e.sail = 'battle'; applyHit(W, p, e, 'chain', false);
      equal(Math.round((100 - e.sails) / full * 100), 50, 'battle sail damage %');
    },
  },
  {
    name: 'gunnery: reload takes 12 s with a full crew and 24 s at half crew',
    fn() {
      const W = fight(), p = ship(W, 'p');
      equal(reloadTime(p), 12, 'full crew');
      p.crew = 75; equal(reloadTime(p), 24, 'half crew');
    },
  },
  {
    name: 'boarding: no grapple while the target is above 60% speed',
    fn() {
      const W = fight({ px: 2000, py: 2000, ex: 2000, ey: 1940, eh: 0 }), p = ship(W, 'p'), e = ship(W, 'e');
      equal(orderBoard(W), null, 'board order');
      e.v = e.top * 0.95; e.order = { type: 'move', x: 2000, y: 100 };
      step(W); check(!W.clash, 'grappled a fast ship');
      e.v = e.top * 0.2; e.top = 38; e.order = { type: 'none' }; e.sails = 0;
      p.x = e.x; p.y = e.y + 60;
      step(W); check(!!W.clash, 'did not grapple a slow ship');
    },
  },
  {
    name: 'boarding: picking the counter to the enemy\'s tactic wins most clashes',
    fn() {
      let wins = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const W = fight({ px: 2000, py: 2000, ex: 2000, ey: 1940, seed });
        startClash(W, ship(W, 'p'));
        while (W.clash) {
          updClash(W, 0.05);
          if (W.clash && W.clash.et) setTactic(W, TACTICS.find((t) => BEATS[t] === W.clash.et));
        }
        if (W.over === 'won-captured') wins++;
      }
      check(wins >= 30, 'counter-picking won only ' + wins + ' of 40');
    },
  },
  {
    name: 'land: taps on land are refused; a ship sailing at an island stays off the shore and loses at most a few hull',
    fn() {
      const W = fight({ px: 2000, py: 2400, ph: 0, land: [{ id: 'i', x: 2000, y: 2000, r: 200, seed: 3 }] }), p = ship(W, 'p');
      const L = W.map.land[0];
      check(onLand(W, 2000, 2000), 'island centre is land');
      equal(orderMove(W, 2000, 2000), 'onLand', 'move onto land refused');
      p.v = 40; p.order = { type: 'move', x: 2000, y: 1000 };
      let minGap = 1e9; const hull0 = p.hull;
      run(W, 30, () => { minGap = Math.min(minGap, Math.hypot(p.x - L.x, p.y - L.y) - radiusAt(L, Math.atan2(p.x - L.x, -(p.y - L.y)))); });
      check(minGap > 0, 'ship ended up inside the shore');
      check(hull0 - p.hull <= 12, 'aground damage too high: ' + (hull0 - p.hull));
    },
  },
  {
    name: 'map: the same seed always makes the same coast',
    fn() { equal(makeLand({ x: 0, y: 0, r: 300, seed: 9 }).rad, makeLand({ x: 0, y: 0, r: 300, seed: 9 }).rad, 'radii'); },
  },
  {
    name: 'fight: the same seed and the same orders give exactly the same fight',
    fn() {
      const play = () => {
        const W = fight({ ai: 'ai', seed: 77, ey: 2300 });
        run(W, 180, (w) => { if (w.steps % 10 === 0) orderAttack(w); });
        const p = ship(W, 'p'), e = ship(W, 'e');
        return [W.over, W.steps, p.x, p.y, p.hull, e.hull, e.crew, W.rng.getState()];
      };
      equal(play(), play(), 'end state');
    },
  },
  {
    name: 'enemy: breaks off at 25% hull and runs',
    fn() {
      const W = fight({ ai: 'ai', ey: 2500 }), e = ship(W, 'e');
      e.hull = e.hullMax * 0.2; run(W, 2);
      check(e.fleeing && e.order.type === 'flee', 'did not break off');
    },
  },
];
