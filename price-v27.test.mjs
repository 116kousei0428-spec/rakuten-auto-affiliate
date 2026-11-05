import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const env={ASSETS:{fetch:async()=>new Response('asset')},RAKUTEN_APP_ID:'id',RAKUTEN_ACCESS_KEY:'key'};
test('v27: strings and comma-delimited Rakuten prices display as real positive yen',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({Items:[
  {Item:{itemName:'商品A',itemPrice:'2,980',itemUrl:'https://item.rakuten.co.jp/a'}},
  {Item:{itemName:'商品B',itemPrice:'1450',itemUrl:'https://item.rakuten.co.jp/b'}},
  {Item:{itemName:'商品C',itemPrice:'unavailable',itemUrl:'https://item.rakuten.co.jp/c'}},
  {Item:{itemName:'商品D',itemPrice:3300,itemUrl:'https://item.rakuten.co.jp/d'}}]});
 try{const r=await worker.fetch(new Request('https://example.test/api/search?keyword=商品'),env);assert.equal(r.status,200);const j=await r.json();assert.deepEqual(j.items.map(x=>x.price),[2980,1450,null,3300]);}finally{globalThis.fetch=old}
});
test('v27: blackboard art is included in both embedded visitor and manager pages',async()=>{
 const home=await (await worker.fetch(new Request('https://example.test/'),env)).text();
 assert.match(home,/blackboard-shopkeeper.webp/);
 assert.match(home,/daily-feature-copy/);
});
