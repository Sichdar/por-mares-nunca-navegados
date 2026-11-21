// The sea screen (Phase 7): isometric sea, top bar (wind, enemy, speed, pause),
// ship card and orders in the thumb zone, boarding panel, pause card, results.
// text-keys: sea.hint.* sea.dir.* sea.wind.light sea.wind.fair sea.wind.strong sea.pos.* sea.tell.* sea.tac.* sea.beats.* sea.edge.* sea.result.*
import { STEP } from '../sim/rules.js';
import { DEG, wrapA, clamp, lerp, dist } from '../sim/geom.js';
import { pointOfSail } from '../sim/rules.js';
import {
  createFight, step, drain, ship, alive, enemyVisible, orderMove, orderAttack, orderBoard, setChoice, setTactic,
} from '../sim/world.js';
import { canUse } from '../sim/boarding.js';
import { reloadTime } from '../sim/gunnery.js';
import { compass, windWord } from '../sim/wind.js';
import { BOW_RELOAD } from '../sim/rules.js';
import { createCamera, fitCamera, setZoom, s2w, w2s, screenAngle } from '../draw/iso.js';
import { drawScene } from '../draw/scene.js';
import { pickBox } from '../draw/ships.js';
import { createEffects, onEvent, updEffects } from '../draw/effects.js';
import { attachTouch, GESTURE } from '../input/touch.js';
import * as sfx from '../audio/sfx.js';

const FONT = "'Alegreya Sans', system-ui, sans-serif";
const dataUrl = (rel) => new URL(`../../data/${rel}`, import.meta.url);
async function loadJSON(rel) { const r = await fetch(dataUrl(rel)); if (!r.ok) throw new Error('missing ' + rel); return r.json(); }

export async function loadFight(id = 'zeehond') {
  const fight = await loadJSON(`fights/${id}.json`);
  const [map, classes] = await Promise.all([loadJSON(`maps/${fight.map}.json`), loadJSON('ships.json')]);
  return { fight, map, classes };
}

function h(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'on') for (const [e, f] of Object.entries(v)) n.addEventListener(e, f);
    else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

