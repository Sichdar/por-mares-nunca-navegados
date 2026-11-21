// Runs the rule tests in the browser, so they can be checked on a phone too.
import { tests } from './sim-tests.js';

const out = document.getElementById('out');
let failed = 0;
for (const { name, fn } of tests) {
  const li = document.createElement('li');
  try { await fn(); li.textContent = '✓ ' + name; } catch (e) { failed++; li.textContent = '✗ ' + name + ': ' + e.message; }
  out.append(li);
}
const sum = document.createElement('li');
sum.textContent = failed ? `${failed} failed` : `All ${tests.length} passed`;
out.append(sum);
document.title = failed ? 'Tests: FAILED' : 'Tests: passed';
