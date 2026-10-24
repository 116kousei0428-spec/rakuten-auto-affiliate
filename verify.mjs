import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
for (const name of ['src/worker.js','public/index.html','public/app.js','public/style.css','wrangler.jsonc','package.json']) {
  if (!existsSync(name)) throw new Error(`Missing required file: ${name}`);
}
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if (config.main !== './src/worker.js' || config.assets.directory !== './public') throw new Error('Wrangler path mismatch');
for (const name of ['src/worker.js','public/app.js']) execFileSync(process.execPath,['--check',name],{stdio:'inherit'});
console.log('PASS: entry point and static assets exist; JS syntax valid; config paths match.');
