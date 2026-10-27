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
  assert.equal(payload.release, 'v11');
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
    assert.equal(u.searchParams.has('accessKey'), false);
    assert.equal(options.headers.accessKey, env.RAKUTEN_ACCESS_KEY);
    assert.equal(options.headers.Referer, 'https://site.test/');
    assert.equal(options.headers.Origin, 'https://site.test');
    assert.equal(options.redirect, 'follow');
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
test('new Rakuten 403 nested gateway error returns actionable code', async () => {
  await withFetch(async () => Response.json({ errors: { errorCode: 403, errorMessage: 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING' } }, { status: 403 }), async () => {
    const data = await (await search()).json();
    assert.equal(data.upstreamStatus, 403);
    assert.equal(data.upstreamErrorCode, 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING');
    assert.equal(data.diagnosticHint, 'CHECK_REGISTERED_WEBSITE_AND_ORIGIN');
    assert.equal(data.responseFormat, 'json');
  });
});
test('403 HTML never exposes HTML content, keys, or fake codes', async () => {
  await withFetch(async () => new Response('<html>access-private</html>', { status: 403, headers: { 'Content-Type': 'text/html' } }), async () => {
    const data = await (await search()).json();
    assert.equal(data.upstreamErrorCode, null);
    assert.equal(data.responseFormat, 'non_json');
    assert.ok(!JSON.stringify(data).includes('access-private'));
  });
});
test('403 scope denied is recognized from Rakuten errorMessage', async () => {
  await withFetch(async () => Response.json({ errors: { errorCode: 403, errorMessage: 'REQUESTED_SCOPES_NOT_ALLOWED' } }, { status: 403 }), async () => {
    const data = await (await search()).json();
    assert.equal(data.diagnosticHint, 'CHECK_ICHIBA_API_SCOPE');
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
  await withFetch(async (uri, options) => {
    assert.equal(new URL(uri).searchParams.has('accessKey'), false);
    assert.equal(options.headers.accessKey, 'keyvalue');
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

test('transport TypeError is not disguised as invalid credentials', async () => {
  await withFetch(async () => { throw new TypeError('secret is not safe for logs'); }, async () => {
    const r = await search();
    const data = await r.json();
    assert.equal(r.status, 502);
    assert.equal(data.errorCode, 'UPSTREAM_FETCH_REJECTED');
    assert.equal(data.errorType, 'TypeError');
    assert.ok(!JSON.stringify(data).includes('secret'));
  });
});
test('timeout gets a separate diagnostic code', async () => {
  await withFetch(async () => { const e = new Error('hidden'); e.name = 'TimeoutError'; throw e; }, async () => {
    const data = await (await search()).json();
    assert.equal(data.errorCode, 'UPSTREAM_TIMEOUT');
  });
});
test('worker does not embed credentials in text assets', async () => {
  const r = await worker.fetch(new Request('https://site.test/api/health'), env);
  const text = await r.text();
  assert.ok(!text.includes('access-private'));
});

const adminEnv = {
  ...env,
  AI_ADMIN_TOKEN: 'this-is-a-long-random-test-only-token',
  AI: {
    run: async () => ({ response: '## 商品の概要\nこの商品は楽天市場で販売されています。商品ページの記載を確認してください。\n\n## 注目したいポイント\n購入前に商品の特徴を確認しましょう。\n\n## 購入前に確認したいこと\n価格や在庫、送料などは販売ページで再確認してください。\n\n## まとめ\n紹介情報は参考として扱ってください。' })
  }
};
const demoItem = {
  name: '楽天テストイヤホン', price: 4500, shop: '楽天の店', code: 'shop:001',
  caption: '商品説明によるとワイヤレス接続に対応。',
  url: 'https://item.rakuten.co.jp/shop/001/'
};
const articleRequest = (data = { item: demoItem }, token = adminEnv.AI_ADMIN_TOKEN, origin = 'https://site.test') => new Request('https://site.test/api/articles/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token, 'Origin': origin },
  body: JSON.stringify(data)
});
test('AI status reports bindings only, does not expose secrets', async () => {
  const body = await (await worker.fetch(new Request('https://site.test/api/health'), adminEnv)).json();
  assert.equal(body.aiConfigured, true);
  assert.equal(body.aiAdminConfigured, true);
  assert.ok(!JSON.stringify(body).includes(adminEnv.AI_ADMIN_TOKEN));
});
test('AI endpoint requires POST', async () => {
  const r = await worker.fetch(new Request('https://site.test/api/articles/generate'), adminEnv);
  assert.equal(r.status, 405);
});
test('AI endpoint is disabled without admin secret', async () => {
  const r = await worker.fetch(articleRequest(), { ...adminEnv, AI_ADMIN_TOKEN: undefined });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).errorCode, 'ADMIN_NOT_CONFIGURED');
});
test('AI endpoint rejects wrong token without inference', async () => {
  let called = false;
  const r = await worker.fetch(articleRequest({ item: demoItem }, 'wrong-token'), { ...adminEnv, AI: { run: async () => { called = true; } } });
  assert.equal(r.status, 401);
  assert.equal(called, false);
});
test('AI endpoint rejects cross origin even with valid admin token', async () => {
  const r = await worker.fetch(articleRequest({ item: demoItem }, adminEnv.AI_ADMIN_TOKEN, 'https://not-site.test'), adminEnv);
  assert.equal(r.status, 403);
});
test('AI requires binding', async () => {
  const r = await worker.fetch(articleRequest(), { ...adminEnv, AI: undefined });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).errorCode, 'AI_BINDING_MISSING');
});
test('AI refuses non-Rakuten product URL before calling AI', async () => {
  let called = false;
  const r = await worker.fetch(articleRequest({ item: { ...demoItem, url: 'https://not-rakuten.example/item' } }), { ...adminEnv, AI: { run: async () => { called = true; } } });
  assert.equal(r.status, 400);
  assert.equal(called, false);
});
test('AI returns Japanese affiliate article draft with disclosure and trusted link', async () => {
  let calls = 0;
  const e = { ...adminEnv, AI: { run: async (model, parameters) => {
    calls++;
    assert.equal(model, '@cf/google/gemma-4-26b-a4b-it');
    assert.equal(parameters.messages[0].role, 'system');
    assert.match(parameters.messages[1].content, /楽天テストイヤホン/);
    assert.ok(!JSON.stringify(parameters).includes(adminEnv.AI_ADMIN_TOKEN));
    return { response: '## 商品の概要\nこれは提供された商品情報に基づく紹介文です。購入の前に販売ページで詳細と最新情報を確認してください。\n\n## まとめ\nご自身の用途に合うか確認することが大切です。' };
  } } };
  const r = await worker.fetch(articleRequest(), e);
  assert.equal(r.status, 200);
  const payload = await r.json();
  assert.equal(calls, 1);
  assert.equal(payload.publishStatus, 'draft');
  assert.match(payload.markdown, /アフィリエイト広告が含まれます/);
  assert.match(payload.markdown, /https:\/\/item\.rakuten\.co\.jp\/shop\/001\//);
  assert.match(payload.markdown, /4,500円/);
  assert.ok(!JSON.stringify(payload).includes(adminEnv.AI_ADMIN_TOKEN));
});
test('AI handles different response schema and empty text explicitly', async () => {
  const good = { ...adminEnv, AI: { run: async () => ({ choices: [{ message: { content: '## 商品の概要\n商品情報をもとに記事を生成しました。購入前に価格、在庫、送料、仕様を確認しましょう。記事の記述を確認してください。' } }] }) } };
  assert.equal((await worker.fetch(articleRequest(), good)).status, 200);
  const empty = { ...adminEnv, AI: { run: async () => ({ response: '' }) } };
  const r = await worker.fetch(articleRequest(), empty);
  assert.equal((await r.json()).errorCode, 'AI_EMPTY_OUTPUT');
});
