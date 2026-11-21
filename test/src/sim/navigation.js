// Land and steering: islands and coast as shapes, tacking, keeping off the shore.
import { TAU, DEG, wrapA, norm, clamp, bearing, ahead, dist } from './geom.js';
import { NO_GO, TACK, SAILS } from './rules.js';

// A piece of land is a "star" shape: a radius for every direction from its centre.
// Made from a seed, so the same map data always gives the same coast.
export function makeLand(def) {
  let s = def.seed || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = def.points || (def.r > 800 ? 72 : 28);
  const p0 = rnd() * TAU, p1 = rnd() * TAU, wob = def.r > 800 ? 0.05 : 0.13;
  const rad = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    rad.push(def.r * (1 + wob * Math.sin(a * 3 + p0) + wob * 0.6 * Math.sin(a * 5 + p1) + (rnd() - 0.5) * wob * 0.5));
  }
  return { id: def.id, kind: def.kind || 'island', x: def.x, y: def.y, r: def.r, n, rad, seed: def.seed || 1, town: def.town || null };
}

// Radius of the shore in direction a (0 = north, clockwise).
export function radiusAt(L, a) {
  const f = norm(a) / TAU * L.n, i = Math.floor(f) % L.n, j = (i + 1) % L.n, t = f - Math.floor(f);
  return L.rad[i] + (L.rad[j] - L.rad[i]) * t;
}

// How far inside the shore (plus a margin) a point is: > 0 means on land.
export function landDepth(L, x, y, pad = 0) {
  const a = Math.atan2(x - L.x, -(y - L.y));
  return radiusAt(L, a) + pad - Math.hypot(x - L.x, y - L.y);
}

export function onLand(W, x, y, pad = 0) {
  for (const L of W.map.land) if (landDepth(L, x, y, pad) > 0) return L;
  return null;
}

// The nearest legal heading: closer than 50° to the wind becomes a tack at 52°.
export function legal(W, h) {
  const off = wrapA(h - W.wind.from);
  return Math.abs(off) < NO_GO ? norm(W.wind.from + (off >= 0 ? 1 : -1) * TACK) : h;
}

// Heading toward a point, tacking if the point is upwind.
export function steerPoint(W, s, tx, ty, dt) {
  const b = Math.atan2(tx - s.x, -(ty - s.y));
  if (Math.abs(wrapA(b - W.wind.from)) >= 48 * DEG) return b;
  s.tackT -= dt;
  let c = W.wind.from + s.tack * TACK;
  if (Math.abs(wrapA(c - b)) > 78 * DEG && s.tackT <= 0) { s.tack *= -1; s.tackT = 6; c = W.wind.from + s.tack * TACK; }
  s.tacking = true;
  return norm(c);
}

// Heading that brings a broadside to bear on t at about the ideal range.
export function broadsideHeading(W, s, t, ideal) {
  const d = dist(s, t), b = bearing(s, t);
  let off = 90 * DEG;
  if (d > ideal + 70) off = 55 * DEG; else if (d < ideal - 70) off = 125 * DEG;
  const c1 = legal(W, norm(b + off)), c2 = legal(W, norm(b - off));
  const e1 = Math.abs(wrapA(c1 - s.h)), e2 = Math.abs(wrapA(c2 - s.h));
  if (s.bsSide === 1 && e2 + 0.7 < e1) s.bsSide = -1; else if (s.bsSide === -1 && e1 + 0.7 < e2) s.bsSide = 1;
  return s.bsSide === 1 ? c1 : c2;
}

function blocked(W, s, h) {
  for (const L of [60, 130, 200]) {
    const [fx, fy] = ahead(s.x, s.y, h, L);
    const land = onLand(W, fx, fy, 45);
    if (land) return land;
  }
  return null;
}

// Turn away from land that lies ahead, to the side nearer the wanted heading.
export function avoid(W, s, des) {
  const land = blocked(W, s, des);
  if (!land) return des;
  const bI = bearing(s, land), pref = wrapA(des - bI) >= 0 ? 1 : -1;
  for (const off of [85, 105, 125, 150]) {
    for (const side of [pref, -pref]) {
      const c = legal(W, norm(bI + side * off * DEG));
      if (!blocked(W, s, c)) return c;
    }
  }
  return legal(W, norm(bI + Math.PI));
}

export function turnRate(s) {
  // A ship going about (tacking) carries its way through the wind, so it keeps most of its turn.
  const way = clamp(s.v / (s.top * 0.45), s.tacking ? 0.75 : 0, 1);
  return s.turn * DEG * SAILS[s.sail].turn * (0.45 + 0.55 * way) * (0.6 + 0.4 * s.sails / 100);
}

export function turnToward(s, des, dt) {
  const rate = turnRate(s);
  s.h = norm(s.h + clamp(wrapA(des - s.h), -rate * dt, rate * dt));
}
