// Ships drawn by code (Phase 6), projected point by point so they turn through every heading.
// Two classes for M1: the Portuguese patacho (two masts) and a Dutch warship
// (three masts, rounded stern, darker hull). Nations differ by shape and colour.
import { TAU, wrapA, clamp, lerp } from '../sim/geom.js';
import { screen, projector, faces, lit, shade, poly } from './iso.js';
import { flag } from './coast.js';

const MODELS = {
  patacho: {
    hull: [[33, 0], [25, 7.5], [12, 11.2], [-4, 11.8], [-17, 10.8], [-27, 8.8], [-28.5, 0], [-27, -8.8], [-17, -10.8], [-4, -11.8], [12, -11.2], [25, -7.5]],
    masts: [{ f: 11, top: 58, sails: [[14, 33, 16], [35, 51, 11.5]] }, { f: -11, top: 50, sails: [[14, 30, 14], [32, 45, 10]] }],
    stern: [-28, -13, 8.6, 6.5], fore: [20, 28, 6, 3.5], bowsprit: 47,
    wood: [116, 80, 48], band: [72, 124, 186], sail: [242, 236, 216], cross: true,
  },
  dutchWarship: {
    hull: [[36, 0], [28, 8], [14, 12.6], [-4, 13.2], [-19, 12.8], [-27, 11], [-31, 6.5], [-32.5, 0], [-31, -6.5], [-27, -11], [-19, -12.8], [-4, -13.2], [14, -12.6], [28, -8]],
    masts: [{ f: 17, top: 54, sails: [[14, 31, 15], [33, 48, 11]] }, { f: 1, top: 62, sails: [[14, 35, 18], [37, 55, 13]] }, { f: -18, top: 46, base: 17, sails: [[20, 39, 10.5]] }],
    stern: [-32, -13, 9.5, 9], fore: [22, 30, 6.5, 4], bowsprit: 50,
    wood: [86, 60, 40], band: [214, 120, 46], sail: [232, 228, 212], cross: false,
  },
};

