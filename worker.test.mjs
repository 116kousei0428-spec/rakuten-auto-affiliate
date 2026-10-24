import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const assets = { fetch: async () => new Response('static-ok') };
test('health endpoint', async () => { const r = await worker.fetch(new Request('https://x.test/api/health'), { ASSETS: assets }); assert.equal(r.status, 200); assert.equal((await r.json()).ok, true); });
test('credentials missing returns 503', async () => { const r = await worker.fetch(new Request('https://x.test/api/search?keyword=abc'), { ASSETS: assets }); assert.equal(r.status, 503); });
test('static asset fallback', async () => { const r = await worker.fetch(new Request('https://x.test/'), { ASSETS: assets }); assert.equal(await r.text(), 'static-ok'); });
test('invalid keyword returns 400', async () => { const r = await worker.fetch(new Request('https://x.test/api/search?keyword='), { ASSETS: assets, RAKUTEN_APP_ID: 'id', RAKUTEN_ACCESS_KEY: 'key' }); assert.equal(r.status, 400); });


test('registered Cloudflare secrets are passed to Rakuten API without leaking to browser', async () => {
  const originalFetch = globalThis.fetch;
  const env = { ASSETS: assets, RAKUTEN_APP_ID: 'app-private', RAKUTEN_ACCESS_KEY: 'access-private', RAKUTEN_AFFILIATE_ID: 'affiliate-test' };
  let called = false;
  globalThis.fetch = async (requestUrl, options) => {
    called = true;
    const u = new URL(requestUrl);
    assert.equal(u.searchParams.get('applicationId'), env.RAKUTEN_APP_ID);
    assert.equal(u.searchParams.get('affiliateId'), env.RAKUTEN_AFFILIATE_ID);
    assert.equal(options.headers.accessKey, env.RAKUTEN_ACCESS_KEY);
    assert.equal(u.searchParams.get('keyword'), 'イヤホン');
    return Response.json({ Items: [{ Item: { itemName: 'テスト商品', itemPrice: 1200, affiliateUrl: 'https://example.test/aff', mediumImageUrls: [{ imageUrl: 'https://example.test/img.png' }] } }] });
  };
  try {
    const res = await worker.fetch(new Request('https://x.test/api/search?keyword=' + encodeURIComponent('イヤホン')), env);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(called, true);
    assert.equal(payload.items[0].url, 'https://example.test/aff');
    assert.ok(!JSON.stringify(payload).includes(env.RAKUTEN_ACCESS_KEY));
    assert.ok(!JSON.stringify(payload).includes(env.RAKUTEN_APP_ID));
  } finally { globalThis.fetch = originalFetch; }
});

test('affiliate link is not reported as configured without affiliate ID', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ Items: [{ Item: { itemName: '商品', itemPrice: 100, itemUrl: 'https://example.test/item', affiliateUrl: 'https://example.test/affiliate' } }] });
  try {
    const res = await worker.fetch(new Request('https://x.test/api/search?keyword=abc'), { ASSETS: assets, RAKUTEN_APP_ID: 'app', RAKUTEN_ACCESS_KEY: 'access' });
    const data = await res.json();
    assert.equal(data.affiliateConfigured, false);
    assert.equal(data.items[0].url, 'https://example.test/item');
  } finally { globalThis.fetch = originalFetch; }
});
