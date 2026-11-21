// Seeded dice (Phase 8): every random roll in the rules comes from one of these.
// Its whole state is one number, kept in the save, so the same save and the same
// orders always give the same result.
export function createRng(seed = 1) {
  let s = seed >>> 0;
  function next() {
    // mulberry32: small, fast, good enough for a game
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int(min, max) { return min + Math.floor(next() * (max - min + 1)); },
    chance(p) { return next() < p; },
    range(min, max) { return min + next() * (max - min); },
    getState() { return s; },
    setState(v) { s = v >>> 0; },
  };
}