// opts: { t, data, isTest, onLeave, settings: { hints, autoPause, sound } }
export function openSea(app, opts) {
  const { t, data, isTest } = opts;
  const settings = { hints: true, autoPause: true, sound: !sfx.isMuted(), ...(opts.settings || {}) };
  let W, cam = createCamera(), fx, prev = new Map(), acc = 0, speed = 1, paused = true, briefing = true;
  let raf = 0, last = performance.now(), uiAcc = 0, overTimer = 0, press = null, hintTimer = 0;
  let resultShown = false;
  const play = { taps: 0, wrong: 0, lastTap: null, frames: 0, fpsT: 0, fps: 0, fpsMin: 999 };

  // ---- build the screen ----
  const cv = h('canvas', { class: 'sea-canvas', 'aria-label': t('sea.aria.sea') });
  const ctx = cv.getContext('2d');
  const rose = h('canvas', { class: 'sea-rose', width: 96, height: 96, 'aria-hidden': 'true' });
  const $ = {};
  const ref = (name, node) => { $[name] = node; return node; };
  const bar = (name, label) => h('div', { class: 'sea-bar' }, h('span', {}, label), h('i', {}, ref('b' + name, h('b'))), ref('v' + name, h('em')));
  const seg = (key, items) => h('div', { class: 'sea-seg', 'data-k': key, role: 'group' },
    items.map(([v, label]) => h('button', { type: 'button', 'data-v': v, on: { click: () => choose(key, v) } }, label)));

  const top = h('div', { class: 'sea-top' },
    h('div', { class: 'sea-wind' }, rose,
      h('div', {}, h('div', { class: 'sea-lbl' }, t('sea.wind.label')), ref('wind', h('div', { class: 'sea-windtxt' })), ref('pos', h('div', { class: 'sea-sub' })))),
    ref('foe', h('div', { class: 'sea-foe' },
      h('div', { class: 'sea-foename' }, h('span', { class: 'sea-flag nl' }), ref('foeName', h('span'))),
      ref('foeBars', h('div', { class: 'sea-mini', hidden: true }, ['Hull', 'Sails', 'Crew'].map((k) => h('i', {}, ref('f' + k, h('b')))))),
      ref('foeHidden', h('div', { class: 'sea-sub' })))),
    h('div', { class: 'sea-time' },
      ref('spd', h('button', { type: 'button', class: 'sea-round', 'aria-label': t('sea.speed.aria'), on: { click: cycleSpeed } }, '1×')),
      ref('pause', h('button', { type: 'button', class: 'sea-round sea-pausebtn', 'aria-label': t('sea.pause.aria'), on: { click: () => setPaused(!paused) } }, '❚❚'))),
  );
  const toasts = h('div', { class: 'sea-toasts', 'aria-live': 'polite' });
  const pauseCard = h('div', { class: 'sea-pausecard', hidden: true },
    h('div', { class: 'sea-pausehead' }, h('span', { class: 'sea-pausetitle' }, t('sea.pause.title')), h('span', { class: 'sea-sub' }, t('sea.pause.sub'))),
    h('div', { class: 'sea-pills' },
      h('button', { type: 'button', class: 'sea-pill', on: { click: () => setPaused(false) } }, t('sea.pause.resume')),
      ref('snd', h('button', { type: 'button', class: 'sea-pill', on: { click: toggleSound } })),
      ref('ap', h('button', { type: 'button', class: 'sea-pill', on: { click: toggleAutoPause } })),
      h('button', { type: 'button', class: 'sea-pill', on: { click: restart } }, t('sea.pause.restart')),
      h('button', { type: 'button', class: 'sea-pill', on: { click: leave } }, t('sea.pause.leave'))),
    ref('fps', h('div', { class: 'sea-sub sea-fps', hidden: !isTest })));
  const follow = h('button', { type: 'button', class: 'sea-pill sea-follow', hidden: true, on: { click: () => { cam.follow = true; follow.hidden = true; } } }, t('sea.follow'));
  const hintEl = h('div', { class: 'sea-hint', role: 'status' });

  const clash = h('div', { class: 'sea-clash', hidden: true },
    h('div', { class: 'sea-clashhead' }, h('b', {}, t('sea.clash.title')), ref('cRound', h('span', { class: 'sea-sub' }))),
    h('div', { class: 'sea-sides' },
      h('div', {}, h('div', { class: 'sea-lbl' }, t('sea.clash.yours')), ref('cP', h('div', { class: 'sea-big' })), ref('cPm', h('div', { class: 'sea-sub' }))),
      h('div', { class: 'sea-vs' }, t('sea.clash.vs')),
      h('div', {}, h('div', { class: 'sea-lbl' }, t('sea.clash.theirs')), ref('cE', h('div', { class: 'sea-big' })), ref('cEm', h('div', { class: 'sea-sub' })))),
    h('div', { class: 'sea-bal' }, ref('cBal', h('b'))),
    h('div', { class: 'sea-tbar' }, ref('cTime', h('b'))),
    ref('cTell', h('div', { class: 'sea-tell' })),
    h('div', { class: 'sea-tactics' }, ['volley', 'charge', 'hold'].map((k) =>
      ref('tac_' + k, h('button', { type: 'button', 'data-t': k, on: { click: () => { setTactic(W, k); sfx.tick(); uiClash(); } } },
        h('b', {}, t('sea.tac.' + k)), ref('tacSub_' + k, h('span'))))),
    ),
    ref('cLog', h('div', { class: 'sea-sub sea-clog' })),
  );

  const stage = h('div', { class: 'sea-stage' }, cv, top, toasts, pauseCard, follow, hintEl, clash);

  const deck = h('div', { class: 'sea-deck' },
    h('div', {},
      h('div', { class: 'sea-cardhead' }, h('span', { class: 'sea-flag pt' }), ref('pName', h('b')), ref('pSpeed', h('span', { class: 'sea-sub' })), ref('powder', h('span', { class: 'sea-sub sea-right' }))),
      h('div', { class: 'sea-bars' }, bar('Hull', t('sea.card.hull')), bar('Sails', t('sea.card.sails')), bar('Crew', t('sea.card.crew')), bar('Mor', t('sea.card.morale'))),
      h('div', { class: 'sea-rel' },
        h('span', {}, t('sea.card.left')), h('i', {}, ref('rL', h('b'))),
        h('span', {}, t('sea.card.bow')), h('i', {}, ref('rB', h('b'))),
        h('span', {}, t('sea.card.right')), h('i', {}, ref('rR', h('b'))))),
    h('div', { class: 'sea-row' },
      h('div', { class: 'sea-grp sea-grow' }, h('div', { class: 'sea-lbl' }, t('sea.ctl.shot')),
        seg('shot', [['round', t('sea.ctl.round')], ['chain', t('sea.ctl.chain')], ['grape', t('sea.ctl.grape')]])),
      h('div', { class: 'sea-grp' }, h('div', { class: 'sea-lbl' }, t('sea.ctl.sails')),
        seg('sail', [['full', t('sea.ctl.full')], ['battle', t('sea.ctl.battle')]]))),
    h('div', { class: 'sea-row' },
      h('div', { class: 'sea-grp sea-grow' }, h('div', { class: 'sea-lbl' }, t('sea.ctl.guns')),
        seg('stance', [['fire', t('sea.ctl.fire')], ['hold', t('sea.ctl.hold')], ['keep', t('sea.ctl.keep')]])),
      h('div', { class: 'sea-grp' }, h('div', { class: 'sea-lbl' }, ' '),
        ref('board', h('button', { type: 'button', class: 'sea-act', 'aria-pressed': 'false', on: { click: boardOrder } }, t('sea.ctl.board'))))),
  );

  const brief = h('div', { class: 'sea-overlay' }, h('div', { class: 'sea-sheet' },
    h('div', { class: 'sea-eyebrow' }, t('sea.brief.eyebrow')),
    h('h2', {}, t('sea.brief.title')),
    h('p', {}, t('sea.brief.text')),
    h('ul', { class: 'sea-how' }, ['sea.brief.how1', 'sea.brief.how2', 'sea.brief.how3', 'sea.brief.how4', 'sea.brief.how5'].map((k) => h('li', {}, t(k)))),
    h('button', { type: 'button', class: 'sea-primary', on: { click: setSail } }, t('sea.brief.go')),
    h('button', { type: 'button', class: 'sea-pill', on: { click: leave } }, t('sea.brief.back')),
    h('p', { class: 'sea-sub' }, t('sea.brief.note'))));

  const result = h('div', { class: 'sea-overlay', hidden: true }, h('div', { class: 'sea-sheet' },
    ref('rEy', h('div', { class: 'sea-eyebrow' })), ref('rTitle', h('h2')), ref('rText', h('p')),
    ref('rStats', h('div', { class: 'sea-stats' })),
    h('div', { class: 'sea-ask' }, h('b', {}, t('sea.result.askTitle')),
      h('ol', {}, ['sea.result.ask1', 'sea.result.ask2', 'sea.result.ask3', 'sea.result.ask4'].map((k) => h('li', {}, t(k))))),
    h('button', { type: 'button', class: 'sea-primary', on: { click: restart } }, t('sea.result.again')),
    h('button', { type: 'button', class: 'sea-pill', on: { click: leave } }, t('sea.result.leave'))));

  const root = h('div', { class: 'sea-app' }, stage, deck, brief, result);
  document.body.classList.add('sea-mode');
  app.replaceChildren(root);

  // ---- the fight ----
  function newFight() {
    W = createFight({ ...opts.data, seed: (Date.now() >>> 0) % 1000000 });
    fx = createEffects(); prev = new Map(); acc = 0;
    const p = ship(W, W.playerId);
    cam.follow = true; cam.x = p.x; cam.y = p.y - 150;
    clash.hidden = true; result.hidden = true; follow.hidden = true; toasts.replaceChildren();
    resultShown = false; clearTimeout(overTimer);
    $.pName.textContent = p.name; $.foeName.textContent = ship(W, W.enemyId).name;
    setSpeed(1);
  }
  function setSail() {
    sfx.unlock(); briefing = false; brief.hidden = true; setPaused(false);
    showHint('start');
  }
  function restart() { sfx.unlock(); newFight(); briefing = false; brief.hidden = true; setPaused(false); showHint('start'); }

  // ---- time ----
  function setPaused(v) {
    paused = v;
    $.pause.textContent = v ? '▶' : '❚❚';
    $.pause.setAttribute('aria-label', t(v ? 'sea.resume.aria' : 'sea.pause.aria'));
    pauseCard.hidden = !v || briefing || !!W.over;
    refreshPills();
  }
  function setSpeed(v) { speed = v; $.spd.textContent = v + '×'; }
  function cycleSpeed() {
    if (W.over || briefing) return;
    const n = speed === 1 ? 2 : speed === 2 ? 4 : 1;
    if (n > 1 && (enemyVisible(W) || W.clash)) { toast(t('sea.toast.fastOff')); setSpeed(1); return; }
    setSpeed(n);
  }
  function toggleSound() { sfx.setMuted(!sfx.isMuted()); sfx.unlock(); refreshPills(); }
  function toggleAutoPause() { settings.autoPause = !settings.autoPause; refreshPills(); }
  function refreshPills() {
    $.snd.textContent = t(sfx.isMuted() ? 'sea.pause.soundOff' : 'sea.pause.soundOn');
    $.ap.textContent = t(settings.autoPause ? 'sea.pause.autoOn' : 'sea.pause.autoOff');
  }

  // ---- orders ----
  function choose(key, v) {
    if (!W || W.over) return;
    setChoice(W, key, v); sfx.tick(); flushEvents(); uiTick();
  }
  function boardOrder() {
    if (!W || W.over || W.clash) return;
    const why = orderBoard(W);
    if (why) toast(t('sea.toast.noEnemy')); else { toast(t('sea.toast.board')); sfx.buzz(15); }
    flushEvents();
  }

  // ---- what the rules report ----
  function flushEvents() {
    for (const ev of drain(W)) {
      onEvent(fx, ev, false);
      const p = ship(W, W.playerId);
      const vol = clamp(1 - Math.hypot((ev.x ?? cam.x) - cam.x, (ev.y ?? cam.y) - cam.y) / 1800, 0.12, 1);
      switch (ev.k) {
        case 'toast': {
          const vars = { ...(ev.vars || {}) };
          if (vars.dir) vars.dir = t('sea.dir.' + vars.dir);
          toast(t(ev.key, vars));
          break;
        }
        case 'hint': showHint(ev.key); break;
        case 'sighted':
          if (speed > 1) setSpeed(1);
          if (settings.autoPause && !paused) { setPaused(true); toast(t('sea.toast.autoPaused')); }
          break;
        case 'fire':
          for (let i = 0; i < (ev.bow ? 2 : 4); i++) sfx.boom(vol * (i ? 0.6 : 1) * (ev.bow ? 0.6 : 1), i * 0.12 + i * 0.02);
          if (ev.id === p.id) sfx.buzz(25);
          break;
        case 'hit':
          sfx.crack(vol * (ev.rake ? 1 : 0.6));
          if (ev.onPlayer) { sfx.buzz(20); flashDeck(); }
          break;
        case 'miss': if (fx.list.length % 3 === 0) sfx.splash(vol * 0.5); break;
        case 'rake': if (ev.id !== p.id) sfx.buzz([20, 40, 20]); break;
        case 'clash':
          setSpeed(1); toast(t('sea.toast.boarding')); sfx.grapnel(); sfx.boom(0.6); sfx.buzz(200);
          clash.hidden = false; $.cLog.textContent = t('sea.clash.start'); uiClash();
          break;
        case 'tell': case 'round': uiClash(); break;
        case 'struck': sfx.bell(); break;
        case 'over':
          clash.hidden = true;
          overTimer = setTimeout(showResults, ev.kind.endsWith('sunk') ? 2600 : 1000);
          break;
        default: break;
      }
    }
  }
  function flashDeck() { deck.classList.remove('sea-hurt'); void deck.offsetWidth; deck.classList.add('sea-hurt'); }

  const shown = new Set();
  function showHint(key) {
    if (!settings.hints) return;
    const always = key === 'start';
    if (shown.has(key) && !always && !key.startsWith('tooFast')) return;
    shown.add(key);
    hintEl.textContent = t('sea.hint.' + key);
    hintEl.classList.add('on');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => hintEl.classList.remove('on'), 7000);
  }
  function toast(text) {
    const el = h('div', { class: 'sea-toast' }, text);
    toasts.append(el);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => el.remove(), 2800);
  }

  // ---- input on the sea ----
  function pick(sx, sy) {
    const p = ship(W, W.playerId), e = ship(W, W.enemyId), out = [];
    const shownShips = displayShips();
    for (const s of shownShips) {
      if (s.id === e.id && (!enemyVisible(W) || !alive(W, e))) continue;
      if (s.sinking) continue;
      const b = pickBox(cam, s);
      const inside = sx >= b.x0 && sx <= b.x1 && sy >= b.y0 && sy <= b.y1;
      const d = Math.hypot(sx - b.cx, sy - b.cy);
      const gap = Math.max(b.x0 - sx, sx - b.x1, b.y0 - sy, sy - b.y1, 0);
      out.push({ s, inside, d, gap });
    }
    const hit = out.filter((o) => o.inside).sort((a, b) => a.d - b.d)[0] || null;
    const nearEnemy = out.find((o) => o.s.id === e.id && !o.inside && o.gap < 60) || null;
    return { ship: hit && hit.s, player: p, enemy: e, nearEnemy };
  }
  function tap(sx, sy) {
    sfx.unlock();
    if (!W || W.over || W.clash || briefing) return;
    const now = performance.now(), r = pick(sx, sy), lt = play.lastTap;
    play.taps++;
    let kind;
    if (r.ship && r.ship.id === r.enemy.id) {
      kind = 'enemy';
      if (!orderAttack(W)) { toast(t('sea.toast.attack', { name: r.enemy.name })); sfx.tick(); }
      if (lt && lt.kind === 'sea' && lt.nearEnemy && now - lt.at < 2500) play.wrong++;
    } else if (r.ship && r.ship.id === r.player.id) {
      kind = 'self'; cam.follow = true; follow.hidden = true;
    } else {
      kind = 'sea';
      const [wx, wy] = s2w(cam, sx, sy);
      const why = orderMove(W, wx, wy);
      if (why === 'offChart') toast(t('sea.toast.offChart'));
      else if (why === 'onLand') toast(t('sea.toast.onLand'));
      else if (!why) sfx.tick();
      if (lt && lt.kind === 'enemy' && now - lt.at < 2500 && Math.hypot(sx - lt.x, sy - lt.y) < 50) play.wrong++;
    }
    play.lastTap = { kind, at: now, x: sx, y: sy, nearEnemy: !!r.nearEnemy };
    flushEvents();
  }
  function longPress(sx, sy) {
    if (!W || W.over || W.clash || briefing) return;
    const r = pick(sx, sy);
    if (r.ship && r.ship.id === r.enemy.id) { play.taps++; boardOrder(); }
  }
  const detach = attachTouch(cv, {
    tap,
    longPress,
    pressStart: (x, y) => {
      if (!W || briefing) return;
      const r = pick(x, y);
      press = r.ship && r.ship.id === r.enemy.id ? { x, y, t0: performance.now() } : null;
    },
    pressEnd: () => { press = null; },
    pan: (dx, dy) => {
      if (W.clash) return;
      cam.follow = false; follow.hidden = false;
      const [ax, ay] = s2w(cam, 0, 0), [bx, by] = s2w(cam, dx, dy);
      cam.x -= bx - ax; cam.y -= by - ay;
    },
    pinch: (scale, mx, my) => {
      const [x0, y0] = s2w(cam, mx, my);
      setZoom(cam, cam.zoom * scale, true);
      const [x1, y1] = s2w(cam, mx, my);
      cam.x += x0 - x1; cam.y += y0 - y1;
      if (Math.abs(scale - 1) > 0.002 && !cam.follow) follow.hidden = false;
    },
    twoTap: () => { if (!W.over && !briefing) setPaused(!paused); },
    wheel: (dir, x, y) => {
      const [x0, y0] = s2w(cam, x, y);
      setZoom(cam, cam.zoom * (dir > 0 ? 1.1 : 0.9), true);
      const [x1, y1] = s2w(cam, x, y);
      if (!cam.follow) { cam.x += x0 - x1; cam.y += y0 - y1; }
    },
  });
  const onKey = (e) => {
    if (briefing || !W) return;
    if (e.code === 'Space') { e.preventDefault(); if (!W.over) setPaused(!paused); }
    else if (e.key === '1') choose('shot', 'round'); else if (e.key === '2') choose('shot', 'chain'); else if (e.key === '3') choose('shot', 'grape');
    else if (e.key === 's') choose('sail', ship(W, W.playerId).sail === 'full' ? 'battle' : 'full');
    else if (e.key === 'b') boardOrder();
  };
  const onHide = () => { if (document.hidden && W && !W.over && !briefing) setPaused(true); };
  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);

  // ---- drawing ----
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  function resize() {
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    fitCamera(cam, r.width, r.height, dpr);
  }

  // Ship positions smoothed between rule steps.
  function displayShips() {
    const a = paused || briefing ? 1 : clamp(acc / STEP, 0, 1);
    return W.ships.map((s) => {
      const q = prev.get(s.id);
      const x = q ? lerp(q.x, s.x, a) : s.x, y = q ? lerp(q.y, s.y, a) : s.y, hh = q ? q.h + wrapA(s.h - q.h) * a : s.h;
      const off = Math.abs(wrapA(s.h - W.wind.from)) / DEG;
      return {
        ...s, x, y, h: hh, speed: clamp(s.v / s.top, 0, 1), hullPct: s.hull / s.hullMax,
        roll: Math.sin(W.t * 1.3 + (s.id === W.playerId ? 0 : 2)) * 0.035, luff: off < 40 && !s.sinking,
      };
    });
  }

  function updCamera(dt, ships) {
    const p = ships.find((s) => s.id === W.playerId), e = ships.find((s) => s.id === W.enemyId);
    const k = Math.min(1, dt * 2.5);
    if (W.clash) {
      // keep both ships in the open sea above the boarding panel
      const panel = clash.offsetHeight, [mx, my] = [(p.x + e.x) / 2, (p.y + e.y) / 2];
      const tx = mx + (panel / 2 + 10) / (cam.zoom * 0.707), ty = my + (panel / 2 + 10) / (cam.zoom * 0.707);
      cam.x = lerp(cam.x, tx, Math.min(1, dt * 3)); cam.y = lerp(cam.y, ty, Math.min(1, dt * 3));
      return;
    }
    if (!cam.follow) return;
    let tx = p.x + Math.sin(p.h) * 110, ty = p.y - Math.cos(p.h) * 110, tz = cam.user;
    // In the angled view a phone sees far up and down but not far to the sides, so when the
    // enemy is in sight the camera frames both ships (zooming out if needed, never in).
    if (enemyVisible(W) && !e.sinking) {
      tx = lerp(tx, e.x, 0.5); ty = lerp(ty, e.y, 0.5);
      const fit = (s) => {
        const ix = Math.abs((s.x - tx) - (s.y - ty)) * 0.707, iy = ((s.x - tx) + (s.y - ty)) * 0.354;
        const zx = ix > 1 ? (cam.cw / 2 - 46) / ix : 9;
        const zy = iy < 0 ? (cam.ch * cam.cyf - 120) / -iy : iy > 1 ? (cam.ch * (1 - cam.cyf) - 50) / iy : 9;
        return Math.min(zx, zy);
      };
      tz = Math.max(cam.base * 0.5, Math.min(cam.user, fit(p), fit(e)));
    }
    cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
    if (Math.abs(cam.zoom - tz) > 0.0005) setZoom(cam, lerp(cam.zoom, tz, Math.min(1, dt * 1.5)));
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    let gameDt = 0;
    if (!paused && !briefing && !resultShown) {
      acc += dt * speed;
      let n = 0;
      while (acc >= STEP && n < 16) {
        prev = new Map(W.ships.map((s) => [s.id, { x: s.x, y: s.y, h: s.h }]));
        step(W); acc -= STEP; n++; gameDt += STEP;
        flushEvents();
        if (paused) { acc = 0; break; }
      }
      if (n >= 16) acc = 0; // a slow phone: drop time rather than skip rules
    }
    const ships = displayShips();
    updEffects(fx, gameDt, W.wind.from, ships, W.t);
    updCamera(dt, ships);
    const p = ships.find((s) => s.id === W.playerId), e = ships.find((s) => s.id === W.enemyId);
    drawScene(ctx, cam, W, {
      ships, player: p, enemy: e, enemySeen: enemyVisible(W), fx, t: now / 1000, alpha: clamp(acc / STEP, 0, 1),
      text: t, font: FONT, reduceMotion: false,
      press: press ? { x: press.x, y: press.y, k: (now - press.t0) / GESTURE.longMs } : null,
    });
    drawRose(p);
    play.frames++;
    if (now - play.fpsT > 1000) {
      play.fps = Math.round(play.frames * 1000 / (now - play.fpsT));
      if (play.fpsT && !paused && !briefing) play.fpsMin = Math.min(play.fpsMin, play.fps);
      play.frames = 0; play.fpsT = now;
      $.fps.textContent = t('sea.pause.fps', { n: play.fps });
    }
    uiAcc += dt;
    if (uiAcc > 0.1) { uiAcc = 0; uiTick(); }
    raf = requestAnimationFrame(frame);
  }

  function drawRose(p) {
    const S = rose.width, c = rose.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S); c.translate(S / 2, S / 2);
    c.beginPath(); c.arc(0, 0, S / 2 - 3, 0, Math.PI * 2); c.fillStyle = '#182125'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#34454c'; c.stroke();
    // N toward world north as seen in the angled view (upper right)
    const na = screenAngle(0);
    c.fillStyle = '#a6b2ac'; c.font = `700 16px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t('sea.dir.N'), Math.cos(na) * (S / 2 - 15), Math.sin(na) * (S / 2 - 15));
    const arrow = (ang, col, len, wid) => {
      c.save(); c.rotate(ang + Math.PI / 2);
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = wid; c.beginPath(); c.moveTo(0, len * 0.8); c.lineTo(0, -len * 0.6); c.stroke();
      c.beginPath(); c.moveTo(0, -len); c.lineTo(wid * 2.2, -len * 0.45); c.lineTo(-wid * 2.2, -len * 0.45); c.closePath(); c.fill(); c.restore();
    };
    arrow(screenAngle(W.wind.from + Math.PI), '#d1a84f', 34, 5); // where the wind blows to
    c.save(); c.rotate(screenAngle(p.h) + Math.PI / 2); c.fillStyle = '#4d86c4';
    c.beginPath(); c.moveTo(0, -12); c.lineTo(6, 8); c.lineTo(-6, 8); c.closePath(); c.fill(); c.restore();
  }

  // ---- the panels ----
  const barCol = (f) => (f > 0.6 ? 'var(--sea-good)' : f > 0.3 ? 'var(--sea-warn)' : 'var(--sea-bad)');
  function setBar(b, f, v, val) { b.style.width = clamp(f, 0, 1) * 100 + '%'; b.style.background = barCol(f); if (v) v.textContent = val; }
  function uiTick() {
    const p = ship(W, W.playerId), e = ship(W, W.enemyId);
    setBar($.bHull, p.hull / p.hullMax, $.vHull, Math.round(p.hull));
    setBar($.bSails, p.sails / 100, $.vSails, Math.round(p.sails));
    setBar($.bCrew, p.crew / p.crewMax, $.vCrew, Math.round(p.crew));
    setBar($.bMor, p.morale / 100, $.vMor, Math.round(p.morale));
    const rt = reloadTime(p);
    $.rL.style.width = clamp(1 - p.reload[-1] / rt, 0, 1) * 100 + '%';
    $.rR.style.width = clamp(1 - p.reload[1] / rt, 0, 1) * 100 + '%';
    $.rB.style.width = clamp(1 - p.reload[0] / (rt * BOW_RELOAD), 0, 1) * 100 + '%';
    $.powder.textContent = t('sea.card.powder', { n: p.powder });
    $.pSpeed.textContent = t('sea.card.knots', { v: (p.v * 0.2).toFixed(1) });
    const off = Math.abs(wrapA(p.h - W.wind.from)) / DEG;
    $.pos.textContent = t('sea.pos.' + pointOfSail(off));
    $.wind.textContent = t('sea.wind.text', { dir: t('sea.dir.' + compass(W.wind.from)), str: t('sea.wind.' + windWord(W.wind.str)) });
    const vis = enemyVisible(W);
    $.foeBars.hidden = !vis; $.foeHidden.hidden = vis;
    if (vis) { setBar($.fHull, e.hull / e.hullMax); setBar($.fSails, e.sails / 100); setBar($.fCrew, e.crew / e.crewMax); }
    else $.foeHidden.textContent = t(W.sighted ? 'sea.foe.lost' : 'sea.foe.notSeen');
    for (const sg of deck.querySelectorAll('.sea-seg')) {
      const k = sg.dataset.k;
      for (const b of sg.children) b.setAttribute('aria-pressed', String(p[k] === b.dataset.v));
    }
    $.board.setAttribute('aria-pressed', String(p.order.type === 'board'));
    if (W.clash) uiClash();
  }
  function uiClash() {
    const c = W.clash; if (!c) return;
    const P = ship(W, W.playerId), E = ship(W, W.enemyId);
    $.cRound.textContent = t('sea.clash.round', { n: c.round });
    $.cP.textContent = Math.round(P.crew); $.cE.textContent = Math.round(E.crew);
    $.cPm.textContent = t('sea.clash.morale', { n: Math.round(P.morale) });
    $.cEm.textContent = t('sea.clash.morale', { n: Math.round(E.morale) });
    const sp = P.crew * P.morale, se = E.crew * E.morale;
    $.cBal.style.width = (sp / (sp + se || 1) * 100) + '%';
    $.cTime.style.width = clamp(c.t / c.len, 0, 1) * 100 + '%';
    $.cTell.textContent = c.shown ? t('sea.tell.' + c.shown) : t('sea.clash.watching');
    for (const k of ['volley', 'charge', 'hold']) {
      const b = $['tac_' + k], ok = canUse(c, k);
      b.setAttribute('aria-pressed', String(c.pt === k)); b.disabled = !ok;
      $['tacSub_' + k].textContent = ok ? t('sea.beats.' + k) : t('sea.clash.reloading');
    }
    if (c.log) {
      $.cLog.textContent = t('sea.clash.log', {
        n: c.log.round, ours: t('sea.tac.' + c.log.pt), theirs: t('sea.tac.' + c.log.et),
        edge: t('sea.edge.' + c.log.edge), lp: c.log.lp, le: c.log.le,
      });
    }
  }

  function showResults() {
    resultShown = true;
    const p = ship(W, W.playerId), s = p.stats, k = W.over;
    const group = k.startsWith('won') ? 'won' : k.startsWith('lost') ? 'lost' : k;
    $.rEy.textContent = t('sea.result.' + group);
    $.rTitle.textContent = t('sea.result.' + k + 'Title', { name: ship(W, W.enemyId).name, ours: p.name });
    $.rText.textContent = t('sea.result.' + k + 'Text');
    const mm = Math.floor(W.overAt / 60), ss = String(Math.floor(W.overAt % 60)).padStart(2, '0');
    const rows = [
      [t('sea.result.time'), `${mm}:${ss}`],
      [t('sea.result.broadsides'), s.broadsides],
      [t('sea.result.hits'), t('sea.result.hitsOf', { h: s.hits, n: s.shots, p: s.shots ? Math.round(s.hits / s.shots * 100) : 0 })],
      [t('sea.result.rakes'), s.rakes],
      [t('sea.result.hullDealt'), Math.round(s.hullDealt)],
      [t('sea.result.menKilled'), Math.round(s.menKilled)],
      [t('sea.result.hullLeft'), t('sea.result.of', { a: Math.round(p.hull), b: p.hullMax })],
      [t('sea.result.crewLeft'), t('sea.result.of', { a: Math.round(p.crew), b: p.crewMax })],
      [t('sea.result.taps'), t('sea.result.tapsValue', { n: play.taps, w: play.wrong })],
    ];
    if (isTest) rows.push([t('sea.result.fps'), play.fpsMin < 999 ? play.fpsMin : play.fps]);
    $.rStats.replaceChildren(...rows.flatMap(([a, b]) => [h('span', {}, a), h('span', {}, String(b))]));
    result.hidden = false; pauseCard.hidden = true;
  }

  function leave() {
    cancelAnimationFrame(raf); clearTimeout(overTimer); clearTimeout(hintTimer);
    detach(); ro.disconnect();
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
    document.body.classList.remove('sea-mode');
    opts.onLeave?.();
  }

  // ---- start ----
  newFight();
  refreshPills();
  resize();
  uiTick();
  raf = requestAnimationFrame((n) => { last = n; frame(n); });
  // for checks in the browser pane (test build only): read the state, nothing else
  if (isTest || location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__sea = { get W() { return W; }, cam, play, tap, longPress, bench: (n = 60) => { const ships = displayShips(), p = ships[0], e = ships[1], t0 = performance.now(); for (let i = 0; i < n; i++) drawScene(ctx, cam, W, { ships, player: p, enemy: e, enemySeen: enemyVisible(W), fx, t: i / 60, alpha: 1, text: t, font: FONT, reduceMotion: false, press: null }); return (performance.now() - t0) / n; }, fast: (n) => { prev = new Map(); for (let i = 0; i < n && !W.over; i++) { step(W); flushEvents(); } } };
  return { leave };
}
