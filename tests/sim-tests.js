// Rule tests: run without a screen, in Node (tools/check.js) or the browser (tests/run.html).
// Each test throws if something is wrong.
import { createRng } from '../src/sim/rng.js';
import { createTranslator, flatten, guessLang } from '../src/text/i18n.js';

function equal(a, b, what) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function check(cond, what) { if (!cond) throw new Error(what); }

export const tests = [
  {
    name: 'seeded dice: same seed gives the same rolls',
    fn() {
      const a = createRng(1638), b = createRng(1638);
      equal(Array.from({ length: 20 }, a.next), Array.from({ length: 20 }, b.next), 'rolls');
    },
  },
  {
    name: 'seeded dice: saving and loading the state continues the same rolls',
    fn() {
      const a = createRng(42);
      for (let i = 0; i < 100; i++) a.next();
      const saved = a.getState();
      const expected = Array.from({ length: 10 }, a.next);
      const b = createRng(7);
      b.setState(saved);
      equal(Array.from({ length: 10 }, b.next), expected, 'rolls after load');
    },
  },
  {
    name: 'seeded dice: rolls stay in range and look even',
    fn() {
      const r = createRng(5);
      const counts = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < 60000; i++) {
        const x = r.next();
        check(x >= 0 && x < 1, 'roll out of range');
        counts[r.int(1, 6) - 1]++;
      }
      check(counts.every((c) => c > 9000 && c < 11000), 'dice uneven: ' + counts.join(','));
    },
  },
  {
    name: 'text: missing Portuguese line falls back to English; {x} is filled in',
    fn() {
      const en = flatten({ a: { b: 'Version {v}', c: 'Only English' } });
      const pt = flatten({ a: { b: 'Versão {v}' } });
      const t = createTranslator(pt, en);
      equal(t('a.b', { v: '0.1' }), 'Versão 0.1', 'filled');
      equal(t('a.c'), 'Only English', 'fallback');
      equal(t('a.zzz'), 'a.zzz', 'unknown key shows the key');
    },
  },
  {
    name: 'text: phone language picks Portuguese only for pt',
    fn() {
      equal(guessLang(['pt-PT', 'en']), 'pt', 'pt-PT');
      equal(guessLang(['pt-BR']), 'pt', 'pt-BR');
      equal(guessLang(['en-GB', 'pt']), 'pt', 'pt second');
      equal(guessLang(['fr-FR']), 'en', 'other');
    },
  },
];
