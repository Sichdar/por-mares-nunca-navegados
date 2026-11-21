// Ships: creation from a class (data/ships.json), speed with the wind, movement,
// running aground. Orders are carried out here; enemies get theirs in ai.js.
import { DEG, wrapA, clamp, lerp, dist, norm } from './geom.js';
import { posFactor, SAILS, SHOTS } from './rules.js';
import { steerPoint, broadsideHeading, avoid, turnToward, landDepth } from './navigation.js';
import { emit, hint, toast, ship, alive, isPlayer, foeOf } from './core.js';
import { enemyVisible } from './sight.js';

export function createShip(cls, def) {
  return {
    id: def.id, name: def.name, cls: def.cls, nation: cls.nation, model: cls.model,
    x: def.x, y: def.y, h: norm((def.h ?? 0) * DEG), v: def.v ?? 20,
    top: cls.top, turn: cls.turn, guns: cls.guns,
    hull: cls.hull, hullMax: cls.hull, sails: 100, crew: cls.crew, crewMax: cls.crew,
    morale: def.morale ?? 70, powder: cls.powder, aim: def.aim ?? 1,
    sail: 'full', shot: 'round', stance: 'fire', order: { type: 'none' },
    ctrl: def.ctrl || 'none',
    tack: 1, tackT: 0, tacking: false, bsSide: 1,
    reload: { '1': 0, '-1': 0, '0': 0 },
    sinking: 0, aground: 0, fleeing: false, struck: false,
    aiT: 0, wp: def.wp ? { ...def.wp } : null,
    stats: { broadsides: 0, shots: 0, hits: 0, rakes: 0, hullDealt: 0, menKilled: 0 },
  };
}

export function maxSpeed(W, s) {
  const off = Math.abs(wrapA(s.h - W.wind.from)) / DEG;
  return s.top * W.wind.str * posFactor(off) * SAILS[s.sail].speed * (0.5 + 0.5 * s.hull / s.hullMax)
    * (0.35 + 0.65 * s.sails / 100) * (s.crew < s.crewMax * 0.3 ? 0.5 : 1);
}

export const idealRange = (s) => Math.min(s.stance === 'keep' ? 300 : 210, SHOTS[s.shot].range * 0.75);

function lead(s, t) {
  const k = clamp(dist(s, t) / Math.max(s.v, 10), 0, 4);
  return [t.x + Math.sin(t.h) * t.v * k, t.y - Math.cos(t.h) * t.v * k];
}

export function updShip(W, s, dt) {
  for (const k of ['1', '-1', '0']) s.reload[k] = Math.max(0, s.reload[k] - dt);
  if (s.sinking) {
    s.sinking += dt; s.v *= 0.985;
    s.x += Math.sin(s.h) * s.v * dt; s.y -= Math.cos(s.h) * s.v * dt;
    return;
  }
  if (W.clash) { s.v = lerp(s.v, 0, Math.min(1, dt)); return; }
  s.tacking = false;
  let des = s.h, idle = false;
  const o = s.order;
  if (o.type === 'move' || o.type === 'flee') {
    if (o.type === 'move' && Math.hypot(o.x - s.x, o.y - s.y) < 50) s.order = { type: 'none' };
    else des = steerPoint(W, s, o.x, o.y, dt);
  } else if (o.type === 'attack' || o.type === 'board') {
    const t = ship(W, o.target);
    if (!alive(W, t)) s.order = { type: 'none' };
    else if (o.type === 'board' || (t.fleeing && dist(s, t) > 180)) { const [lx, ly] = lead(s, t); des = steerPoint(W, s, lx, ly, dt); }
    else des = broadsideHeading(W, s, t, idealRange(s));
  } else idle = true;
  if (s.order.type === 'none' && s.stance === 'keep') {
    const f = foeOf(W, s);
    if (alive(W, f) && enemyVisible(W)) { des = broadsideHeading(W, s, f, 300); idle = false; }
  }
  if (s.tacking && isPlayer(W, s)) hint(W, 'tack');
  des = avoid(W, s, des);
  turnToward(s, des, dt);
  const tv = maxSpeed(W, s) * (idle ? 0.3 : 1);
  s.v += (tv - s.v) * Math.min(1, dt * 0.45);
  s.x += Math.sin(s.h) * s.v * dt; s.y -= Math.cos(s.h) * s.v * dt;
  const M = W.map;
  if (isPlayer(W, s) || !s.fleeing) { s.x = clamp(s.x, 40, M.w - 40); s.y = clamp(s.y, 40, M.h - 40); }
  for (const L of M.land) {
    const R = 18, inside = landDepth(L, s.x, s.y, R);
    if (inside > 0) {
      const dx = s.x - L.x, dy = s.y - L.y, d = Math.hypot(dx, dy) || 1;
      s.x += dx / d * inside; s.y += dy / d * inside;
      const impact = s.v; s.v *= 0.3;
      const out = Math.atan2(dx, -dy);
      s.h = norm(s.h + clamp(wrapA(out - s.h), -2 * dt, 2 * dt)); // swing the bow off the shore
      if (s.aground <= 0 && impact > 8) {
        s.hull = Math.max(0, s.hull - clamp(impact / 10, 1, 4)); s.aground = 3;
        emit(W, { k: 'aground', id: s.id, x: s.x, y: s.y });
        if (isPlayer(W, s)) toast(W, 'sea.toast.aground');
      }
    }
  }
  s.aground -= dt;
  if (s.hull <= 0) { s.hull = 0; s.sinking = 0.001; emit(W, { k: 'sinking', id: s.id }); }
}
