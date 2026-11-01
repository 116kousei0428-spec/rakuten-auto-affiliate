import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = { ASSETS: { fetch: async () => new Response('ok') }, RAKUTEN_APP_ID: 'app-private', RAKUTEN_ACCESS_KEY: 'key-private', RAKUTEN_AFFILIATE_ID: 'affiliate-private' };
const req = (method = 'GET', environment = env) => worker.fetch(new Request('https://site.test/api/picks/ranking', { method }), environment);
const withFetch = async (mock, cb) => {
  const orig = globalThis.fetch;
  globalThis.fetch = mock;
  try { return await cb(); } finally { globalThis.fetch = orig; }
};

test('ranking uses official ranking API and real ranks, affiliate URLs; never exposes secrets', async () => {
  await withFetch(async (uri, options) => {
    const u = new URL(uri);
    assert.equal(u.origin, 'https://openapi.rakuten.co.jp');
    assert.equal(u.pathname, '/ichibaranking/api/IchibaItem/Ranking/20220601');
    assert.equal(u.searchParams.get('applicationId'), env.RAKUTEN_APP_ID);
    assert.equal(u.searchParams.get('affiliateId'), env.RAKUTEN_AFFILIATE_ID);
    assert.equal(u.searchParams.get('formatVersion'), '2');
    assert.equal(u.searchParams.has('accessKey'), false);
    assert.equal(options.headers.accessKey, env.RAKUTEN_ACCESS_KEY);
    assert.equal(options.headers.Origin, 'https://site.test');
    assert.equal(options.headers.Referer, 'https://site.test/');
    return Response.json({lastBuildDate:'2026-11-01T11:00:00+09:00', Items:[
      {rank:1,itemName:'ムーンライト',itemPrice:2980, shopName:'月の店',affiliateUrl:'https://example.com/affiliate',mediumImageUrls:[{imageUrl:'https://example.com/img.jpg'}]},
      {rank:3,itemName:'携帯タンブラー',itemPrice:1600,itemUrl:'https://example.com/item',mediumImageUrls:[{imageUrl:'https://example.com/i2.jpg'}]},
      {itemName:'ランク無し',itemUrl:'https://example.com/unranked',itemPrice:100},
      {rank:4,itemName:'リンクなし',itemPrice:1000}
    ]});
  }, async () => {
    const response = await req();
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.source, 'Rakuten Ichiba Item Ranking API');
    assert.equal(data.updatedAt, '2026-11-01T11:00:00+09:00');
    assert.deepEqual(data.items.map(item=>item.rank),[1,3]);
    assert.equal(data.items[0].url,'https://example.com/affiliate');
    assert.equal(data.items[0].shop,'月の店');
    assert.ok(!JSON.stringify(data).includes('key-private'));
    assert.ok(!JSON.stringify(data).includes('app-private'));
  });
});
test('ranking supports lower-case unwrapped items and filters unknown ranks',async()=>{
  await withFetch(async()=>Response.json({items:[{rank:5,itemName:'商品',itemPrice:800,itemUrl:'https://example.com/ok'},{rank:'not a rank',itemName:'NG',itemUrl:'https://example.com/ng'}]}),async()=>{
    const data=await (await req()).json();
    assert.equal(data.count,1);
    assert.equal(data.items[0].rank,5);
  });
});
test('ranking requires credentials and GET, and handles 403, 429 gracefully',async()=>{
  assert.equal((await req('POST')).status,405);
  assert.equal((await req('GET',{ ASSETS: env.ASSETS })).status,503);
  for(const [upstream,status] of [[403,502],[429,503]]){
    await withFetch(async()=>Response.json({errors:{errorMessage:'secret information'}},{status:upstream}),async()=>{
      const response=await req();const data=await response.json();
      assert.equal(response.status,status);
      assert.equal(data.upstreamStatus,upstream);
      assert.ok(!JSON.stringify(data).includes('secret information'));
    });
  }
});
test('UI has two discovery modes with action buttons and valid browser script',async()=>{
  const r=await worker.fetch(new Request('https://site.test/'),env);
  const html=await r.text();
  assert.match(html,/id="load-ranking"/);
  assert.match(html,/id="show-editor-picks"/);
  assert.match(html,/楽天ランキング/);
  assert.match(html,/CURATED_PICK_TOPICS/);
  const matches=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length,1);
  const {Script}=await import('node:vm');
  assert.doesNotThrow(()=>new Script(matches[0][1]));
});
