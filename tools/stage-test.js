// Copies the current game into test/, the "test address" (Phase 8), where a new
// version is tried on the phones before players get it.
// Usage: node tools/stage-test.js   (then commit and push; Pages serves /test/)
// It only adds and overwrites files; it never deletes anything.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, gameFiles } from './files.js';

const DEST = path.join(ROOT, 'test');
const files = [...gameFiles(), 'sw.js'];
for (const rel of files) {
  const to = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), to);
}
fs.writeFileSync(path.join(DEST, 'STAGED.txt'),
  `Test copy of the game, made by tools/stage-test.js on ${new Date().toISOString()}.\n` +
  `Don't edit files here: edit the game at the top of the repository and stage again.\n` +
  `Files: ${files.length}\n`);
console.log(`Copied ${files.length} files into test/.`);
