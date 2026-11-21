// Seeing (Phase 8): can the player's lookout see the enemy?
// M1 has daylight only; night and fog change VISION later (Phase 4).
import { dist } from './geom.js';
import { VISION } from './rules.js';
import { ship } from './core.js';

export function enemyVisible(W) {
  const p = ship(W, W.playerId), e = ship(W, W.enemyId);
  return !!p && !!e && !e.sinking && dist(p, e) < VISION;
}
