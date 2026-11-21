// Land (Phase 6): sand, low cliffs, grass and forest, palms, huts and a fort.
// Shapes come from the rules (sim/navigation.js), so what you see is what ships hit.
import { TAU } from '../sim/geom.js';
import { ground, screen, w2s, projector, faces, lit, shade, poly, viewBounds } from './iso.js';
import { radiusAt, landDepth } from '../sim/navigation.js';

const COL = { surf: 'rgba(245,252,248,.6)', sand: '#e0cb93', sandDark: '#b99d63', cliff: '#7f6c45', grass: '#5d8d3d', grassDark: '#44692f', forest: '#365a27', forestEdge: '#5b5236' };

// The shore outline, pushed out by `add` lengths (or in, if negative).
export function landPath(ctx, L, add = 0, scale = 1) {
  ctx.beginPath();
  const n = L.n * 2;
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, r = Math.max(4, radiusAt(L, a) * scale + add);
    const x = L.x + Math.sin(a) * r, y = L.y - Math.cos(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

const near = (L, b, m) => !(L.x + L.r + m < b.x0 || L.x - L.r - m > b.x1 || L.y + L.r + m < b.y0 || L.y - L.r - m > b.y1);
const inner = (L) => (L.kind === 'coast' ? -150 : -L.r * 0.5);
const isBig = (L) => L.kind === 'coast';

// Flat and raised layers of every piece of land in view.
export function drawLandGround(ctx, c, W, reduceMotion, t) {
  const b = viewBounds(c, 120), H = 10 * c.k, n = 6;
  for (const L of W.map.land) {
    if (!near(L, b, 60)) continue;
    ground(ctx, c);
    ctx.lineWidth = 3 / c.zoom; ctx.strokeStyle = COL.surf;
    landPath(ctx, L, 10 + (reduceMotion ? 0 : Math.sin(t * 1.3) * 2)); ctx.stroke();
    landPath(ctx, L, 6); ctx.fillStyle = COL.sand; ctx.fill();
    for (let i = 0; i < n; i++) { ground(ctx, c, H * i / n); landPath(ctx, L, -14); ctx.fillStyle = i < 2 ? COL.sandDark : COL.cliff; ctx.fill(); }
    ground(ctx, c, H); landPath(ctx, L, -16); ctx.fillStyle = COL.grass; ctx.fill();
    // darker patches of scrub, from the land's seed
    let s = L.seed * 31 + 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    ctx.fillStyle = COL.grassDark;
    const spots = isBig(L) ? 40 : 14;
    for (let i = 0; i < spots; i++) {
      const a = rnd() * TAU, d = isBig(L) ? radiusAt(L, a) - 40 - rnd() * 220 : rnd() * L.r * 0.7;
      ctx.beginPath(); ctx.arc(L.x + Math.sin(a) * d, L.y - Math.cos(a) * d, (isBig(L) ? 30 : L.r * 0.08) * (1 + rnd()), 0, TAU); ctx.fill();
    }
    // forest or hill in the middle
    const add = inner(L), sc = isBig(L) ? 1 : 0.5, h2 = H * 1.2;
    for (let i = 0; i < n; i++) { ground(ctx, c, H + h2 * i / n); landPath(ctx, L, isBig(L) ? add : 0, isBig(L) ? 1 : sc); ctx.fillStyle = i < n - 1 ? COL.forestEdge : COL.forest; ctx.fill(); }
    ground(ctx, c, H + h2); landPath(ctx, L, isBig(L) ? add - 3 : -2, isBig(L) ? 1 : sc); ctx.fillStyle = COL.forest; ctx.fill();
  }
}

// Palms, huts and forts: returned as draw items with a depth, sorted with the ships.
const cache = new Map();
function palmsOf(W, L) {
  const key = W.map.id + ':' + L.id;
  if (cache.has(key)) return cache.get(key);
  let s = L.seed * 97 + 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = [];
  if (isBig(L)) {
    // a belt of palms along the shore, only where the shore is near the map
    for (let i = 0; i < 900; i++) {
      const a = rnd() * TAU, R = radiusAt(L, a), d = R - 30 - rnd() * 110;
      const x = L.x + Math.sin(a) * d, y = L.y - Math.cos(a) * d;
      if (x < -300 || y < -300 || x > W.map.w + 300 || y > W.map.h + 300) continue;
      out.push({ x, y, ph: rnd() * TAU, s: 0.8 + rnd() * 0.5, high: false });
      if (out.length > 140) break;
    }
  } else {
    for (let i = 0; i < Math.round(L.r / 9); i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * L.r * 0.8;
      out.push({ x: L.x + Math.sin(a) * d, y: L.y - Math.cos(a) * d, ph: rnd() * TAU, s: 0.8 + rnd() * 0.5, high: d / L.r < 0.36 });
    }
  }
  // keep them off huts and the fort
  const clear = out.filter((p) => !(W.map.decor || []).some((d) => Math.hypot(d.x - p.x, d.y - p.y) < (d.kind === 'fort' ? 70 : 34)));
  cache.set(key, clear);
  return clear;
}

export function landItems(c, W, t, reduceMotion) {
  const b = viewBounds(c, 60), H = 10 * c.k, items = [];
  const inView = (x, y) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  for (const L of W.map.land) {
    if (!near(L, b, 60)) continue;
    for (const p of palmsOf(W, L)) {
      if (!inView(p.x, p.y)) continue;
      const lift = p.high ? H * 2.2 : landDepth(L, p.x, p.y, -16) > 0 ? H : 0;
      items.push({ d: p.x + p.y, fn: (ctx) => palm(ctx, c, p, lift, t, reduceMotion) });
    }
  }
  for (const d of W.map.decor || []) {
    if (!inView(d.x, d.y)) continue;
    const L = W.map.land.find((l) => l.id === d.land);
    const lift = L && landDepth(L, d.x, d.y, -16) > 0 ? H : 0;
    if (d.kind === 'hut') items.push({ d: d.x + d.y, fn: (ctx) => hut(ctx, c, d, lift) });
    if (d.kind === 'fort') items.push({ d: d.x + d.y, fn: (ctx) => fort(ctx, c, d, lift, W, t) });
  }
  return items;
}

function palm(ctx, c, p, lift, t, still) {
  screen(ctx, c);
  const [bx, b0] = w2s(c, p.x, p.y), by = b0 - lift, sc = c.k * 0.6 * p.s, h = 30 * sc;
  const sway = still ? 0 : Math.sin(t * 1.1 + p.ph) * 1.5 * sc;
  const lean = Math.sin(p.ph) * 9 * sc + sway;
  ctx.fillStyle = 'rgba(20,40,20,.28)'; ctx.beginPath(); ctx.ellipse(bx + 6 * sc, by + 1, 9 * sc, 3.5 * sc, 0, 0, TAU); ctx.fill();
  const tx = bx + lean, ty = by - h;
  ctx.strokeStyle = '#6e5232'; ctx.lineCap = 'round'; ctx.lineWidth = 2.6 * sc;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + lean * 0.1, by - h * 0.6, tx, ty); ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + p.ph, L = 15 * sc, ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.5 + 6 * sc;
    ctx.fillStyle = i % 2 ? '#3f7d36' : '#4f9442';
    ctx.beginPath(); ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.6, ty + Math.sin(a) * L * 0.3 - 6 * sc, ex, ey);
    ctx.quadraticCurveTo(tx + Math.cos(a) * L * 0.45, ty + Math.sin(a) * L * 0.25 - sc, tx, ty); ctx.fill();
  }
  ctx.fillStyle = '#5a3f22'; ctx.beginPath(); ctx.arc(tx, ty + 1.5 * sc, 2 * sc, 0, TAU); ctx.fill();
}

