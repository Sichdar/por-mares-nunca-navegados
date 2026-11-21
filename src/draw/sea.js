// The sea (Phase 6): deep blue, lighter swells, turquoise shallows around land,
// wave crests drifting with the wind, and a faint line at the map's edge.
import { ground, screen, viewBounds, ISO } from './iso.js';
import { landPath } from './coast.js';

export const SEA = { deep: '#155270', mid: '#1b6585', rim: '#0d3044' };

// The sea floor (colour, swells, shallows) never changes during a fight, so it is painted
// once into a hidden picture at 1 pixel per 8 lengths and copied each frame (Phase 8 budget).
const PAD = 1200, RES = 8;
let floor = null;
function seaFloor(W) {
  if (floor && floor.map === W.map.id) return floor;
  const M = W.map, w = M.w + PAD * 2, h = M.h + PAD * 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w / RES); cv.height = Math.ceil(h / RES);
  const g = cv.getContext('2d');
  g.setTransform(1 / RES, 0, 0, 1 / RES, PAD / RES, PAD / RES);
  g.fillStyle = SEA.mid; g.fillRect(-PAD, -PAD, w, h);
  let sd = 99; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const n = Math.round(w * h / 200000);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w - PAD, y = rnd() * h - PAD, r = 160 + rnd() * 260, dark = rnd() < 0.45;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, dark ? 'rgba(16,64,92,.35)' : 'rgba(60,150,175,.22)'); rg.addColorStop(1, 'rgba(60,150,175,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // shallows around every piece of land, in bands of depth
  for (const L of M.land) {
    for (const [add, col] of [[170, 'rgba(64,160,165,.22)'], [95, 'rgba(78,182,176,.30)'], [42, 'rgba(150,215,200,.40)']]) {
      landPath(g, L, add); g.fillStyle = col; g.fill();
    }
  }
  floor = { map: M.id, cv, x: -PAD, y: -PAD, w, h };
  return floor;
}

export function drawSea(ctx, c, W, t, reduceMotion) {
  screen(ctx, c);
  ctx.fillStyle = SEA.deep; ctx.fillRect(0, 0, c.cw, c.ch);
  const b = viewBounds(c, 60);
  ground(ctx, c);
  const F = seaFloor(W);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(F.cv, F.x, F.y, F.w, F.h);
  // wave crests: spacing kept about the same on screen whatever the zoom
  const to = W.wind.from + Math.PI, perp = to + Math.PI / 2;
  const S = Math.pow(2, Math.round(Math.log2(26 / (c.zoom * ISO))));
  const drift = reduceMotion ? 0 : (t * 14) % S, ox = Math.sin(to) * drift, oy = -Math.cos(to) * drift;
  const wl = S * 0.16;
  ctx.lineWidth = 1.5 / c.zoom;
  for (const [alpha, phase] of [[0.10, 0], [0.17, 1], [0.26, 2]]) {
    ctx.strokeStyle = `rgba(236,246,240,${alpha})`; ctx.beginPath();
    for (let gx = Math.floor(b.x0 / S) * S - S; gx < b.x1 + S; gx += S) {
      for (let gy = Math.floor(b.y0 / S) * S - S; gy < b.y1 + S; gy += S) {
        const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453, j = h - Math.floor(h);
        if (Math.floor(j * 3) !== phase) continue;
        const cx = gx + ox + j * S * 0.8, cy = gy + oy + (1 - j) * S * 0.8, w = wl * (0.8 + j * 0.6);
        ctx.moveTo(cx - Math.sin(perp) * w, cy + Math.cos(perp) * w);
        ctx.quadraticCurveTo(cx + Math.sin(to) * w * 0.5, cy - Math.cos(to) * w * 0.5, cx + Math.sin(perp) * w, cy - Math.cos(perp) * w);
      }
    }
    ctx.stroke();
  }
  // the edge of the chart: beyond it a fleeing ship is gone
  ctx.setLineDash([24, 18]);
  ctx.strokeStyle = 'rgba(209,168,79,.35)'; ctx.lineWidth = 2 / c.zoom;
  ctx.strokeRect(0, 0, W.map.w, W.map.h);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(8,30,44,.35)';
  ctx.fillRect(-4000, -4000, W.map.w + 8000, 4000); ctx.fillRect(-4000, W.map.h, W.map.w + 8000, 4000);
  ctx.fillRect(-4000, 0, 4000, W.map.h); ctx.fillRect(W.map.w, 0, 4000, W.map.h);
}
