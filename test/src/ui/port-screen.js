// The port screen (Phase 7): one sheet with Market, Shipyard and Tavern, the mission
// goal, and "Set sail". Until the sea maps arrive (next M2 part), "Set sail" offers a
// quick passage to a neighbouring port: the days pass, then the ship comes in.
// The rules live in src/sim/voyage.js; this file only shows them and passes on taps.
// text-keys: port.tab.* port.cls.* port.good.* port.name.* port.owner.* port.size.* port.why.* port.note.* port.hint.* port.rumour.*
import * as V$ from '../sim/voyage.js';
import { priceMark } from '../sim/trade.js';
import { daysToMonsoon, reopenDay } from '../sim/calendar.js';
import { LOCALES, formatDay } from '../text/i18n.js';
import * as sfx from '../audio/sfx.js';

const dataUrl = (rel) => new URL(`../../data/${rel}`, import.meta.url);
async function loadJSON(rel) { const r = await fetch(dataUrl(rel)); if (!r.ok) throw new Error('missing ' + rel); return r.json(); }

export async function loadVoyageData(missionId = 'm2-pepper') {
  const [g, ports, classes, routes, mission] = await Promise.all([
    loadJSON('goods.json'), loadJSON('ports.json'), loadJSON('ships.json'), loadJSON('routes.json'), loadJSON(`missions/${missionId}.json`),
  ]);
  return { D: { goods: g.goods, rules: g.rules, ports: ports.ports, classes, routes: routes.routes }, mission };
}

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'style') Object.assign(n.style, v); else if (k === 'on') for (const [e, f] of Object.entries(v)) n.addEventListener(e, f);
    else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

const GOODS = ['pepper', 'cinnamon', 'cloth', 'rice', 'arrack', 'teak'];

