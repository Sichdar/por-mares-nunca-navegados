// Trade (GDD Phase 2 rule 4): each port has a stock and a target stock per good.
// Price = base × (1 + swing × (target − stock) ÷ target), kept between 0.4× and 2.5× base.
// Buying takes from the stock (price goes up), selling adds to it (price goes down);
// stocks drift a share a day (8%, data/goods.json; the GDD's 5% was raised by the M2
// trade runs) back towards the port's usual stock (u), so a port "recovers"
// after a few days and keeps its character: Quilon's usual pepper stock is above the
// target (cheap), Goa's below it (dear). (S08, 22/11/2026: drifting to the target itself
// made every port's price the same after a few weeks, and trade pointless.)
//
// Each unit is priced at the stock it leaves behind (buying) or arrives into
// (selling), so buying and selling straight back always loses a little: no free money.

// Difficulty changes the trade price spread (Phase 3).
export const SPREAD = { deckhand: 1.15, captain: 1, admiral: 0.85 };

export function makeMarket(portDef, overrides = {}) {
  const market = {};
  for (const [good, m] of Object.entries(portDef.market)) {
    const u = Math.round(m.t * (overrides[good] ?? m.s));
    market[good] = { t: m.t, u, s: u };
  }
  return market;
}

export function priceAt(goods, rules, good, target, stock, difficulty = 'captain') {
  const base = goods[good].base;
  const swing = rules.priceSwing * (SPREAD[difficulty] ?? 1);
  const f = 1 + swing * (target - stock) / target;
  return base * Math.min(rules.priceMax, Math.max(rules.priceMin, f));
}

// The price shown on the screen for one unit (rounded to whole gold).
export function shownPrice(goods, rules, market, good, side, difficulty) {
  const m = market[good];
  const stock = side === 'buy' ? m.s - 1 : m.s + 1;
  return Math.max(1, Math.round(priceAt(goods, rules, good, m.t, stock, difficulty)));
}

// Total gold for n units; does not change the market.
export function quote(goods, rules, market, good, n, side, difficulty) {
  const m = market[good];
  let total = 0, s = m.s;
  for (let i = 0; i < n; i++) {
    s += side === 'buy' ? -1 : 1;
    total += Math.max(1, Math.round(priceAt(goods, rules, good, m.t, s, difficulty)));
  }
  return total;
}

// How many units the gold can pay for (and the stock allows), up to `limit`.
export function affordable(goods, rules, market, good, gold, limit, difficulty) {
  const m = market[good];
  let n = 0, cost = 0, s = m.s;
  while (n < limit && s >= 1) {
    const p = Math.max(1, Math.round(priceAt(goods, rules, good, m.t, s - 1, difficulty)));
    if (cost + p > gold) break;
    cost += p; s--; n++;
  }
  return n;
}

export function move(market, good, n, side) {
  market[good].s += side === 'buy' ? -n : n;
}

// One day of drift back towards the usual stock (rounded, but always at least one unit while off target).
export function drift(market, rules, days = 1) {
  for (let d = 0; d < days; d++) {
    for (const m of Object.values(market)) {
      const gap = (m.u ?? m.t) - m.s;
      if (!gap) continue;
      const step = Math.sign(gap) * Math.max(1, Math.round(Math.abs(gap) * rules.driftPerDay));
      m.s += Math.abs(step) > Math.abs(gap) ? gap : step;
    }
  }
}

// Is the price here cheap (−1), usual (0) or dear (+1) compared with the base price?
export function priceMark(goods, good, price) {
  const r = price / goods[good].base;
  return r < 0.9 ? -1 : r > 1.1 ? 1 : 0;
}
