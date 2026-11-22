// Save versions (Phase 8): every save carries a version number. When the game
// changes what it keeps, add a step here that turns version n into n + 1, so an
// update never breaks a campaign in progress. tests/saves/ keeps a save of each
// version, and the rule tests check that every one of them still loads.

export const SAVE_VERSION = 1;

// steps[n] upgrades a version-n state to version n + 1. Version 1 is the first.
const steps = {
  // 1: (state) => { ...; return state; },
};

export function migrate(state, from) {
  let v = from;
  while (v < SAVE_VERSION) {
    const fn = steps[v];
    if (!fn) throw new Error('noUpgrade');
    state = fn(state);
    v++;
  }
  return state;
}
