// Start-up and screens for M0 (the workshop): language, title, settings, credits.
// M1: the practice fight on the isometric sea (src/ui/sea-screen.js).
// text-keys: settings.bad.*
// M2 (first part): the practice voyage in port (src/ui/port-screen.js), autosave, Continue, export and import.
import { VERSION } from './version.js';
import { loadTexts, createTranslator, guessLang, LANGS, formatDay } from './text/i18n.js';
import * as store from './save/store.js';
import { openSea, loadFight } from './ui/sea-screen.js';
import { openPort, loadVoyageData } from './ui/port-screen.js';
import * as saves from './save/saves.js';
import { createVoyage } from './sim/voyage.js';

const app = document.getElementById('app');
const isTest = /\/test(\/|$)/.test(location.pathname);
const state = { lang: 'en', tables: null, t: (k) => k, updateReady: null, offlineReady: false, screen: null, autosave: null };

store.init(isTest ? 'pmnn-test' : 'pmnn');

// --- tiny DOM helper -------------------------------------------------------
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function button(label, onTap, extra = {}) {
  return el('button', { type: 'button', ...extra, on: { click: onTap } }, label);
}

function show(screenFn) {
  state.screen = screenFn;
  app.replaceChildren(screenFn());
  document.documentElement.lang = state.lang;
}

function setLang(lang) {
  state.lang = LANGS.includes(lang) ? lang : 'en';
  state.t = createTranslator(state.tables[state.lang], state.tables.en);
}

// --- screens ---------------------------------------------------------------
function header(t, small = false) {
  return el('header', { class: small ? 'brand small' : 'brand' },
    el('h1', {}, 'Por Mares Nunca Navegados'),
    el('p', { class: 'subtitle' }, t('title.subtitle')),
  );
}

function languageScreen() {
  const t = state.t;
  const pick = async (lang) => {
    setLang(lang);
    await store.set('settings.lang', lang);
    store.askToKeep();
    show(titleScreen);
  };
  return el('section', { class: 'card' },
    header(t),
    el('h2', {}, t('lang.choose')),
    el('div', { class: 'stack' },
      button(t('lang.en'), () => pick('en'), { class: state.lang === 'en' ? 'primary' : '' }),
      button(t('lang.pt'), () => pick('pt'), { class: state.lang === 'pt' ? 'primary' : '' }),
    ),
  );
}

function hintLine() {
  return el('p', { class: 'hint', id: 'hint', role: 'status' });
}

function flash(text) {
  const h = document.getElementById('hint');
  if (!h) return;
  h.textContent = text;
  h.classList.add('on');
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => h.classList.remove('on'), 3500);
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

function titleScreen() {
  const t = state.t;
  const parts = [
    header(t),
    el('p', { class: 'tagline' }, t('title.tagline')),
    el('blockquote', { class: 'verse' }, t('title.verse'), el('cite', {}, t('title.verseBy'))),
    el('div', { class: 'stack' },
      state.autosave
        ? button(t('title.continueFrom', whereLabel(state.autosave)), continueVoyage, { class: 'primary' })
        : button(t('title.continue'), () => flash(t('title.noSave')), { class: 'muted', 'aria-disabled': 'true' }),
      button(t('title.voyage'), startVoyage, { class: state.autosave ? '' : 'primary' }),
      button(t('title.fight'), startFight),
      button(t('title.newCampaign'), () => flash(t('title.soon'))),
      button(t('title.settings'), () => show(settingsScreen)),
      button(t('title.credits'), () => show(creditsScreen)),
    ),
    hintLine(),
  ];
  if (state.updateReady) {
    parts.unshift(el('div', { class: 'banner' },
      el('span', {}, t('update.ready')),
      button(t('update.restart'), () => state.updateReady(), { class: 'primary small' })));
  }
  if (isIOS() && !isStandalone()) {
    const box = el('div', { class: 'banner soft' },
      el('span', {}, t('install.ios')),
      button(t('install.close'), () => box.remove(), { class: 'small' }));
    parts.push(box);
  }
  parts.push(footer(t));
  return el('section', { class: 'card' }, parts);
}

async function startFight() {
  try {
    if (!state.fightData) state.fightData = await loadFight('zeehond');
    openSea(app, { t: state.t, data: state.fightData, isTest, onLeave: () => show(titleScreen) });
  } catch (err) {
    flash('Error · Erro: ' + (err && err.message ? err.message : err));
  }
}

// ---- the practice voyage (M2) ----
function whereLabel(doc) {
  const date = formatDay(doc.where.day, state.lang);
  return { date, port: doc.where.port ? state.t('port.name.' + doc.where.port) : '' };
}

async function refreshAutosave() {
  try { state.autosave = await saves.peek('auto'); } catch { state.autosave = null; }
}

async function openVoyage(V) {
  if (!state.voyage) state.voyage = await loadVoyageData('m2-pepper');
  const { D, mission } = state.voyage;
  openPort(app, {
    t: state.t, lang: state.lang, D, mission, V: V || createVoyage(D, mission),
    onSave: (v) => saves.write('auto', v, VERSION).then((doc) => { state.autosave = doc; }).catch(() => flash(state.t('settings.bad.writeFailed'))),
    onLeave: () => refreshAutosave().then(() => show(titleScreen)),
  });
}

