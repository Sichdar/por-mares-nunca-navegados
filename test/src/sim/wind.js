// Wind (rule 1): shifts up to ±30° around its base every 40–80 game seconds,
// and its strength changes between light, fair and strong.
import { DEG, TAU, norm, wrapA, clamp } from './geom.js';
import { WIND_SHIFT } from './rules.js';
import { toast } from './core.js';

export function createWind(W, def) {
  const from = (def.from ?? 45) * DEG;
  return { from, base: from, target: from, str: def.str ?? 1, next: W.rng.range(40, 80) };
}

const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compass = (a) => DIRS[Math.round(norm(a) / (TAU / 8)) % 8];
export const windWord = (s) => (s < 0.8 ? 'light' : s > 1.1 ? 'strong' : 'fair');

export function updWind(W, dt) {
  const w = W.wind;
  w.next -= dt;
  if (w.next <= 0) {
    w.next = W.rng.range(40, 80);
    w.target = norm(w.base + W.rng.range(-1, 1) * WIND_SHIFT);
    const r = W.rng.next();
    w.str = r < 0.2 ? 0.7 : r > 0.8 ? 1.2 : 1;
    if (compass(w.target) !== compass(w.from)) toast(W, 'sea.toast.windShift', { dir: compass(w.target) });
  }
  w.from = norm(w.from + clamp(wrapA(w.target - w.from), -dt * 6 * DEG, dt * 6 * DEG));
}