// s: { x, y, h, nation, model, sails, sail, roll, sinking, struck, luff }
export function drawShip(ctx, c, s, windFrom, t) {
  const M = MODELS[s.model] || MODELS.patacho;
  let lift = 0, alpha = 1, roll = s.roll;
  if (s.sinking) { const k = clamp(s.sinking / 3, 0, 1); lift = -k * 14 * c.k; alpha = 1 - k; roll += k * 0.35; }
  if (alpha <= 0.02) return;
  screen(ctx, c);
  ctx.globalAlpha = alpha;
  const P = projector(c, s.x, s.y, s.h, lift, roll), z = c.k;
  const W = P.dir;
  const HULL = M.hull, H = 8, WL = 0.84;
  // shadow, bow foam and wake on the water
  poly(ctx, HULL.map(([f, sd]) => P(f * 1.1, sd * 1.35, -sd * roll)), 'rgba(4,20,32,.35)');
  if (!s.sinking && s.speed > 0.15) {
    const fa = `rgba(240,250,248,${0.25 + 0.35 * s.speed})`;
    poly(ctx, [P(HULL[0][0] + 3, 0, 0), P(18, 15, 0), P(4, 17, 0), P(16, 12.5, 0)], fa);
    poly(ctx, [P(HULL[0][0] + 3, 0, 0), P(18, -15, 0), P(4, -17, 0), P(16, -12.5, 0)], fa);
  }
  // hull sides facing us, then the deck
  for (let i = 0; i < HULL.length; i++) {
    const a = HULL[i], b = HULL[(i + 1) % HULL.length], df = b[0] - a[0], ds = b[1] - a[1];
    let nf = ds, ns = -df;
    if (nf * ((a[0] + b[0]) / 2 - 2) + ns * ((a[1] + b[1]) / 2) < 0) { nf = -nf; ns = -ns; }
    const [wx, wy] = W(nf, ns);
    if (!faces(wx, wy)) continue;
    const L = lit(wx, wy) * (0.75 + 0.25 * s.hullPct);
    poly(ctx, [P(a[0] * WL, a[1] * WL, 0), P(b[0] * WL, b[1] * WL, 0), P(b[0], b[1], H), P(a[0], a[1], H)], shade(M.wood, L), 'rgba(30,18,8,.6)', 0.7);
    poly(ctx, [P(a[0] * 0.97, a[1] * 0.97, 1.2), P(b[0] * 0.97, b[1] * 0.97, 1.2), P(b[0] * 0.95, b[1] * 0.95, 2.2), P(a[0] * 0.95, a[1] * 0.95, 2.2)], shade([60, 40, 24], L));
    poly(ctx, [P(a[0], a[1], H - 2.4), P(b[0], b[1], H - 2.4), P(b[0], b[1], H - 0.8), P(a[0], a[1], H - 0.8)], shade(M.band, L));
    if (Math.abs(a[1] + b[1]) > 18 && Math.abs(df) > 8) {
      for (const u of [0.3, 0.7]) { // gun ports
        const m = (uu, h) => { const k = lerp(WL, 1, h / H); return P(lerp(a[0], b[0], uu) * k, lerp(a[1], b[1], uu) * k, h); };
        poly(ctx, [m(u - 0.09, 3.4), m(u + 0.09, 3.4), m(u + 0.09, 5.3), m(u - 0.09, 5.3)], '#160e07');
      }
    }
  }
  poly(ctx, HULL.map(([f, sd]) => P(f, sd, H)), shade([176, 142, 96], 1), 'rgba(40,25,10,.6)', 0.8);
  ctx.strokeStyle = 'rgba(90,62,34,.45)'; ctx.lineWidth = 0.6;
  for (const sd of [-6, -3, 0, 3, 6]) { const p0 = P(HULL[0][0] - 6 - Math.abs(sd), sd, H), p1 = P(HULL[HULL.length >> 1][0] + 2, sd, H); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
  // castles
  const boxL = (f0, f1, half, h1) => {
    const s0 = -half, s1 = half;
    for (const [nf, ns, A, B] of [[1, 0, [f1, s0], [f1, s1]], [-1, 0, [f0, s1], [f0, s0]], [0, 1, [f1, s1], [f0, s1]], [0, -1, [f0, s0], [f1, s0]]]) {
      const [wx, wy] = W(nf, ns);
      if (faces(wx, wy)) poly(ctx, [P(A[0], A[1], H), P(B[0], B[1], H), P(B[0], B[1], H + h1), P(A[0], A[1], H + h1)], shade(M.wood, lit(wx, wy) * 1.08), 'rgba(30,18,8,.6)', 0.7);
    }
    poly(ctx, [P(f0, s0, H + h1), P(f1, s0, H + h1), P(f1, s1, H + h1), P(f0, s1, H + h1)], shade([176, 142, 96], 1.05), 'rgba(40,25,10,.6)', 0.7);
  };
  boxL(M.stern[0], M.stern[1], M.stern[2], M.stern[3]);
  boxL(M.fore[0], M.fore[1], M.fore[2], M.fore[3]);
  ctx.strokeStyle = '#3b2814'; ctx.lineWidth = Math.max(1, z); ctx.lineCap = 'round';
  { const a = P(HULL[0][0] - 3, 0, H + 2), b = P(M.bowsprit, 0, H + 10); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  { const l = P(M.stern[0], 0, H + M.stern[3] + 3); ctx.fillStyle = '#f3d27a'; ctx.beginPath(); ctx.arc(l[0], l[1], Math.max(1, z * 0.8), 0, TAU); ctx.fill(); }
  // masts and sails, back to front; sails trimmed toward where the wind blows, flapping when into it
  const windTo = windFrom + Math.PI;
  const trim = clamp(wrapA(windTo - s.h) * 0.5, -1.05, 1.05);
  const yf = -Math.sin(trim), ys = Math.cos(trim), nf = Math.cos(trim), ns = Math.sin(trim);
  const [snx, sny] = W(nf, ns), front = faces(snx, sny), sL = 0.86 + 0.18 * lit(snx, sny) - 0.1;
  const hp = s.sails / 100;
  const rgb = [Math.round(M.sail[0] - (1 - hp) * 80), Math.round(M.sail[1] - (1 - hp) * 85), Math.round(M.sail[2] - (1 - hp) * 80)];
  const belly = s.luff ? 1.2 + Math.sin(t * 14) * 1.2 : 5.5;
  const masts = M.masts.map((m) => ({ m, d: W(m.f, 0).reduce((a, b) => a + b) })).sort((a, b) => a.d - b.d);
  for (const { m } of masts) {
    const base = m.base || H;
    const pole = () => {
      const a = P(m.f, 0, base), b = P(m.f, 0, m.top);
      ctx.strokeStyle = '#4a3219'; ctx.lineWidth = Math.max(1.2, 1.2 * z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(40,28,14,.7)';
      for (const sd of [-11, 11]) { const p0 = P(m.f - 4, sd, H), p1 = P(m.f, 0, m.top - 6); ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); }
    };
    if (front) pole();
    m.sails.forEach(([z0, z1, w], j) => {
      const C = (tt, h, bl) => P(m.f + yf * tt + nf * bl, ys * tt + ns * bl, h);
      const y0 = C(-w * 1.1, z1, 0), y1 = C(w * 1.1, z1, 0);
      ctx.strokeStyle = '#3b2814'; ctx.lineWidth = Math.max(1, 0.8 * z); ctx.beginPath(); ctx.moveTo(y0[0], y0[1]); ctx.lineTo(y1[0], y1[1]); ctx.stroke();
      if (s.sail === 'battle' && j === 0 && m.sails.length > 1) { // courses furled in battle sail
        const a = C(-w, z1 - 1, 0), b = C(w, z1 - 1, 0);
        ctx.strokeStyle = shade(rgb, 0.85); ctx.lineWidth = Math.max(1.5, 1.6 * z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        return;
      }
      const b = belly;
      const q = (pa, pb) => ctx.quadraticCurveTo(pa[0], pa[1], pb[0], pb[1]);
      const st = C(-w, z1, 0);
      ctx.beginPath(); ctx.moveTo(st[0], st[1]);
      q(C(0, z1, b * 0.3), C(w, z1, 0));
      q(C(w * 1.06, (z0 + z1) / 2, b), C(w * 0.9, z0, b * 0.7));
      q(C(0, z0 - 1.5, b * 1.6), C(-w * 0.9, z0, b * 0.7));
      q(C(-w * 1.06, (z0 + z1) / 2, b), st);
      ctx.closePath();
      const g0 = C(0, z1, 0), g1 = C(0, z0, b);
      const g = ctx.createLinearGradient(g0[0], g0[1], g1[0], g1[1]);
      g.addColorStop(0, shade(rgb, sL * 1.02)); g.addColorStop(1, shade(rgb, sL * 0.86));
      ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(70,55,35,.55)'; ctx.stroke();
      if (hp < 0.6) { // shot holes
        ctx.fillStyle = 'rgba(40,30,20,.55)';
        const holes = Math.round((1 - hp) * 5);
        for (let i = 0; i < holes; i++) { const hpnt = C(w * (((i * 37 + j * 11) % 10) / 10 - 0.5) * 1.4, z0 + (z1 - z0) * (((i * 53) % 10) / 12 + 0.1), b * 0.9); ctx.beginPath(); ctx.arc(hpnt[0], hpnt[1], Math.max(0.8, z * 0.7), 0, TAU); ctx.fill(); }
      }
      if (M.cross && j === 0 && front) { // a red cross on the courses
        const X = (tt, h) => C(tt, h, b * 0.9);
        const a1 = X(0, z1 - 3), a2 = X(0, z0 + 3), a3 = X(-w * 0.45, (z0 + z1) / 2 + 1), a4 = X(w * 0.45, (z0 + z1) / 2 + 1);
        ctx.strokeStyle = 'rgba(170,40,40,.8)'; ctx.lineWidth = Math.max(1.2, 1.3 * z);
        ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.moveTo(a3[0], a3[1]); ctx.lineTo(a4[0], a4[1]); ctx.stroke();
      }
    });
    if (!front) pole();
  }
  const tall = M.masts.reduce((a, m) => (m.top > a.top ? m : a), M.masts[0]);
  if (!s.sinking) flag(ctx, P(tall.f, 0, tall.top + 1), s.struck ? 'white' : s.nation, 9 * z * 0.6, windTo, t);
  ctx.globalAlpha = 1;
}

// The screen box a tap must land in to pick this ship (sails included, Phase 3).
export function pickBox(c, s) {
  const P = projector(c, s.x, s.y, s.h);
  const pts = [P(36, 0, 0), P(-32, 0, 0), P(0, 14, 0), P(0, -14, 0), P(0, 0, 62)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = Math.max(8, 22 - c.k * 6);
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad, cx: P.base[0], cy: P.base[1] - 22 * c.k };
}
