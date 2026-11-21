// The world of one fight: map, wind, ships, balls in flight, the boarding clash.
// `step(W)` moves it on by one fixed step (50 ms of game time). Orders come in
// through the order functions below; events go out in W.events for the screen.
import { dist } from './geom.js';
import { STEP, SHOTS, SAILS, GRAPPLE_SLOW } from './rules.js';
import { createRng } from './rng.js';
import { makeLand, onLand } from './navigation.js';
import { createShip, updShip } from './ship.js';
import { tryFire, updProj } from './gunnery.js';
import { checkGrapple, updClash, setTactic } from './boarding.js';
import { updAI } from './ai.js';
import { createWind, updWind } from './wind.js';
import { emit, hint, toast, ship, alive, endFight } from './core.js';
import { enemyVisible } from './sight.js';

export { enemyVisible, ship, alive };

// map: data/maps/*.json · fight: data/fights/*.json · classes: data/ships.json
export function createFight({ map, fight, classes, seed = 1638 }) {
  const W = {
    t: 0, steps: 0, seed, rng: createRng(seed),
    map: { id: map.id, w: map.w, h: map.h, land: map.land.map(makeLand), decor: map.decor || [] },
    ships: [], proj: [], events: [], hinted: {},
    clash: null, over: null, overAt: 0, sighted: false, lastKnown: null,
    playerId: null, enemyId: null,
  };
  W.wind = createWind(W, fight.wind || {});
  for (const def of fight.ships) {
    const cls = classes[def.cls];
    if (!cls) throw new Error('unknown ship class ' + def.cls);
    W.ships.push(createShip(cls, def));
  }
  W.playerId = fight.player; W.enemyId = fight.enemy;
  const e = ship(W, W.enemyId);
  W.lastKnown = { x: e.x, y: e.y };
  return W;
}

export function step(W, dt = STEP) {
  W.t += dt; W.steps++;
  updWind(W, dt);
  for (const s of W.ships) updAI(W, s, dt);
  for (const s of W.ships) updShip(W, s, dt);
  const p = ship(W, W.playerId), e = ship(W, W.enemyId);
  if (W.clash) updClash(W, dt);
  else { tryFire(W, p, e); tryFire(W, e, p); }
  checkGrapple(W);
  updProj(W, dt);
  checkStates(W, p, e);
}

function checkStates(W, p, e) {
  if (enemyVisible(W)) {
    W.lastKnown = { x: e.x, y: e.y };
    if (!W.sighted) {
      W.sighted = true;
      emit(W, { k: 'sighted', id: e.id });
      toast(W, 'sea.toast.sailHo', { name: e.name });
      hint(W, 'seen');
    }
  }
  if (W.over) return;
  if (e.sinking) endFight(W, 'won-sunk');
  else if (p.sinking) endFight(W, 'lost-sunk');
  else if (e.fleeing && (e.x < -60 || e.x > W.map.w + 60 || e.y < -60 || e.y > W.map.h + 60)) endFight(W, 'escaped');
  else if (alive(W, e) && dist(p, e) < 500 && e.v < e.top * GRAPPLE_SLOW && p.crew > e.crew * 0.8) hint(W, 'board');
}

// ---- orders (they work while paused; the next step carries them out) ----

// Returns null when the order was given, or a reason key when it can't be.
export function orderMove(W, x, y) {
  if (W.over || W.clash) return 'busy';
  if (x < 40 || y < 40 || x > W.map.w - 40 || y > W.map.h - 40) return 'offChart';
  if (onLand(W, x, y, 10)) return 'onLand';
  ship(W, W.playerId).order = { type: 'move', x, y };
  return null;
}

export function orderAttack(W) {
  if (W.over || W.clash) return 'busy';
  const e = ship(W, W.enemyId);
  if (!enemyVisible(W) || !alive(W, e)) return 'noEnemy';
  ship(W, W.playerId).order = { type: 'attack', target: e.id };
  return null;
}

export function orderBoard(W) {
  if (W.over || W.clash) return 'busy';
  const e = ship(W, W.enemyId);
  if (!enemyVisible(W) || !alive(W, e)) return 'noEnemy';
  ship(W, W.playerId).order = { type: 'board', target: e.id };
  if (e.v >= e.top * GRAPPLE_SLOW) hint(W, 'tooFastOrder');
  return null;
}

const CHOICES = { shot: Object.keys(SHOTS), sail: Object.keys(SAILS), stance: ['fire', 'hold', 'keep'] };
export function setChoice(W, key, value) {
  if (W.over || !CHOICES[key] || !CHOICES[key].includes(value)) return;
  ship(W, W.playerId)[key] = value;
  const hints = { 'stance:keep': 'keep', 'shot:grape': 'grape', 'shot:chain': 'chain', 'sail:battle': 'battleSail' };
  if (hints[key + ':' + value]) hint(W, hints[key + ':' + value]);
}

export { setTactic };

// Take the events the screen hasn't read yet.
export function drain(W) { const ev = W.events; W.events = []; return ev; }
export { endFight } from './core.js';
