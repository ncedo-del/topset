// Cross-platform `node --check` over every browser script (the app has no bundler to catch typos).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const dir = new URL('../public/js/', import.meta.url);
let bad = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const r = spawnSync(process.execPath, ['--check', new URL(f, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(`✗ ${f}\n${r.stderr}`); }
}
console.log(bad ? `${bad} file(s) failed` : 'all scripts parse');
process.exit(bad ? 1 : 0);
