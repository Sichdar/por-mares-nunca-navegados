// Gunnery (rule 2): sides fire by themselves when the enemy is in their arc and range;
// bow guns for chasing; raking; three kinds of shot; balls fly before they land.
import { DEG, TAU, wrapA, clamp, dist, bearing } from './geom.js';
import {
  SHOTS, DMG, ARC, RAKE, RAKE_MULT, BOW_ARC, BOW_RANGE, BOW_GUNS, BOW_RELOAD, RELOAD, BALL_SPEED,
  hitChance, SAILS, STRIKE_MORALE, STRIKE_CREW,
} from './rules.js';
import { emit, hint, ship, alive, isPlayer, endFight } from './core.js';

export const reloadTime = (s) => RELOAD / clamp(s.crew / s.crewMax, 0.25, 1) * (s.morale < 30 ? 1.25 : 1);

// Which gun group could fire at t right now, ignoring reload: 1 right, -1 left, 0 bow, null none.
export function bearingGroup(s, t) {
  const d = dist(s, t);
  if (d > SHOTS[s.shot].range) return null;
  const b = bearing(s, t);
  for (const side of [1, -1]) if (Math.abs(wrapA(b - (s.h + side * 90 * DEG))) <= ARC) return side;
  if (d <= Math.min(BOW_RANGE, SHOTS[s.shot].range) && Math.abs(wrapA(b - s.h)) <= BOW_ARC) return 0;
  return null;
}

export function isRake(s, t) {
  const rel = Math.abs(wrapA(bearing(t, s) - t.h));
  return rel < RAKE || rel > Math.PI - RAKE;
}

export function tryFire(W, s, t) {
  if (!alive(W, s) || !alive(W, t) || W.clash || s.powder <= 0) return;
  if (s.stance === 'hold') return;
  const d = dist(s, t);
  if (d > SHOTS[s.shot].range) return;
  const b = bearing(s, t);
  for (const side of [1, -1]) {
    if (s.reload[side] > 0) continue;
    if (Math.abs(wrapA(b - (s.h + side * 90 * DEG))) <= ARC) { fire(W, s, t, side, d); return; }
  }
  if (s.reload[0] <= 0 && d <= Math.min(BOW_RANGE, SHOTS[s.shot].range) && Math.abs(wrapA(b - s.h)) <= BOW_ARC) fire(W, s, t, 0, d);
}

function fire(W, s, t, side, d) {
  const R = W.rng, bow = side === 0, n = bow ? BOW_GUNS : s.guns;
  s.powder--;
  s.reload[side] = bow ? reloadTime(s) * BOW_RELOAD : reloadTime(s);
  if (!bow) s.stats.broadsides++;
  const p = hitChance(d) * s.aim;
  const rake = !bow && isRake(s, t);
  if (rake) {
    s.stats.rakes++;
    emit(W, { k: 'rake', id: t.id, x: t.x, y: t.y });
    if (isPlayer(W, s)) hint(W, 'rake');
  }
  if (bow && isPlayer(W, s)) hint(W, 'bow');
  if (!bow && isPlayer(W, s)) hint(W, 'fired');
  const beam = bow ? s.h : s.h + side * 90 * DEG;
  const balls = [];
  for (let i = 0; i < n; i++) {
    const along = bow ? 32 : (i / (n - 1) - 0.5) * 40, out = bow ? (i ? 4 : -4) : 11;
    // where the gun sits on the ship (world units), along the hull and out to the side
    const sx = s.x + Math.sin(s.h) * along + Math.sin(bow ? s.h + Math.PI / 2 : beam) * out;
    const sy = s.y - Math.cos(s.h) * along - Math.cos(bow ? s.h + Math.PI / 2 : beam) * out;
    const hit = R.next() < p, ma = R.range(0, TAU), mr = R.range(40, 120), fl = d / BALL_SPEED;
    const ball = {
      x0: sx, y0: sy, t: -(i * 0.07 + R.range(0, 0.12)), dur: fl + R.range(-0.05, 0.05), hit,
      target: t.id, owner: s.id, shot: s.shot, rake,
      ox: R.range(-14, 14), oy: R.range(-14, 14),
      mx: t.x + Math.sin(ma) * mr + Math.sin(t.h) * t.v * fl, my: t.y - Math.cos(ma) * mr - Math.cos(t.h) * t.v * fl,
      fired: false, beam,
    };
    W.proj.push(ball);
    balls.push(ball);
    s.stats.shots++;
  }
  emit(W, { k: 'fire', id: s.id, side, bow, x: s.x, y: s.y, n });
}

export function applyHit(W, o, t, shot, rake) {
  if (!alive(W, t)) return;
  const sh = SHOTS[shot], m = rake ? RAKE_MULT : 1;
  const hd = DMG * sh.hull * m;
  t.hull = Math.max(0, t.hull - hd);
  t.sails = Math.max(0, t.sails - DMG * sh.sails * SAILS[t.sail].damage);
  const men = Math.min(t.crew, DMG * sh.crew * 1.5 * m * W.rng.range(0.6, 1.4));
  t.crew -= men;
  t.morale = Math.max(0, t.morale - men * 0.12);
  o.stats.hits++; o.stats.hullDealt += hd; o.stats.menKilled += men;
  if (!isPlayer(W, t) && !t.struck && t.hull > 0 && (t.morale < STRIKE_MORALE || t.crew < t.crewMax * STRIKE_CREW)) {
    t.struck = true;
    emit(W, { k: 'struck', id: t.id, x: t.x, y: t.y });
    endFight(W, 'won-struck');
  }
  if (t.hull <= 0 && !t.sinking) { t.sinking = 0.001; emit(W, { k: 'sinking', id: t.id }); }
}

export function updProj(W, dt) {
  for (let i = W.proj.length - 1; i >= 0; i--) {
    const p = W.proj[i];
    p.t += dt;
    if (p.t < 0) continue;
    if (!p.fired) { p.fired = true; emit(W, { k: 'gun', x: p.x0, y: p.y0, beam: p.beam }); }
    if (p.t >= p.dur) {
      const t = ship(W, p.target), o = ship(W, p.owner);
      if (p.hit && t && !t.sinking) {
        applyHit(W, o, t, p.shot, p.rake);
        emit(W, { k: 'hit', id: t.id, x: t.x + p.ox, y: t.y + p.oy, rake: p.rake, onPlayer: isPlayer(W, t) });
      } else {
        emit(W, { k: 'miss', x: p.mx, y: p.my });
      }
      W.proj.splice(i, 1);
    }
  }
}
