// Start-up and screens for M0 (the workshop): language, title, settings, credits.
// The game loop arrives in M1.
import { VERSION } from './version.js';
import { loadTexts, createTranslator, guessLang, LANGS } from './text/i18n.js';
import * as store from './save/store.js';

const app = document.getElementById('app');
const isTest = /\/test(\/|$)/.test(location.pathname);
const state = { lang: 'en', tables: null, t: (k) => k, updateReady: null, offlineReady: false, screen: null };

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
      button(t('title.continue'), () => flash(t('title.noSave')), { class: 'muted', 'aria-disabled': 'true' }),
      button(t('title.newCampaign'), () => flash(t('title.soon')), { class: 'primary' }),
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
