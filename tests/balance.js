// Balance runs (Phase 8, Phase 11 "Bot tests"): many fights between bots, no screen.
// Usage: node tests/balance.js [fights]   (tools/check.js runs a short version)
import { fightData } from './load-data.js';
import { createFight, step, ship, alive, enemyVisible, orderMove, orderAttack, orderBoard, setChoice, setTactic, endFight } from '../src/sim/world.js';
import { BEATS, TACTICS } from '../src/sim/rules.js';
import { dist } from '../src/sim/geom.js';

const LIMIT = 15 * 60; // a fight still going after 15 game minutes counts as a draw

// "Attack only": taps the enemy when it can, otherwise sails at the last place it was seen.
function plainBot(W) {
  const p = ship(W, W.playerId);
  if (enemyVisible(W)) { if (p.order.type !== 'attack') orderAttack(W); }
  else if (p.order.type === 'none' || p.order.type === 'attack') orderMove(W, W.lastKnown.x, W.lastKnown.y);
}

// "Good": battle sail in a fight, chain shot to slow a runner, grape and board when she is weak,
// and in a clash picks the tactic that beats the enemy's tell.
function goodBot(W) {
  const p = ship(W, W.playerId), e = ship(W, W.enemyId);
  if (W.clash) {
    const tell = W.clash.shown;
    if (tell) {
      const counter = TACTICS.find((t) => BEATS[t] === tell);
      setTactic(W, counter);
    }
    return;
  }
  if (!enemyVisible(W) || !alive(W, e)) { plainBot(W); return; }
  const d = dist(p, e);
  setChoice(W, 'sail', d < 600 && !e.fleeing ? 'battle' : 'full');
  const weak = e.crew < p.crew * 0.75 || e.hull < e.hullMax * 0.35;
  if (weak && e.v < e.top * 0.6 && p.crew > e.crew * 1.1) {
    setChoice(W, 'shot', d < 150 ? 'grape' : 'round');
    if (p.order.type !== 'board') orderBoard(W);
  } else if (e.fleeing) {
    setChoice(W, 'shot', e.v > p.v * 0.9 && e.sails > 40 ? 'chain' : 'round');
    if (p.order.type !== 'attack') orderAttack(W);
  } else {
    setChoice(W, 'shot', 'round');
    if (p.order.type !== 'attack') orderAttack(W);
  }
}

export function runFight(bot, seed) {
  const W = createFight({ ...fightData(), seed });
  let think = 0;
  while (!W.over && W.t < LIMIT) {
    if ((think -= 1) <= 0) { bot(W); think = 10; } // the bot looks every half second
    step(W);
    W.events.length = 0;
  }
  if (!W.over) endFight(W, 'draw');
  return { kind: W.over, t: W.t };
}

export function runSet(name, bot, n, seed0 = 1) {
  const r = { name, n, won: 0, lost: 0, escaped: 0, draw: 0, time: 0, kinds: {} };
  for (let i = 0; i < n; i++) {
    const { kind, t } = runFight(bot, seed0 + i * 7919);
    r.kinds[kind] = (r.kinds[kind] || 0) + 1;
    if (kind.startsWith('won')) r.won++; else if (kind.startsWith('lost')) r.lost++; else if (kind === 'escaped') r.escaped++; else r.draw++;
    r.time += t;
  }
  r.avgMin = r.time / n / 60;
  return r;
}

export function balanceReport(n = 32) {
  const sets = [runSet('attack-only bot vs Dutch captain', plainBot, n), runSet('good bot vs Dutch captain', goodBot, n)];
  const lines = sets.map((s) =>
    `${s.name}: won ${s.won}, lost ${s.lost}, escaped ${s.escaped}, draws ${s.draw} of ${s.n}; ` +
    `average ${s.avgMin.toFixed(1)} min at 1× (${Object.entries(s.kinds).map(([k, v]) => k + ' ' + v).join(', ')})`);
  const checks = [
    { ok: sets[1].won / n >= 0.7, text: `good bot wins at least 70% (${Math.round(sets[1].won / n * 100)}%)` },
    { ok: sets[1].won > sets[0].won, text: 'good bot beats the attack-only bot\'s record' },
    { ok: sets.every((s) => s.avgMin >= 2 && s.avgMin <= 5), text: 'average fight 2 to 5 minutes' },
  ];
  return { sets, lines, checks };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1]?.endsWith('balance.js')) {
  const n = Number(process.argv[2] || 32);
  const r = balanceReport(n);
  r.lines.forEach((l) => console.log(l));
  r.checks.forEach((c) => console.log((c.ok ? '  ✓ ' : '  ! ') + c.text));
}
