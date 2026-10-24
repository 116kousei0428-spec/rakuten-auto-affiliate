import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const assets = { fetch: async () => new Response('static-ok') };
const env = { ASSETS: assets, RAKUTEN_APP_ID: 'app-private', RAKUTEN_ACCESS_KEY: 'access-private', RAKUTEN_AFFILIATE_ID: 'affiliate-private' };
const search = (url = 'https://site.test/api/search?keyword=' + encodeURIComponent('イヤホン'), e = env) => worker.fetch(new Request(url), e);
const withFetch = async (mock, cb) => {
  const previous = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await cb(); } finally { globalThis.fetch = previous; }
};

test('health checks presence without revealing secrets', async () => {
  const r = await worker.fetch(new Request('https://site.test/api/health'), env);
  const payload = await r.json();
  assert.equal(r.status, 200);
  assert.equal(payload.apiConfigured, true);
  assert.equal(payload.release, 'v8');
  assert.ok(!JSON.stringify(payload).includes('app-private'));
  assert.ok(!JSON.stringify(payload).includes('access-private'));
});
test('missing keys returns 503', async () => {
  assert.equal((await search(undefined, { ASSETS: assets })).status, 503);
});
test('static assets continue working', async () => {
  const r = await worker.fetch(new Request('https://site.test/'), env);
  assert.equal(await r.text(), 'static-ok');
});
test('empty and overly long keyword return 400', async () => {
  assert.equal((await search('https://site.test/api/search?keyword=')).status, 400);
  assert.equal((await search('https://site.test/api/search?keyword=' + 'あ'.repeat(50))).status, 400);
});
test('sends official test form parameters server side, uses affiliate URL', async () => {
  await withFetch(async (uri, options) => {
    const u = new URL(uri);
    assert.equal(u.origin, 'https://openapi.rakuten.co.jp');
    assert.equal(u.searchParams.get('applicationId'), env.RAKUTEN_APP_ID);
    assert.equal(u.searchParams.get('accessKey'), env.RAKUTEN_ACCESS_KEY);
    assert.equal(u.searchParams.get('affiliateId'), env.RAKUTEN_AFFILIATE_ID);
    assert.equal(u.searchParams.get('keyword'), 'イヤホン');
    assert.equal(options.headers.Accept, 'application/json');
    return Response.json({ Items: [{ Item: { itemName: '商品', itemPrice: 1200, itemUrl: 'https://example.com/item', affiliateUrl: 'https://example.com/affiliate', mediumImageUrls: [{ imageUrl: 'https://example.com/img.jpg' }] } }] });
  }, async () => {
    const r = await search();
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(data.items[0].url, 'https://example.com/affiliate');
    assert.ok(!JSON.stringify(data).includes('access-private'));
    assert.ok(!JSON.stringify(data).includes('app-private'));
  });
});
test('403 returns specific diagnostic status without leaking provider errors or secrets', async () => {
  await withFetch(async () => Response.json({ error: 'forbidden', error_description: 'access-private' }, { status: 403 }), async () => {
    const r = await search();
    const data = await r.json();
    assert.equal(r.status, 502);
    assert.equal(data.upstreamStatus, 403);
    assert.equal(data.upstreamErrorCode, 'forbidden');
    assert.ok(!JSON.stringify(data).includes('access-private'));
  });
});
test('429 returns temporary 503 and Retry-After header', async () => {
  await withFetch(async () => Response.json({ error: 'too_many_requests' }, { status: 429 }), async () => {
    const r = await search();
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('Retry-After'), '120');
    assert.equal((await r.json()).upstreamStatus, 429);
  });
});
test('quoted secrets are normalized', async () => {
  await withFetch(async (uri) => {
    assert.equal(new URL(uri).searchParams.get('accessKey'), 'keyvalue');
    return Response.json({ Items: [] });
  }, async () => {
    const r = await search(undefined, { ...env, RAKUTEN_ACCESS_KEY: ' "keyvalue" ' });
    assert.equal(r.status, 200);
  });
});
test('no affiliate ID falls back to regular product URL', async () => {
  await withFetch(async (uri) => {
    assert.equal(new URL(uri).searchParams.has('affiliateId'), false);
    return Response.json({ Items: [{ Item: { itemName: 'item', itemUrl: 'https://example.com/item', affiliateUrl: '' } }] });
  }, async () => {
    const r = await search(undefined, { ...env, RAKUTEN_AFFILIATE_ID: undefined });
    const data = await r.json();
    assert.equal(data.affiliateConfigured, false);
    assert.equal(data.items[0].url, 'https://example.com/item');
  });
});
