// Effects (Phase 6): gun smoke drifting downwind, splashes, splinters, floating words,
// wakes. They live only on screen; the rules never read them. At most about 400 at once.
import { TAU, clamp, lerp } from '../sim/geom.js';
import { ground, screen, w2s, ZS } from './iso.js';

const MAX = 400;

export function createEffects() { return { list: [], wakes: new Map(), seed: 1 }; }

function rnd(F) { F.seed = (F.seed * 16807) % 2147483647; return F.seed / 2147483647; }
const r2 = (F, a, b) => a + rnd(F) * (b - a);
function add(F, p) { F.list.push(p); if (F.list.length > MAX) F.list.splice(0, F.list.length - MAX); }

// Turn the rules' events into things to see. `text(key)` gives a translated word.
export function onEvent(F, ev, simple) {
  if (ev.k === 'gun') {
    const bx = Math.sin(ev.beam) * 12, by = -Math.cos(ev.beam) * 12;
    add(F, { k: 'flash', x: ev.x + bx, y: ev.y + by, t: 0, life: 0.14 });
    const n = simple ? 1 : 2;
    for (let i = 0; i < n; i++) add(F, { k: 'smoke', x: ev.x + bx * (1 + i), y: ev.y + by * (1 + i), h: r2(F, 4, 9), t: 0, life: r2(F, 2.2, 3.2), r: r2(F, 6, 10) });
  } else if (ev.k === 'hit') {
    for (let j = 0; j < (simple ? 2 : 4); j++) add(F, { k: 'chip', x: ev.x, y: ev.y, vx: r2(F, -40, 40), vy: r2(F, -40, 40), vh: r2(F, 20, 45), h: 8, t: 0, life: r2(F, 0.5, 0.9) });
    add(F, { k: 'smoke', x: ev.x, y: ev.y, h: 14, t: 0, life: 1.2, r: 4 });
  } else if (ev.k === 'miss') {
    add(F, { k: 'splash', x: ev.x, y: ev.y, t: 0, life: 0.9 });
  } else if (ev.k === 'rake') {
    add(F, { k: 'text', x: ev.x, y: ev.y, key: 'sea.fx.raked', col: '#e0b456', t: 0, life: 1.8 });
  } else if (ev.k === 'aground') {
    add(F, { k: 'text', x: ev.x, y: ev.y, key: 'sea.fx.aground', col: '#e2604f', t: 0, life: 1.8 });
  } else if (ev.k === 'struck') {
    add(F, { k: 'text', x: ev.x, y: ev.y, key: 'sea.fx.struck', col: '#e0b456', t: 0, life: 2.4 });
  }
}

export function updEffects(F, dt, wind, ships, gameT) {
  const wx = Math.sin(wind + Math.PI) * 12, wy = -Math.cos(wind + Math.PI) * 12;
  for (let i = F.list.length - 1; i >= 0; i--) {
    const f = F.list[i];
    f.t += dt;
    if (f.k === 'smoke') { f.x += wx * dt; f.y += wy * dt; f.h += 3 * dt; }
    if (f.k === 'chip') { f.x += f.vx * dt; f.y += f.vy * dt; f.h += f.vh * dt; f.vh -= 120 * dt; }
    if (f.t > f.life) F.list.splice(i, 1);
  }
  for (const s of ships) {
    if (s.sinking && rnd(F) < 0.3 * dt * 20) add(F, { k: 'splash', x: s.x + r2(F, -25, 25), y: s.y + r2(F, -25, 25), t: 0, life: 0.7 });
    let w = F.wakes.get(s.id);
    if (!w) { w = { pts: [], t: 0 }; F.wakes.set(s.id, w); }
    w.t -= dt;
    if (w.t <= 0 && !s.sinking) {
      w.t = 0.12;
      w.pts.push({ x: s.x - Math.sin(s.h) * 28, y: s.y + Math.cos(s.h) * 28, t: gameT });
      if (w.pts.length > 45) w.pts.shift();
    }
  }
}

