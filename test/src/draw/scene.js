// One frame of the sea: water, land, wakes, gun arcs and orders on the water,
// then ships, palms and buildings from far to near, then smoke and words.
import { TAU, DEG, clamp, wrapA, bearing, dist } from '../sim/geom.js';
import { SHOTS, ARC } from '../sim/rules.js';
import { reloadTime } from '../sim/gunnery.js';
import { ground, screen, w2s, ZS } from './iso.js';
import { drawSea } from './sea.js';
import { drawLandGround, landItems } from './coast.js';
import { drawShip } from './ships.js';
import { drawWakes, drawGroundFx, drawAirFx, drawTextFx } from './effects.js';

const GOLD = '#d1a84f', ORANGE = '#e8812f', INK = '#efe8d6';

// v: { ships: shown ships (smoothed positions), player, enemy, enemySeen, fx, t, alpha, text, font,
//      reduceMotion, press: {x, y, k} for the long-press ring }
export function drawScene(ctx, c, W, v) {
  const { player: p, enemy: e } = v;
  drawSea(ctx, c, W, v.t, v.reduceMotion);
  drawLandGround(ctx, c, W, v.reduceMotion, v.t);
  drawWakes(ctx, c, v.fx, W.t, (id) => id === p.id || v.enemySeen || e.sinking);
  if (!W.over && !W.clash && !p.sinking) drawArcs(ctx, c, W, p, e, v.enemySeen);
  drawRings(ctx, c, W, p, e, v.enemySeen);
  drawOrder(ctx, c, W, p, e, v.enemySeen);
  drawGroundFx(ctx, c, v.fx);
  const items = landItems(c, W, v.t, v.reduceMotion);
  for (const s of v.ships) {
    if (s.id !== p.id && !(v.enemySeen || s.sinking)) continue;
    items.push({ d: s.x + s.y, fn: (cx) => drawShip(cx, c, s, W.wind.from, v.t) });
  }
  items.sort((a, b) => a.d - b.d);
  for (const it of items) it.fn(ctx);
  drawAirFx(ctx, c, v.fx, W.proj, v.ships, v.alpha);
  drawTextFx(ctx, c, v.fx, v.text, v.font);
  drawLabels(ctx, c, W, v);
  if (v.press) drawPress(ctx, c, v.press);
}

// The two gold firing arcs on the water, with the reload filling along the rim.
function drawArcs(ctx, c, W, p, e, seen) {
  ground(ctx, c);
  const R = SHOTS[p.shot].range, hold = p.stance === 'hold';
  for (const side of [1, -1]) {
    const beam = p.h + side * 90 * DEG;
    const a0 = beam - ARC - Math.PI / 2, a1 = beam + ARC - Math.PI / 2;
    let inside = false;
    if (seen && !e.sinking && !e.struck) inside = dist(p, e) <= R && Math.abs(wrapA(bearing(p, e) - beam)) <= ARC;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, R, a0, a1); ctx.closePath();
    ctx.fillStyle = inside && !hold ? 'rgba(209,168,79,.22)' : 'rgba(236,228,207,.06)'; ctx.fill();
    ctx.lineWidth = 1.2 / c.zoom; ctx.strokeStyle = inside && !hold ? GOLD : 'rgba(236,228,207,.25)'; ctx.stroke();
    ctx.setLineDash([5 / c.zoom, 6 / c.zoom]); ctx.strokeStyle = 'rgba(236,228,207,.2)';
    for (const rr of [150, 300]) if (rr < R) { ctx.beginPath(); ctx.arc(p.x, p.y, rr, a0, a1); ctx.stroke(); }
    ctx.setLineDash([]);
    const prog = clamp(1 - p.reload[side] / reloadTime(p), 0, 1);
    ctx.lineWidth = (seen ? 4.5 : 2.5) / c.zoom;
    ctx.strokeStyle = !seen ? 'rgba(209,168,79,.35)' : prog >= 1 ? GOLD : 'rgba(209,168,79,.55)';
    ctx.beginPath(); ctx.arc(p.x, p.y, R, a0, a0 + (a1 - a0) * prog); ctx.stroke();
  }
}

