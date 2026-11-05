import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync,existsSync} from 'node:fs';
import worker from '../worker.js';
const visitor=readFileSync(new URL('../public/visitor.html',import.meta.url),'utf8');
const source=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const imgUrl=new URL('../public/hero-blackboard-scene.webp',import.meta.url);
const env={ASSETS:{fetch: async()=>new Response('ok')},RAKUTEN_APP_ID:'app',RAKUTEN_ACCESS_KEY:'access'};

test('hero: webp exists, in storefront, and is never cropped by CSS',async()=>{
 assert.ok(existsSync(imgUrl));
 assert.ok(statSync(imgUrl).size<400000);
 assert.match(visitor,/class="hero-scene" src="\/hero-blackboard-scene\.webp"/);
 assert.match(visitor,/header\.hero \.hero-scene\{[^}]*object-fit:contain!important/);
 assert.doesNotMatch(visitor,/hero-blackboard-scene\.png/);
 const root=await worker.fetch(new Request('https://site.test/'),env);
 const html=await root.text();
 assert.match(html,/class="hero-scene" src="\/hero-blackboard-scene\.webp"/);
 assert.match(html,/header\.hero \.hero-scene\{[^}]*object-fit:contain!important/);
});

test('version: health and public/private response metadata identify v29',async()=>{
 const health=await (await worker.fetch(new Request('https://site.test/api/health'),env)).json();
 assert.equal(health.release,'v29');
 const storefront=await worker.fetch(new Request('https://site.test/'),env);
 assert.equal(storefront.headers.get('X-Rakuten-UI-Version'),'v29');
 assert.match(source,/'X-Rakuten-UI-Version':'v29'/);
});

test('price cache: bypass old result namespaces while retaining rate-limit cooldown',()=>{
 assert.match(source,/\/api\/__v29_ranking_price/);
 assert.match(source,/\/api\/__v29_result_price\?/);
 assert.doesNotMatch(source,/\/api\/__v18_ranking`/);
 assert.doesNotMatch(source,/\/api\/__v9_result\?/);
 assert.match(source,/\/api\/__v18_ranking_cooldown/);
 assert.match(source,/\/api\/__v9_cooldown/);
});

test('price: both search and ranking normalize numeric strings from upstream',async()=>{
 const prev=globalThis.fetch;
 globalThis.fetch=async(url)=> {
  if(String(url).includes('Ranking')) return Response.json({Items:[{rank:1,itemName:'テスト',itemPrice:'2,980',itemUrl:'https://example.com/r'}]});
  return Response.json({Items:[{Item:{itemName:'テスト',itemPrice:'3,480',itemUrl:'https://example.com/p'}}]});
 };
 try {
  const [search,ranking]=await Promise.all([
   worker.fetch(new Request('https://site.test/api/search?keyword=test'),env),
   worker.fetch(new Request('https://site.test/api/picks/ranking'),env)
  ]);
  assert.equal((await search.json()).items[0].price,3480);
  assert.equal((await ranking.json()).items[0].price,2980);
 } finally{globalThis.fetch=prev;}
});
