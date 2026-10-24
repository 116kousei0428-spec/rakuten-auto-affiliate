import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
assert.equal(config.main, './worker.js');
assert(existsSync(config.main), 'Worker entrypoint missing');
assert(existsSync(`${config.assets.directory}/index.html`), 'Static index missing');
console.log('PASS: root worker.js and assets exist; wrangler paths match');
