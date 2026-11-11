import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker.js';
test('ranking returns real ranks 1 through 40, ordered',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({Items:Array.from({length:50},(_,i)=>({rank:50-i,itemName:`品物${50-i}`,itemPrice:1000,itemUrl:`https://item.rakuten.co.jp/test/${50-i}/`}))});
 try{
  const response=await worker.fetch(new Request('https://site.test/api/picks/ranking'),{RAKUTEN_APP_ID:'x',RAKUTEN_ACCESS_KEY:'y'});
  const data=await response.json();
  assert.equal(data.items.length,40);
  assert.deepEqual(data.items.map(x=>x.rank),Array.from({length:40},(_,i)=>i+1));
 } finally{globalThis.fetch=original;}
});
test('both storefronts support 12-item shelves and verified-ranking fallback',()=>{
 for(const path of ['public/index.html','public/visitor.html']){
  const html=readFileSync(path,'utf8');
  assert.match(html,/const PICKS_PER_SHELF=12;/);
  assert.match(html,/loadRecommendedProducts/);
  assert.match(html,/SNSでの流行は未検証/);
  assert.match(html,/#pick-results\.shelf-grid\{grid-template-columns:repeat\(4/);
 }
});
