// Shared bits of the world state: events for the screen, hints, ship lookup.
// The rules never draw or play sounds; they leave events that the screen reads.

export function emit(W, ev) { W.events.push(ev); }

// A hint (one line, shown once). `again` lets a hint come back after that many game seconds.
export function hint(W, key, again = 0) {
  const last = W.hinted[key];
  if (last !== undefined && (!again || W.t - last < again)) return;
  W.hinted[key] = W.t;
  emit(W, { k: 'hint', key });
}

export function toast(W, key, vars) { emit(W, { k: 'toast', key, vars }); }

export const ship = (W, id) => W.ships.find((s) => s.id === id) || null;
export const alive = (W, s) => !!s && !s.sinking && !s.struck && !W.over;
export const isPlayer = (W, s) => s.id === W.playerId;
export const foeOf = (W, s) => (isPlayer(W, s) ? ship(W, W.enemyId) : ship(W, W.playerId));

// The fight is over: won-sunk, won-struck, won-captured, lost-sunk, lost-captured, escaped, draw.
export function endFight(W, kind) {
  if (W.over) return;
  W.over = kind; W.overAt = W.t; W.clash = null;
  emit(W, { k: 'over', kind });
}
