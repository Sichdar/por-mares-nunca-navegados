// Enemy captain (rule 8), Dutch warship role: patrol, hunt, board a weakened ship,
// break off at 25% hull or 30% crew. Thinks every 1.2 game seconds (fight test).
import { dist, bearing } from './geom.js';
import { BREAK_HULL, BREAK_CREW, VISION } from './rules.js';
import { hint, toast, ship, alive } from './core.js';
import { onLand } from './navigation.js';

export function updAI(W, e, dt) {
  if (e.ctrl !== 'ai' || !alive(W, e) || W.clash) return;
  e.aiT -= dt;
  if (e.aiT > 0) return;
  e.aiT = 1.2;
  const p = ship(W, W.playerId), d = dist(e, p), M = W.map;
  if (d > VISION) {
    if (!e.wp || Math.hypot(e.wp.x - e.x, e.wp.y - e.y) < 140) {
      for (let i = 0; i < 8; i++) {
        e.wp = { x: W.rng.range(M.w * 0.18, M.w * 0.82), y: W.rng.range(M.h * 0.18, M.h * 0.68) };
        if (!onLand(W, e.wp.x, e.wp.y, 150)) break;
      }
    }
    e.order = { type: 'move', x: e.wp.x, y: e.wp.y };
    e.sail = 'full';
    return;
  }
  if (e.hull < e.hullMax * BREAK_HULL || e.crew < e.crewMax * BREAK_CREW) {
    if (!e.fleeing) { e.fleeing = true; toast(W, 'sea.toast.breakingOff', { name: e.name }); hint(W, 'flee'); }
    const away = bearing(p, e);
    e.order = { type: 'flee', x: e.x + Math.sin(away) * 3000, y: e.y - Math.cos(away) * 3000 };
    e.sail = 'full'; e.shot = 'round';
    return;
  }
  e.sail = d < 800 ? 'battle' : 'full';
  if (e.crew > p.crew * 1.6 && p.hull < p.hullMax * 0.6) { e.order = { type: 'board', target: p.id }; e.shot = d < 160 ? 'grape' : 'round'; }
  else { e.order = { type: 'attack', target: p.id }; e.shot = d < 150 ? 'grape' : 'round'; }
}