// A ring on the water under each ship: gold and solid for yours, orange and dashed for the enemy
// (a pattern as well as a colour, for colour-blind players).
function drawRings(ctx, c, W, p, e, seen) {
  ground(ctx, c);
  const r = 34 * c.k / (c.zoom * 0.707);
  if (!p.sinking) {
    ctx.strokeStyle = 'rgba(209,168,79,.85)'; ctx.lineWidth = 2.2 / c.zoom;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
  }
  if (seen && !e.sinking) {
    ctx.strokeStyle = 'rgba(232,129,47,.9)'; ctx.lineWidth = 2.2 / c.zoom;
    ctx.setLineDash([9 / c.zoom, 7 / c.zoom]);
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawOrder(ctx, c, W, p, e, seen) {
  const o = p.order;
  ground(ctx, c);
  if (o.type === 'move') {
    ctx.setLineDash([4 / c.zoom, 7 / c.zoom]); ctx.strokeStyle = 'rgba(236,228,207,.55)'; ctx.lineWidth = 1.6 / c.zoom;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(o.x, o.y); ctx.stroke(); ctx.setLineDash([]);
    const r = 12 / c.zoom; ctx.strokeStyle = INK; ctx.lineWidth = 3 / c.zoom;
    ctx.beginPath(); ctx.moveTo(o.x - r, o.y - r); ctx.lineTo(o.x + r, o.y + r); ctx.moveTo(o.x + r, o.y - r); ctx.lineTo(o.x - r, o.y + r); ctx.stroke();
  } else if ((o.type === 'attack' || o.type === 'board') && seen && !e.sinking) {
    const r = 46 * c.k / (c.zoom * 0.707);
    ctx.setLineDash([8 / c.zoom, 6 / c.zoom]); ctx.lineDashOffset = -W.t * 20;
    ctx.strokeStyle = o.type === 'board' ? ORANGE : GOLD; ctx.lineWidth = 3 / c.zoom;
    ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
}

function label(ctx, t, x, y, col) {
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(t, x + 1, y + 1);
  ctx.fillStyle = col; ctx.fillText(t, x, y);
}

function drawLabels(ctx, c, W, v) {
  screen(ctx, c);
  const { player: p, enemy: e } = v;
  ctx.textAlign = 'center'; ctx.font = `700 14px ${v.font}`;
  const below = 22 * c.k + 18;
  const [psx, psy] = w2s(c, p.x, p.y);
  if (!p.sinking) label(ctx, p.name, psx, psy + below, INK);
  if (v.enemySeen && (!e.sinking || e.sinking < 2)) {
    const [sx, sy] = w2s(c, e.x, e.y);
    const name = e.fleeing ? v.text('sea.label.fleeing', { name: e.name }) : e.name;
    // when the ships are close, the enemy's name goes above her masts so the two names don't overlap
    const close = Math.abs(sx - psx) < 110 && Math.abs(sy - psy) < 40;
    if (sx > -20 && sx < c.cw + 20 && sy > -20 && sy < c.ch + 20) label(ctx, name, sx, close ? sy - 62 * c.k - 6 : sy + below, '#f0a060');
    else edgeArrow(ctx, c, e.x, e.y, ORANGE, Math.round(dist(p, e) / 10) * 10 + '');
  } else if (!W.over && W.lastKnown) {
    const [sx, sy] = w2s(c, W.lastKnown.x, W.lastKnown.y);
    if (sx > 0 && sx < c.cw && sy > 0 && sy < c.ch) {
      ctx.fillStyle = 'rgba(232,129,47,.7)'; ctx.font = `700 22px ${v.font}`; ctx.fillText('?', sx, sy - 10);
    } else edgeArrow(ctx, c, W.lastKnown.x, W.lastKnown.y, 'rgba(232,129,47,.65)', v.text(W.sighted ? 'sea.label.lastSeen' : 'sea.label.reported'));
  }
}

// An arrow at the screen's edge pointing to something out of view.
function edgeArrow(ctx, c, wx, wy, col, txt) {
  const [sx, sy] = w2s(c, wx, wy), cx = c.cw / 2, cy = c.ch / 2, a = Math.atan2(sy - cy, sx - cx);
  const mx = c.cw / 2 - 30, my = c.ch / 2 - 80, t = Math.min(Math.abs(mx / Math.cos(a)), Math.abs(my / Math.sin(a)));
  const x = cx + Math.cos(a) * t, y = cy + Math.sin(a) * t + 10;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.font = '700 13px sans-serif';
  ctx.fillStyle = col; ctx.fillText(txt, x - Math.cos(a) * 34, y - Math.sin(a) * 24 + 4);
}

// The filling ring of a long press (board), so the player sees it coming (Phase 8).
function drawPress(ctx, c, pr) {
  screen(ctx, c);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.arc(pr.x, pr.y, 30, 0, TAU); ctx.stroke();
  ctx.strokeStyle = ORANGE;
  ctx.beginPath(); ctx.arc(pr.x, pr.y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(pr.k, 0, 1)); ctx.stroke();
}