// A box standing on the ground: half sizes in the thing's own units, heights h0..h1.
function box(ctx, P, hx, hy, h0, h1, rgb, topRgb) {
  for (const [nx, ny, a, b] of [[1, 0, [hx, -hy], [hx, hy]], [0, 1, [hx, hy], [-hx, hy]], [-1, 0, [-hx, hy], [-hx, -hy]], [0, -1, [-hx, -hy], [hx, -hy]]]) {
    const [wx, wy] = P.dir(nx, ny);
    if (faces(wx, wy)) poly(ctx, [P(a[0], a[1], h0), P(b[0], b[1], h0), P(b[0], b[1], h1), P(a[0], a[1], h1)], shade(rgb, lit(wx, wy)), 'rgba(30,20,10,.5)', 0.8);
  }
  if (topRgb) poly(ctx, [P(-hx, -hy, h1), P(hx, -hy, h1), P(hx, hy, h1), P(-hx, hy, h1)], shade(topRgb, 1), 'rgba(30,20,10,.45)', 0.8);
}

// World-offset projector for buildings: Pw(east, south, height), normals in world directions.
function worldProjector(c, x, y, lift) {
  const P = projector(c, x, y, 0, lift);
  const Pw = (dx, dy, h) => P(-dy, dx, h);
  Pw.dir = (nx, ny) => [nx, ny];
  return Pw;
}