// opts: { t, lang, D, mission, V, onSave(V), onLeave() }
export function openPort(app, opts) {
  const { t, D, mission } = opts;
  let V = opts.V;
  let tab = 'market', open = null, sheet = null, saveTimer = 0;
  const fmtDay = (day) => formatDay(day, opts.lang);
  const num = (n) => new Intl.NumberFormat(LOCALES[opts.lang] || 'en-GB').format(Math.round(n));
  const portName = (id) => t('port.name.' + id);

  const root = h('div', { class: 'port-app' });
  const hint = h('p', { class: 'port-hint', role: 'status' });
  document.body.classList.add('port-mode');
  app.replaceChildren(root);

  function save(now = false) {
    clearTimeout(saveTimer);
    const go = () => opts.onSave && opts.onSave(V);
    if (now) go(); else saveTimer = setTimeout(go, 700);
  }

  function say(text) {
    hint.textContent = text;
    hint.classList.add('on');
    clearTimeout(say.timer);
    say.timer = setTimeout(() => hint.classList.remove('on'), 4000);
  }
  function hintOnce(key) {
    if (V.hinted[key]) return;
    V.hinted[key] = true;
    say(t('port.hint.' + key));
  }
  function refuse(why) { sfx.tick(); sfx.buzz(30); say(t('port.why.' + why)); }

  // ---- actions ----
  function trade(good, side, n) {
    if (n <= 0) return refuse(side === 'buy' ? 'noGold' : 'noCargo');
    const goldBefore = V.gold;
    const why = side === 'buy' ? V$.buy(V, D, good, n) : V$.sell(V, D, good, n);
    if (why) return refuse(why);
    sfx.coin(0.8); sfx.buzz(10);
    const d = V.gold - goldBefore;
    say(t(side === 'buy' ? 'port.note.bought' : 'port.note.sold', { n, good: t('port.good.' + good), gold: num(Math.abs(d)) }));
    if (side === 'buy' && V.at === 'quilon' && good === 'pepper') hintOnce('sellDear');
    after();
  }
  function act(fn, okKey) {
    const before = V.gold;
    const why = fn(V, D);
    if (why) return refuse(why);
    sfx.coin(0.8);
    say(t(okKey, { gold: num(before - V.gold) }));
    after();
  }
  function waitDay() {
    if (V.result) return;
    const notes = V$.passDay(V, D);
    sfx.tick();
    say(notes.length ? notes.map((k) => t('port.note.' + k)).join(' ') : t('port.note.waited', { date: fmtDay(V.day) }));
    after();
  }
  function after() {
    V$.checkGoal(V);
    if (V$.daysLeft(V) <= 20) hintOnce('monsoon');
    save();
    render();
  }
  function sailTo(to) {
    closeSheet();
    const r = V$.sailTo(V, D, to);
    if (r.why === 'noRoute' || r.why === 'over') return refuse(r.why);
    sfx.bell(0.4);
    open = null; tab = 'market';
    const parts = [t('port.note.arrived', { port: portName(to), days: r.days })];
    for (const k of r.notes) parts.push(t('port.note.' + k));
    if (r.why === 'closed') parts.push(t('port.why.closed'));
    say(parts.join(' '));
    if (to === 'quilon' && !V.hinted.cheapHere) setTimeout(() => hintOnce('cheapHere'), 3500);
    save(true);
    render();
  }

  // ---- pieces ----
  function header() {
    const p = D.ports[V.at];
    const left = V$.daysLeft(V);
    return h('header', { class: 'port-head' },
      h('div', { class: 'port-title' },
        h('span', { class: 'port-flag ' + p.owner, 'aria-hidden': 'true' }),
        h('h2', {}, portName(V.at)),
      ),
      h('p', { class: 'port-sub' }, t('port.owner.' + p.owner), ' · ', t('port.size.' + p.size)),
      h('div', { class: 'port-facts' },
        h('div', {}, h('span', { class: 'port-lbl' }, t('port.date')), h('b', {}, fmtDay(V.day))),
        h('div', {}, h('span', { class: 'port-lbl' }, t('port.gold')), h('b', { class: 'port-gold' }, num(V.gold))),
        h('div', {}, h('span', { class: 'port-lbl' }, t('port.monsoonIn')), h('b', { class: left <= 20 ? 'warn' : '' }, t('port.days', { n: left }))),
      ),
    );
  }

  function goalBox() {
    const g = V.goal, pr = V$.profit(V);
    const share = Math.max(0, Math.min(1, pr / g.gold));
    return h('div', { class: 'port-goal' },
      h('div', { class: 'port-goalrow' },
        h('span', {}, t('port.goal', { gold: num(g.gold) })),
        h('b', { class: pr < 0 ? 'bad' : '' }, t('port.profitNow', { gold: (pr > 0 ? '+' : '') + num(pr) })),
      ),
      V$.holdUsed(V) ? h('p', { class: 'port-small port-cargo' }, t('port.cargoNote', { n: num(V$.holdUsed(V)) })) : null,
      h('i', { class: 'port-meter' }, h('b', { style: { width: (share * 100).toFixed(1) + '%' } })),
    );
  }

  function tabs() {
    const p = D.ports[V.at];
    const items = ['market', 'shipyard', 'tavern'];
    return h('div', { class: 'port-tabs', role: 'tablist' }, items.map((k) => {
      const has = p.services.includes(k);
      return h('button', {
        type: 'button', role: 'tab', 'aria-selected': String(tab === k), class: tab === k ? 'on' : '', disabled: !has,
        on: { click: () => { tab = k; open = null; sfx.tick(); render(); } },
      }, t('port.tab.' + k));
    }));
  }

  function marketRow(good) {
    const store = V$.isStore(good);
    const buyP = V$.price(V, D, good, 'buy'), sellP = V$.price(V, D, good, 'sell');
    const mark = priceMark(D.goods, good, buyP);
    const have = store ? V$.storeOf(V, good) : V$.cargoOf(V, good);
    const cap = store ? V$.storeOf(V, good) + V$.storeRoom(V, good) : null;
    const isOpen = open === good;
    const arrow = mark < 0 ? h('span', { class: 'mk good', title: t('port.cheap') }, '▼') : mark > 0 ? h('span', { class: 'mk bad', title: t('port.dear') }, '▲') : h('span', { class: 'mk' }, '·');
    const row = h('button', {
      type: 'button', class: 'port-row' + (isOpen ? ' open' : ''), 'aria-expanded': String(isOpen),
      on: { click: () => { open = isOpen ? null : good; sfx.tick(); render(); } },
    },
      h('span', { class: 'port-good' }, t('port.good.' + good)),
      h('span', { class: 'port-price' }, arrow, num(buyP)),
      h('span', { class: 'port-have' }, store ? `${num(have)} / ${num(cap)}` : have ? num(have) : '–'),
    );
    if (!isOpen) return row;
    const maxB = V$.maxBuy(V, D, good);
    const btn = (label, fn, cls = '', dis = false) => h('button', { type: 'button', class: 'port-btn ' + cls, disabled: dis, on: { click: fn } }, label);
    return h('div', { class: 'port-open' }, row,
      h('p', { class: 'port-quote' }, t('port.quote', { buy: num(buyP), sell: num(sellP) }),
        store && good === 'food' ? ' · ' + t('port.foodDays', { n: Math.floor(have / Math.max(1, V.fleet.reduce((a, s) => a + s.crew, 0) * D.rules.foodPerSailorDay)) }) : ''),
      h('div', { class: 'port-btns' },
        btn(t('port.sellAll'), () => trade(good, 'sell', have), 'sell', !have),
        btn('−5', () => trade(good, 'sell', Math.min(5, have)), 'sell', !have),
        btn('−1', () => trade(good, 'sell', Math.min(1, have)), 'sell', !have),
        btn('+1', () => trade(good, 'buy', Math.min(1, maxB)), 'buy', !maxB),
        btn('+5', () => trade(good, 'buy', Math.min(5, maxB)), 'buy', !maxB),
        btn(t('port.max'), () => trade(good, 'buy', maxB), 'buy', !maxB),
      ),
    );
  }

  function market() {
    const used = V$.holdUsed(V), size = V$.holdSize(V);
    return h('div', { class: 'port-pane' },
      h('div', { class: 'port-hold' },
        h('span', {}, t('port.hold', { used: num(used), size: num(size) })),
        h('i', { class: 'port-meter small' }, h('b', { style: { width: (used / size * 100).toFixed(1) + '%' } })),
      ),
      h('div', { class: 'port-cols', 'aria-hidden': 'true' }, h('span', {}, t('port.colGood')), h('span', {}, t('port.colPrice')), h('span', {}, t('port.colHave'))),
      GOODS.map(marketRow),
      h('h3', {}, t('port.stores')),
      V$.STORES.map(marketRow),
    );
  }

  function bar(label, val, max, warnAt = 0.5) {
    const share = Math.max(0, Math.min(1, val / max));
    return h('div', { class: 'port-bar' },
      h('span', {}, label), h('i', { class: 'port-meter small' + (share < warnAt ? ' low' : '') }, h('b', { style: { width: (share * 100).toFixed(1) + '%' } })),
      h('em', {}, `${num(val)} / ${num(max)}`));
  }

  function shipyard() {
    const cost = V$.repairCost(V, D);
    return h('div', { class: 'port-pane' },
      V.fleet.map((s) => h('div', { class: 'port-ship' },
        h('p', { class: 'port-shipname' }, s.name, h('span', {}, ' · ', t('port.cls.' + s.cls))),
        bar(t('port.hull'), s.hull, s.hullMax), bar(t('port.sails'), s.sails, 100))),
      h('button', { type: 'button', class: 'primary port-wide', disabled: !cost, on: { click: () => act(V$.repairAll, 'port.note.repaired') } },
        cost ? t('port.repairAll', { gold: num(cost) }) : t('port.noRepairs')),
      h('p', { class: 'port-small' }, t('port.shipsLater')),
    );
  }

  function tavern() {
    const need = V$.crewNeeded(V), due = V$.wagesDue(V);
    const s = V.fleet[0];
    const rumours = ['a', 'b'];
    const rumour = t(`port.rumour.${V.at}.${rumours[(V.day + V.ports[V.at].visits) % 2]}`);
    return h('div', { class: 'port-pane' },
      h('blockquote', { class: 'port-rumour' }, rumour),
      V.fleet.map((x) => h('div', { class: 'port-ship' },
        h('p', { class: 'port-shipname' }, x.name),
        bar(t('port.crew'), x.crew, x.crewMax, 0.8), bar(t('port.morale'), x.morale, 100, 0.4))),
      h('button', { type: 'button', class: 'port-wide', disabled: !need, on: { click: () => act(V$.hireCrew, 'port.note.hired') } },
        need ? t('port.hire', { n: num(need), gold: num(V$.hireCost(V, D)) }) : t('port.fullCrew')),
      h('button', { type: 'button', class: 'port-wide' + (due > V$.monthlyWages(V, D) ? ' primary' : ''), disabled: !due, on: { click: () => act(V$.payWages, 'port.note.paid') } },
        due ? t('port.payWages', { gold: num(due) }) : t('port.wagesPaid')),
      h('p', { class: 'port-small' }, t('port.wagesNote', { gold: num(V$.monthlyWages(V, D)) }), s.morale < 50 ? ' ' + t('port.moraleLow') : ''),
    );
  }

  function footer() {
    return h('div', { class: 'port-foot' },
      h('button', { type: 'button', class: 'primary port-sail', on: { click: openPassages } }, t('port.setSail')),
      h('button', { type: 'button', class: 'port-side', on: { click: waitDay } }, t('port.wait')),
      h('button', { type: 'button', class: 'port-side', 'aria-label': t('port.menu'), on: { click: openMenu } }, '☰'),
    );
  }

  // ---- sheets: passages, menu, results ----
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }
  function showSheet(...kids) {
    closeSheet();
    sheet = h('div', { class: 'port-sheetwrap', on: { click: (e) => { if (e.target === sheet && !V.result) closeSheet(); } } },
      h('div', { class: 'port-sheet', role: 'dialog' }, ...kids));
    root.append(sheet);
  }
  function openPassages() {
    sfx.tick();
    const list = V$.passages(V, D);
    showSheet(
      h('h3', {}, t('port.passageTitle')),
      list.map((p) => {
        const closed = !(D.ports[p.to].monsoonClosed ? daysToMonsoon(V.day + p.days) > 0 : true);
        return h('button', { type: 'button', class: 'port-wide', on: { click: () => sailTo(p.to) } },
          t('port.passage', { port: portName(p.to), days: p.days }), closed ? ' · ' + t('port.closedOnArrival') : '');
      }),
      h('p', { class: 'port-small' }, t('port.passageNote')),
      h('button', { type: 'button', class: 'port-wide', on: { click: closeSheet } }, t('port.stay')),
    );
  }
  function openMenu() {
    sfx.tick();
    showSheet(
      h('h3', {}, t('port.menu')),
      h('button', { type: 'button', class: 'port-wide', on: { click: () => { save(true); closeSheet(); say(t('port.note.saved')); } } }, t('port.saveNow')),
      h('button', { type: 'button', class: 'port-wide', on: { click: () => { closeSheet(); restart(); } } }, t('port.restart')),
      h('button', { type: 'button', class: 'port-wide', on: { click: leave } }, t('port.leave')),
      h('button', { type: 'button', class: 'port-wide', on: { click: closeSheet } }, t('port.back')),
    );
  }
  function results() {
    const r = V.result, won = r.kind === 'won';
    const used = r.day - V.startDay, total = used + V$.daysLeft(V);
    const stars = won ? 1 + (V.fleet.length >= mission.fleet.length ? 1 : 0) + (used <= total / 2 ? 1 : 0) : 0;
    showSheet(
      h('h2', {}, t(won ? 'port.wonTitle' : 'port.lostTitle')),
      won ? h('p', { class: 'port-stars', 'aria-label': t('port.starsLabel', { n: stars }) }, '★'.repeat(stars) + '☆'.repeat(3 - stars)) : null,
      h('p', {}, t(won ? 'port.wonText' : 'port.lostText', { gold: num(r.profit), days: used, date: fmtDay(reopenDay(V.day)) })),
      won ? h('p', { class: 'port-small' }, t('port.starsWhy')) : null,
      h('button', { type: 'button', class: 'primary port-wide', on: { click: restart } }, t(won ? 'port.again' : 'port.retry')),
      h('button', { type: 'button', class: 'port-wide', on: { click: leave } }, t('port.leave')),
    );
  }

  function restart() {
    V = V$.createVoyage(D, mission, (V.seed || 1638) + 1);
    open = null; tab = 'market';
    save(true);
    render();
    hintOnce('start');
  }
  function leave() {
    clearTimeout(saveTimer);
    if (!V.result) opts.onSave && opts.onSave(V);
    document.body.classList.remove('port-mode');
    opts.onLeave && opts.onLeave();
  }

  // ---- draw ----
  function render() {
    const scroll = root.querySelector('.port-body')?.scrollTop || 0;
    const p = D.ports[V.at];
    const why = V$.canTrade(V, D);
    if (!p.services.includes(tab)) tab = 'market';
    const body = why === 'closed'
      ? h('div', { class: 'port-pane' }, h('p', { class: 'port-closed' }, '🔒 ', t('port.closedUntil', { date: fmtDay(reopenDay(V.day)) })))
      : tab === 'market' ? market() : tab === 'shipyard' ? shipyard() : tavern();
    const keep = sheet;
    root.replaceChildren(
      h('div', { class: 'port-card' }, header(), goalBox(), tabs(), h('div', { class: 'port-body' }, body), hint),
      footer(),
    );
    root.querySelector('.port-body').scrollTop = scroll;
    if (keep && !V.result) root.append(keep);
    if (V.result) results();
  }

  render();
  if (!V.hinted.start) hintOnce('start');
  save(true); // autosave on entering port (Phase 7)
  return { get state() { return V; } };
}
