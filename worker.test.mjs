import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const assets = { fetch: async () => new Response('static-ok') };
test('health endpoint', async () => { const r = await worker.fetch(new Request('https://x.test/api/health'), { ASSETS: assets }); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true); });
test('credentials missing returns 503', async () => { const r = await worker.fetch(new Request('https://x.test/api/search?keyword=abc'), { ASSETS: assets }); assert.equal(r.status, 503); });
test('static asset fallback', async () => { const r = await worker.fetch(new Request('https://x.test/'), { ASSETS: assets }); assert.equal(await r.text(), 'static-ok'); });
test('invalid keyword returns 400', async () => { const r = await worker.fetch(new Request('https://x.test/api/search?keyword='), { ASSETS: assets, RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }); assert.equal(r.status, 400); });