function hut(ctx, c, d, lift) {
  screen(ctx, c);
  const P = worldProjector(c, d.x, d.y, lift), rot = d.rot, hx = rot ? 9 : 13, hy = rot ? 13 : 9;
  box(ctx, P, hx, hy, 0, 9, [196, 170, 120], null);
  // thatched roof: ridge along the long side
  const r = rot ? [[0, -hy - 2], [0, hy + 2]] : [[-hx - 2, 0], [hx + 2, 0]];
  const e = rot ? [[-hx - 3, -hy - 2], [hx + 3, -hy - 2], [hx + 3, hy + 2], [-hx - 3, hy + 2]] : [[-hx - 2, -hy - 3], [hx + 2, -hy - 3], [hx + 2, hy + 3], [-hx - 2, hy + 3]];
  const R0 = P(r[0][0], r[0][1], 18), R1 = P(r[1][0], r[1][1], 18);
  const sides = rot ? [[[e[0], e[3]], -1, 0], [[e[1], e[2]], 1, 0]] : [[[e[0], e[1]], 0, -1], [[e[3], e[2]], 0, 1]];
  sides.sort((u, v) => (u[1] + u[2]) - (v[1] + v[2]));
  for (const [[a, b], nx, ny] of sides) poly(ctx, [P(a[0], a[1], 8), P(b[0], b[1], 8), R1, R0], shade([170, 132, 70], lit(nx, ny)), 'rgba(60,40,15,.6)', 0.8);
  if (faces(rot ? 1 : 0, rot ? 0 : 1)) {
    const q = rot ? [[hx, -2.5], [hx, 2.5]] : [[-2.5, hy], [2.5, hy]];
    poly(ctx, [P(q[0][0], q[0][1], 0), P(q[1][0], q[1][1], 0), P(q[1][0], q[1][1], 6), P(q[0][0], q[0][1], 6)], '#3a2814');
  }
}

function fort(ctx, c, d, lift, W, t) {
  screen(ctx, c);
  const P = worldProjector(c, d.x, d.y, lift);
  const stone = [176, 164, 138], top = [146, 136, 116];
  const at = (ox, oy) => { const Q = (dx, dy, h) => P(ox + dx, oy + dy, h); Q.dir = P.dir; return Q; };
  // curtain walls [centre x, centre y, half x, half y] and corner bastions, far ones first
  const parts = [[0, -29, 30, 3], [-29, 0, 3, 30], [0, 29, 30, 3], [29, 0, 3, 30],
    [-30, -30, 6, 6], [30, -30, 6, 6], [-30, 30, 6, 6], [30, 30, 6, 6]].sort((u, v) => (u[0] + u[1]) - (v[0] + v[1]));
  const tower = () => {
    box(ctx, P, 11, 11, 0, 30, [168, 160, 140], [140, 132, 114]);
    for (const [a, b] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) box(ctx, at(a, b), 2.2, 2.2, 30, 34, [168, 160, 140], [150, 142, 124]);
    const base = P(0, 0, 30), topP = P(0, 0, 52);
    ctx.strokeStyle = '#3b2a18'; ctx.lineWidth = Math.max(1, c.k * 0.8); ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(topP[0], topP[1]); ctx.stroke();
    flag(ctx, topP, d.flag, 10 * c.k * 0.6, W.wind.from + Math.PI, t);
  };
  let done = false;
  for (const [x, y, hx, hy] of parts) {
    if (!done && x + y > 0) { tower(); done = true; }
    box(ctx, at(x, y), hx, hy, 0, hx === hy ? 13 : 10, stone, top);
  }
  if (!done) tower();
}

// A flag flying downwind from the top of a pole (screen point), drawn in plain colour blocks.
export function flag(ctx, [fx, fy], nation, L, windTo, t) {
  const dx = Math.sin(windTo), dy = -Math.cos(windTo);
  const ix = (dx - dy) * Math.SQRT1_2, iy = (dx + dy) * Math.SQRT1_2 * 0.5, l = Math.hypot(ix, iy) || 1;
  const ux = ix / l, uy = iy / l, H = L * 0.62;
  const pt = (u, v) => [fx + ux * u * L, fy + uy * u * L + v * H + Math.sin(t * 7 + u * 5) * u * L * 0.12];
  const band = (u0, u1, v0, v1, col) => poly(ctx, [pt(u0, v0), pt((u0 + u1) / 2, v0), pt(u1, v0), pt(u1, v1), pt((u0 + u1) / 2, v1), pt(u0, v1)], col);
  if (nation === 'nl') { band(0, 1, 0, 0.34, '#e8812f'); band(0, 1, 0.33, 0.67, '#efe8d6'); band(0, 1, 0.66, 1, '#3d5f8f'); }
  else if (nation === 'white') { band(0, 1, 0, 1, '#f4f1e6'); }
  else { band(0, 1, 0, 1, '#efe8d6'); band(0.32, 0.68, 0.22, 0.78, '#3f6fb0'); band(0.44, 0.56, 0.36, 0.64, '#b8322b'); }
}
