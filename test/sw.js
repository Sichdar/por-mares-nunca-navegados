// Offline helper (Phase 8). Stores every game file on the phone the first time,
// then serves them from there, so the game starts with no internet.
// FILES must list every game file: `node tools/check.js` checks it.
const VERSION = '0.1.1';
const FILES = [
  './',
  'data/fights/zeehond.json',
  'data/goods.json',
  'data/maps/galle-test.json',
  'data/missions/m2-pepper.json',
  'data/ports.json',
  'data/routes.json',
  'data/ships.json',
  'fonts/AlegreyaSans-Bold.ttf',
  'fonts/AlegreyaSans-Italic.ttf',
  'fonts/AlegreyaSans-OFL.txt',
  'fonts/AlegreyaSans-Regular.ttf',
  'fonts/IMFellEnglishSC-OFL.txt',
  'fonts/IMFellEnglishSC-Regular.ttf',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon.svg',
  'index.html',
  'manifest.webmanifest',
  'src/audio/sfx.js',
  'src/draw/coast.js',
  'src/draw/effects.js',
  'src/draw/iso.js',
  'src/draw/scene.js',
  'src/draw/sea.js',
  'src/draw/ships.js',
  'src/input/touch.js',
  'src/main.js',
  'src/save/migrate.js',
  'src/save/saves.js',
  'src/save/store.js',
  'src/sim/ai.js',
  'src/sim/boarding.js',
  'src/sim/calendar.js',
  'src/sim/core.js',
  'src/sim/geom.js',
  'src/sim/gunnery.js',
  'src/sim/navigation.js',
  'src/sim/rng.js',
  'src/sim/rules.js',
  'src/sim/ship.js',
  'src/sim/sight.js',
  'src/sim/trade.js',
  'src/sim/voyage.js',
  'src/sim/wind.js',
  'src/sim/world.js',
  'src/style.css',
  'src/text/i18n.js',
  'src/ui/port-screen.js',
  'src/ui/port.css',
  'src/ui/sea-screen.js',
  'src/ui/sea.css',
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
