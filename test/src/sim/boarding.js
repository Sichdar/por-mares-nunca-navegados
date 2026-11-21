// Boarding (rule 3): grapple a slowed ship, then a clash in rounds of 5 s.
// Volley beats Charge, Charge beats Hold, Hold beats Volley (+30%).
// The enemy officer shows a tell half-way through each round (true 3 times in 4).
import { dist } from './geom.js';
import {
  TACTICS, BEATS, TACTIC_BONUS, CLASH_ROUND, GRAPPLE_RANGE, GRAPPLE_SLOW, LOSS_RATE,
  SURRENDER_CREW, SURRENDER_MORALE, TELL_HONEST,
} from './rules.js';
import { emit, hint, ship, alive, isPlayer, endFight } from './core.js';

export function checkGrapple(W) {
  if (W.clash || W.over) return;
  const p = ship(W, W.playerId), e = ship(W, W.enemyId);
  if (!alive(W, p) || !alive(W, e)) return;
  const d = dist(p, e);
  for (const [a, b] of [[p, e], [e, p]]) {
    if (a.order.type === 'board' && a.order.target === b.id && d < GRAPPLE_RANGE) {
      if (b.v < b.top * GRAPPLE_SLOW) { startClash(W, a); return; }
      if (isPlayer(W, a)) hint(W, 'tooFast', 12);
    }
  }
  if (d < 55) { // ships don't sail through each other
    const dx = e.x - p.x, dy = e.y - p.y, dd = Math.max(1, Math.hypot(dx, dy)), push = (55 - dd) / 2;
    p.x -= dx / dd * push; p.y -= dy / dd * push; e.x += dx / dd * push; e.y += dy / dd * push;
    p.v *= 0.8; e.v *= 0.8;
  }
}

export function startClash(W, by) {
  const p = ship(W, W.playerId), e = ship(W, W.enemyId);
  W.clash = {
    round: 1, t: 0, len: CLASH_ROUND, pt: 'hold', et: null, shown: null, lastP: null, lastE: null,
    p0: p.crew, e0: e.crew, by: by.id, log: null,
  };
  W.proj.length = 0;
  p.order = { type: 'none' }; e.order = { type: 'none' };
  emit(W, { k: 'clash', by: by.id });
}

export const canUse = (c, tac) => !(tac === 'volley' && c.lastP === 'volley'); // muskets need a round to reload

export function setTactic(W, tac) {
  const c = W.clash;
  if (c && TACTICS.includes(tac) && canUse(c, tac)) c.pt = tac;
}

function enemyPick(W, c) {
  const e = ship(W, W.enemyId), p = ship(W, W.playerId);
  const opts = TACTICS.filter((x) => !(x === 'volley' && c.lastE === 'volley'));
  const w = opts.map((x) => (x === 'charge' ? (e.crew > p.crew ? 2 : 1) : x === 'hold' ? (e.crew < p.crew ? 2 : 1) : 1.3));
  let r = W.rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
  return opts[0];
}

export const strength = (s, tac, other) => s.crew * (s.morale / 100) * (BEATS[tac] === other ? TACTIC_BONUS : 1);

export function updClash(W, dt) {
  const c = W.clash;
  c.t += dt;
  if (!c.et) c.et = enemyPick(W, c);
  if (!c.shown && c.t >= c.len / 2) {
    if (W.rng.next() < TELL_HONEST) c.shown = c.et;
    else { const o = TACTICS.filter((x) => x !== c.et); c.shown = o[Math.floor(W.rng.next() * 2)]; }
    emit(W, { k: 'tell', tac: c.shown });
  }
  if (c.t >= c.len) resolveRound(W, c);
}

function resolveRound(W, c) {
  const P = ship(W, W.playerId), E = ship(W, W.enemyId);
  const sp = strength(P, c.pt, c.et), se = strength(E, c.et, c.pt);
  const lp = Math.min(P.crew, se * LOSS_RATE * W.rng.range(0.8, 1.2));
  const le = Math.min(E.crew, sp * LOSS_RATE * W.rng.range(0.8, 1.2));
  P.crew -= lp; E.crew -= le; P.stats.menKilled += le; E.stats.menKilled += lp;
  if (sp > se) { E.morale = Math.max(0, E.morale - 6); P.morale = Math.min(100, P.morale + 3); }
  else { P.morale = Math.max(0, P.morale - 6); E.morale = Math.min(100, E.morale + 3); }
  const edge = BEATS[c.pt] === c.et ? 'ours' : BEATS[c.et] === c.pt ? 'theirs' : 'even';
  c.log = { round: c.round, pt: c.pt, et: c.et, edge, lp: Math.round(lp), le: Math.round(le) };
  emit(W, { k: 'round', ...c.log });
  const eDone = E.crew < c.e0 * SURRENDER_CREW || E.morale < SURRENDER_MORALE;
  const pDone = P.crew < c.p0 * SURRENDER_CREW || P.morale < SURRENDER_MORALE;
  if (eDone || pDone) {
    W.clash = null;
    endFight(W, eDone && (!pDone || sp >= se) ? 'won-captured' : 'lost-captured');
    return;
  }
  c.lastP = c.pt; c.lastE = c.et; c.round++; c.t = 0; c.et = null; c.shown = null;
  if (c.pt === 'volley') c.pt = 'hold';
}
