import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledPostingSlot} from '../automation.js';
import {readFileSync} from 'node:fs';

// No live Threads, Cloudflare, Rakuten, or D1 calls in these tests.
test('20 daily slots are evenly spaced without catch-up windows',()=>{
  const xs=Array.from({length:48},(_,i)=>i).filter(i=>scheduledPostingSlot(i,20));
  assert.equal(xs.length,20);
  assert.deepEqual([...new Set(xs.slice(1).map((n,i)=>(n-xs[i])*30))].sort((a,b)=>a-b),[60,90]);
  // The missing slot at 00:00 must not trigger an extra post at 00:30.
  assert.equal(scheduledPostingSlot(0,20),true);
  assert.equal(scheduledPostingSlot(1,20),false);
  assert.equal(scheduledPostingSlot(2,20),true);
});
test('all valid targets reserve exactly their target count of 30 minute slots',()=>{
  for(let n=1;n<=48;n++)assert.equal(Array.from({length:48},(_,i)=>i).filter(i=>scheduledPostingSlot(i,n)).length,n);
});
test('invalid slots cannot trigger, and 24/48 per day remain properly spaced',()=>{
  assert.equal(scheduledPostingSlot(-1,20),false);
  assert.equal(scheduledPostingSlot(48,20),false);
  assert.equal(scheduledPostingSlot(0,0),false);
  assert.equal(scheduledPostingSlot(0,49),false);
  for(let i=0;i<48;i++){
    assert.equal(scheduledPostingSlot(i,24),i%2===0);
    assert.equal(scheduledPostingSlot(i,48),true);
  }
});
test('production admin UI is synchronized and no fake catalog is automatically shown',()=>{
  const html=readFileSync('public/index.html','utf8');
  const worker=readFileSync('worker.js','utf8');
  assert.ok(worker.includes(JSON.stringify(html)));
  assert.match(html,/失敗分を短時間に詰め込まず/);
  assert.ok(html.includes('showRecommendations()'));
  assert.ok(html.includes('商店おすすめを見る'));
  assert.ok(html.includes('テーマから探す'));
});