async function startVoyage() {
  // a voyage in progress is replaced only on a second tap within 4 seconds
  const running = state.autosave && state.autosave.state && !state.autosave.state.result;
  if (running && !(startVoyage.armed > Date.now())) {
    startVoyage.armed = Date.now() + 4000;
    flash(state.t('title.replaceSave'));
    return;
  }
  startVoyage.armed = 0;
  try {
    await openVoyage(null);
  } catch (err) {
    flash('Error · Erro: ' + (err && err.message ? err.message : err));
  }
}

async function continueVoyage() {
  let V = null;
  try { V = await saves.read('auto'); } catch { /* reported below */ }
  if (!V) { flash(state.t('title.loadBad')); return; }
  try { await openVoyage(V); } catch (err) { flash('Error · Erro: ' + (err && err.message ? err.message : err)); }
}

async function exportSave() {
  const doc = await saves.peek('auto');
  if (!doc) { flash(state.t('settings.exportNone')); return; }
  saves.exportFile(doc);
  flash(state.t('settings.exported'));
}

async function importSave() {
  const text = await saves.pickFile();
  if (text == null) return;
  try {
    const V = saves.unpack(text);
    const doc = await saves.write('auto', V, VERSION);
    state.autosave = doc;
    flash(state.t('settings.imported', whereLabel(doc)));
  } catch (err) {
    const k = 'settings.bad.' + (err && err.message);
    flash(state.t(k) === k ? state.t('settings.bad.broken') : state.t(k));
  }
}

function footer(t) {
  return el('footer', {},
    el('span', {}, t('title.version', { v: VERSION })),
    isTest ? el('span', { class: 'badge' }, t('title.testBuild')) : null);
}

function settingsScreen() {
  const t = state.t;
  const choose = async (lang) => {
    setLang(lang);
    await store.set('settings.lang', lang);
    show(settingsScreen);
  };
  return el('section', { class: 'card' },
    header(t, true),
    el('h2', {}, t('settings.title')),
    el('h3', {}, t('settings.language')),
    el('div', { class: 'row' },
      button(t('lang.en'), () => choose('en'), { class: state.lang === 'en' ? 'primary' : '', 'aria-pressed': String(state.lang === 'en') }),
      button(t('lang.pt'), () => choose('pt'), { class: state.lang === 'pt' ? 'primary' : '', 'aria-pressed': String(state.lang === 'pt') }),
    ),
    el('h3', {}, t('settings.saves')),
    el('p', {}, t('settings.saveNote')),
    el('div', { class: 'row' },
      button(t('settings.export'), exportSave),
      button(t('settings.import'), importSave),
    ),
    hintLine(),
    el('h3', {}, t('settings.privacy')),
    el('p', {}, t('settings.privacyNote')),
    el('h3', {}, t('settings.about')),
    el('p', {}, state.offlineReady ? t('settings.offlineReady') : t('settings.offline')),
    el('div', { class: 'stack' }, button(t('settings.back'), () => show(titleScreen))),
    footer(t),
  );
}

function creditsScreen() {
  const t = state.t;
  return el('section', { class: 'card' },
    header(t, true),
    el('h2', {}, t('credits.title')),
    el('ul', { class: 'plain' },
      el('li', {}, t('credits.design')),
      el('li', {}, t('credits.code')),
      el('li', {}, t('credits.fonts')),
      el('li', {}, t('credits.licence')),
      el('li', {}, t('credits.history')),
    ),
    el('div', { class: 'stack' }, button(t('settings.back'), () => show(titleScreen))),
    footer(t),
  );
}

// --- offline helper ----------------------------------------------------------
function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  // While building on this PC the offline helper would keep serving old files; add ?offline to test it.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !/offline/.test(location.search)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offerUpdate = (worker) => {
      state.updateReady = () => worker.postMessage({ type: 'skip-waiting' });
      if (state.screen === titleScreen) show(titleScreen);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed') {
          if (navigator.serviceWorker.controller) offerUpdate(w);
          else state.offlineReady = true;
        }
      });
    });
    if (reg.active && navigator.serviceWorker.controller) state.offlineReady = true;
  }).catch(() => { /* offline helper not available: the game still runs online */ });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (state.updateReady && !reloading) { reloading = true; location.reload(); }
  });
}

// --- start ---------------------------------------------------------------------
async function start() {
  state.tables = await loadTexts();
  await refreshAutosave();
  const saved = await store.get('settings.lang');
  if (saved) {
    setLang(saved);
    show(titleScreen);
  } else {
    setLang(guessLang(navigator.languages || [navigator.language]));
    show(languageScreen);
  }
  registerWorker();
}

start().catch((err) => {
  app.replaceChildren(el('p', { class: 'loading' }, 'Error · Erro: ' + (err && err.message ? err.message : err)));
});
