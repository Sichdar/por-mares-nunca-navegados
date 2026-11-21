// The isometric camera (Phase 3, Phase 6): north to the upper right.
// Ground things are drawn with a skewed canvas transform; upright things (ships, palms,
// huts, smoke) are projected point by point with a height, drawn larger than the map
// scale so they stay readable on a phone (scale `k`).
export const ISO = Math.SQRT1_2;
export const ZS = 0.9; // how tall heights look

export const isoX = (x, y) => (x - y) * ISO;
export const isoY = (x, y) => (x + y) * ISO * 0.5;

export function createCamera() {
  return { x: 2000, y: 3000, zoom: 0.4, base: 0.4, user: 0.4, follow: true, cw: 0, ch: 0, dpr: 1, cyf: 0.52, k: 1 };
}

// Fit the camera to the canvas size (CSS pixels). The base zoom shows about 900 lengths across.
export function fitCamera(c, cw, ch, dpr) {
  const nb = cw / 900;
  c.zoom = c.zoom / c.base * nb; c.user = c.user / c.base * nb; c.base = nb;
  c.cw = cw; c.ch = ch; c.dpr = dpr;
  updateScale(c);
}

// byUser: a pinch or the mouse wheel; the camera's own framing never changes the player's choice.
export function setZoom(c, z, byUser = false) {
  c.zoom = Math.min(c.base * 2.4, Math.max(c.base * 0.45, z));
  if (byUser) c.user = c.zoom;
  updateScale(c);
}

// Ships and other upright things: about 3× the map scale, but never tiny.
function updateScale(c) { c.k = Math.max(c.zoom * 3, 0.9); }

export const w2s = (c, x, y) => [isoX(x - c.x, y - c.y) * c.zoom + c.cw / 2, isoY(x - c.x, y - c.y) * c.zoom + c.ch * c.cyf];

export function s2w(c, sx, sy) {
  const u = (sx - c.cw / 2) / (c.zoom * ISO), v = (sy - c.ch * c.cyf) / (c.zoom * ISO * 0.5);
  return [c.x + (u + v) / 2, c.y + (v - u) / 2];
}

// Draw in world units on the sea surface (lift: screen pixels upward).
export function ground(ctx, c, lift = 0) {
  const z = c.zoom * ISO, d = c.dpr;
  ctx.setTransform(d * z, d * z * 0.5, -d * z, d * z * 0.5,
    d * (c.cw / 2 - z * (c.x - c.y)), d * (c.ch * c.cyf - z * 0.5 * (c.x + c.y) - lift));
}

export const screen = (ctx, c) => ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);

// A projector for an upright thing standing at world (x, y), facing h:
// P(forward, starboard, height) in the thing's own units → screen pixels.
export function projector(c, x, y, h = 0, lift = 0, roll = 0) {
  const fx = Math.sin(h), fy = -Math.cos(h), rx = Math.cos(h), ry = Math.sin(h);
  const [bx, by] = w2s(c, x, y), k = c.k;
  const P = (f, sd, ht) => {
    const dx = f * fx + sd * rx, dy = f * fy + sd * ry;
    ht += sd * roll;
    return [bx + isoX(dx, dy) * k, by - lift + isoY(dx, dy) * k - ht * ZS * k];
  };
  P.dir = (nf, ns) => [nf * fx + ns * rx, nf * fy + ns * ry];
  P.base = [bx, by];
  return P;
}

// Does a world-direction normal face the viewer (who looks toward the north-west)?
export const faces = (wx, wy) => wx + wy > 0;
// Light from the screen's left.
export const lit = (wx, wy) => { const l = Math.hypot(wx, wy) || 1; return 0.72 + 0.3 * (-(wx - wy) / (l * Math.SQRT2)); };

export const shade = (rgb, k) => `rgb(${Math.round(Math.min(255, Math.max(0, rgb[0] * k)))},${Math.round(Math.min(255, Math.max(0, rgb[1] * k)))},${Math.round(Math.min(255, Math.max(0, rgb[2] * k)))})`;

export function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// Screen direction (radians, canvas convention) of a world heading (0 = north, clockwise).
export function screenAngle(h) {
  const dx = Math.sin(h), dy = -Math.cos(h);
  return Math.atan2(isoY(dx, dy), isoX(dx, dy));
}

// World box seen on screen (with a margin in pixels), for skipping things off screen.
export function viewBounds(c, m = 80) {
  const pts = [s2w(c, -m, -m), s2w(c, c.cw + m, -m), s2w(c, -m, c.ch + m), s2w(c, c.cw + m, c.ch + m)];
  return {
    x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])),
    y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])),
  };
}
