// Sound effects made by code (Phase 6, Web Audio): nothing to download, no licences.
// Phones start silent until the first tap (a browser rule), so unlock() is called on a tap.
let AC = null, noise = null, muted = false;

export function unlock() {
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate;
      noise = AC.createBuffer(1, len, AC.sampleRate);
      const d = noise.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    }
    if (AC.state === 'suspended') AC.resume();
  } catch { AC = null; }
}
export const setMuted = (m) => { muted = m; };
export const isMuted = () => muted;

function noiseBurst(t, { type = 'lowpass', f0 = 1000, f1 = 110, q = 0.7, vol = 0.5, attack = 0.012, len = 0.9, offset = 0 }) {
  const src = AC.createBufferSource(); src.buffer = noise;
  const f = AC.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + len * 0.6);
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f); f.connect(g); g.connect(AC.destination); src.start(t, offset); src.stop(t + len + 0.05);
}
function tone(t, f0, f1, vol, len, type = 'sine') {
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.8);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + len + 0.05);
}
const play = (fn) => { if (!AC || muted) return; try { fn(AC.currentTime); } catch { /* sound is never essential */ } };

export const boom = (vol = 1, when = 0) => play((t) => { t += when; noiseBurst(t, { vol: 0.55 * vol }); tone(t, 75, 32, 0.45 * vol, 0.35); });
export const splash = (vol = 0.5) => play((t) => noiseBurst(t, { type: 'bandpass', f0: 1800, f1: 1800, vol: 0.25 * vol, attack: 0.02, len: 0.35, offset: Math.random() * 0.5 }));
export const crack = (vol = 0.6) => play((t) => { noiseBurst(t, { type: 'highpass', f0: 900, f1: 900, vol: 0.35 * vol, attack: 0.003, len: 0.12 }); tone(t, 220, 90, 0.15 * vol, 0.12, 'square'); });
export const bell = (vol = 0.5) => play((t) => { for (const [f, v] of [[660, 1], [1320, 0.4], [1980, 0.2]]) tone(t, f, f * 0.995, 0.18 * vol * v, 2.2); });
export const grapnel = (vol = 0.6) => play((t) => { for (let i = 0; i < 3; i++) noiseBurst(t + i * 0.12, { type: 'bandpass', f0: 2600, f1: 2600, q: 4, vol: 0.2 * vol, attack: 0.002, len: 0.1 }); });
export const tick = () => play((t) => tone(t, 900, 700, 0.06, 0.06, 'triangle'));

// Phone vibration (not on iPhone Safari: every buzz also has a sound or a sign, Phase 3).
export function buzz(ms) { try { if (!muted && navigator.vibrate) navigator.vibrate(ms); } catch { /* not supported */ } }
