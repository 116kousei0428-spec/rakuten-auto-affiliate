import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
assert.equal(config.name, 'rakuten-auto-affiliate');
assert.equal(config.main, './worker.js');
assert(existsSync(config.main), 'Worker entrypoint missing');
assert(existsSync(`${config.assets.directory}/index.html`), 'Static index missing');
assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
console.log('PASS: Worker name/entry point/API route/assets match GitHub layout');