export function drawWakes(ctx, c, F, gameT, visible) {
  ground(ctx, c);
  ctx.lineCap = 'round';
  for (const [id, w] of F.wakes) {
    if (!visible(id)) continue;
    for (let i = 1; i < w.pts.length; i++) {
      const a = w.pts[i - 1], b = w.pts[i], age = gameT - b.t;
      ctx.strokeStyle = `rgba(236,246,244,${clamp(0.26 - age * 0.05, 0, 0.26)})`;
      ctx.lineWidth = (6 + age * 4) * c.k / c.zoom * 0.4;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
}

// Rings of splashes on the water (drawn before the ships).
export function drawGroundFx(ctx, c, F) {
  ground(ctx, c);
  for (const f of F.list) {
    if (f.k !== 'splash') continue;
    const k = f.t / f.life;
    ctx.strokeStyle = `rgba(240,250,250,${0.75 * (1 - k)})`; ctx.lineWidth = 1.6 / c.zoom;
    ctx.beginPath(); ctx.arc(f.x, f.y, (4 + k * 18) * c.k / c.zoom * 0.35, 0, TAU); ctx.stroke();
  }
}

// Smoke, flashes, splash columns, splinters and balls (drawn over the ships).
export function drawAirFx(ctx, c, F, proj, ships, alpha) {
  screen(ctx, c);
  const k = c.k;
  for (const f of F.list) {
    const q = f.t / f.life;
    if (f.k === 'smoke') {
      const [sx, sy] = w2s(c, f.x, f.y), y = sy - f.h * ZS * k, r = (f.r + q * 22) * k * 0.8;
      ctx.fillStyle = `rgba(232,230,222,${0.55 * (1 - q)})`; ctx.beginPath(); ctx.arc(sx, y, r, 0, TAU); ctx.fill();
    } else if (f.k === 'flash') {
      const [sx, sy] = w2s(c, f.x, f.y);
      ctx.fillStyle = `rgba(255,214,120,${1 - q})`; ctx.beginPath(); ctx.arc(sx, sy - 5 * ZS * k, 4 * k, 0, TAU); ctx.fill();
    } else if (f.k === 'splash') {
      const [sx, sy] = w2s(c, f.x, f.y), hh = Math.sin(clamp(q * 1.6, 0, 1) * Math.PI) * 15 * k * ZS;
      if (hh > 0.5) { ctx.fillStyle = 'rgba(236,246,246,.85)'; ctx.beginPath(); ctx.ellipse(sx, sy - hh / 2, 2.2 * k, hh / 2 + 1, 0, 0, TAU); ctx.fill(); }
    } else if (f.k === 'chip') {
      const [sx, sy] = w2s(c, f.x, f.y);
      ctx.fillStyle = `rgba(150,105,60,${1 - q})`; ctx.fillRect(sx - 1.5 * k, sy - f.h * ZS * k - 1.5 * k, 3 * k, 3 * k);
    }
  }
  // balls in flight: an arc from the gun to where they land
  const byId = new Map(ships.map((s) => [s.id, s]));
  for (const p of proj) {
    const tt = p.t + alpha * 0.05;
    if (tt < 0) continue;
    const u = clamp(tt / p.dur, 0, 1), tgt = byId.get(p.target);
    const ex = p.hit && tgt ? tgt.x + p.ox : p.mx, ey = p.hit && tgt ? tgt.y + p.oy : p.my;
    const [sx, sy] = w2s(c, lerp(p.x0, ex, u), lerp(p.y0, ey, u)), h = lerp(6, 4, u) + Math.sin(u * Math.PI) * 18;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(sx, sy, 1.4 * k, 0.7 * k, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(sx, sy - h * ZS * k, Math.max(1.4, 1.1 * k), 0, TAU); ctx.fill();
  }
}

// Floating words, in the chosen language.
export function drawTextFx(ctx, c, F, text, font) {
  screen(ctx, c);
  ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(13 + c.k * 1.5)}px ${font}`;
  for (const f of F.list) {
    if (f.k !== 'text') continue;
    const [sx, sy] = w2s(c, f.x, f.y), y = sy - 60 * c.k - f.t * 18;
    ctx.globalAlpha = clamp(1.4 - f.t / f.life * 1.4, 0, 1);
    const s = text(f.key);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(s, sx + 1, y + 1);
    ctx.fillStyle = f.col; ctx.fillText(s, sx, y);
  }
  ctx.globalAlpha = 1;
}
