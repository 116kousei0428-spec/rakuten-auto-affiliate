import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import worker from '../worker.js';

const pages=['public/visitor.html','public/index.html'];
const SOURCE_URL='https://corp.rakuten.co.jp/news/press/2026/1028_01.html';

function getShelfData(html,now){
  const catalog=html.match(/const CURATED_PICK_TOPICS = \[[\s\S]*?\n\];/)?.[0];
  const logic=html.match(/const PICK_ROTATION_MS=3\*60\*60\*1000;[\s\S]*?return list\.slice\(start,start\+PICKS_PER_SHELF\)\.map\(v=>v\.topic\);\s*\};/)?.[0];
  assert.ok(catalog,'missing catalog');
  assert.ok(logic,'missing shelf rotation');
  const out=runInNewContext(`${catalog}\nlet activePickTopics=CURATED_PICK_TOPICS;\n${logic}\nconst shelves=[];for(let i=0;i<PICK_SHELF_COUNT;i++){pickPage=i;shelves.push(rotatingPickTopics().map(t=>({keyword:t.keyword,basis:t.basis})));}pickPage=PICK_SHELF_COUNT;const wrapped=rotatingPickTopics().map(t=>t.keyword);JSON.stringify({count:PICK_SHELF_COUNT,total:CURATED_PICK_TOPICS.length,shelves,wrapped});`,{Date:{now:()=>now}});
  return JSON.parse(out);
}

test('40 distinct themes are distributed into ten 4-topic shelves with no repeats until wrap',()=>{
  const expected=[];
  for(const file of pages){
    const html=readFileSync(file,'utf8');
    const data=getShelfData(html,Date.UTC(2026,10,6,3));
    assert.equal(data.total,40,`${file}: exactly forty themes`);
    assert.equal(data.count,10,`${file}: exactly ten shelves`);
    assert.deepEqual(data.shelves.map(s=>s.length),Array(10).fill(4));
    const keywords=data.shelves.flat().map(v=>v.keyword);
    assert.equal(new Set(keywords).size,40,`${file}: no repeated topics within one traversal`);
    assert.deepEqual(data.wrapped,data.shelves[0].map(v=>v.keyword),`${file}: wrap back to first shelf`);
    assert.ok(data.shelves.flat().some(t=>t.basis==='楽天冬予測'));
    assert.ok(data.shelves.flat().some(t=>t.basis==='編集注目'));
    assert.doesNotMatch(html,/name: '(腕時計|はちみつ)'/);
    assert.ok(html.includes(SOURCE_URL),`${file}: primary source link`);
    assert.match(html,/pickPage=\(pickPage\+1\)%PICK_SHELF_COUNT/);
    assert.match(html,/const shelfTrail=\[\];/);
    assert.match(html,/shelfTrail\.pop\(\)/);
    assert.match(html,/3時間ごとに並び順が変わります/);
    expected.push(JSON.stringify(data.shelves));
  }
  assert.equal(expected[0],expected[1],'visitor and admin have matching shelves');
});

test('new three-hour slot changes the order but not the set of themes',()=>{
  for(const file of pages){
    const html=readFileSync(file,'utf8');
    const at=Date.UTC(2026,10,6,3);
    const before=getShelfData(html,at);
    const same=getShelfData(html,at+60*60*1000);
    const after=getShelfData(html,at+3*60*60*1000);
    assert.deepEqual(before.shelves,same.shelves,'stable within time slot');
    assert.notDeepEqual(before.shelves,after.shelves,'order changes after three hours');
    const names=a=>a.shelves.flat().map(v=>v.keyword).sort();
    assert.deepEqual(names(before),names(after),'no themes lost after rotation');
  }
});

test('homepage still serves public shelves and old endpoints behave independently',async()=>{
  const result=await worker.fetch(new Request('https://site.test/'),{ASSETS:{fetch:async()=>new Response('ok')}});
  const html=await result.text();
  assert.equal(result.status,200);
  assert.match(html,/PICK_SHELF_COUNT/);
  assert.match(html,/商店おすすめを見る/);
  assert.match(html,/別の棚を見る/);
  assert.doesNotMatch(html,/name: '(腕時計|はちみつ)'/);
  assert.equal(result.headers.get('X-Rakuten-UI-Version'),'v34');
  const health=await worker.fetch(new Request('https://site.test/api/health'),{});
  assert.equal((await health.json()).release,'v34');
});
