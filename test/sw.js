// Offline helper (Phase 8). Stores every game file on the phone the first time,
// then serves them from there, so the game starts with no internet.
// FILES must list every game file: `node tools/check.js` checks it.
const VERSION = '0.0.1';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg',
  'src/main.js',
  'src/save/store.js',
  'src/sim/rng.js',
  'src/style.css',
  'src/text/i18n.js',
  'src/version.js',
  'text/en.json',
  'text/pt.json',
];

// The main game and the test copy share one website, so each keeps its own cache.
const PREFIX = 'pmnn:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

// "New version ready, restart?" on the title screen (never mid-fight).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

const OWN = new Set(FILES.map((f) => new URL(f, self.registration.scope).href));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = '';
  url.hash = '';
  if (!OWN.has(url.href)) return; // not one of ours (for example the test copy): leave it to the network
  event.respondWith(
    caches.open(CACHE).then((cache) => cache.match(url.href).then((hit) => hit || fetch(req))),
  );
});
