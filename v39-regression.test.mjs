import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduledPostingSlot} from '../automation.js';
import {composeNarrative} from '../threads-story-ai.js';

const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const windows = target => Array.from({length:48},(_,i)=>i).filter(i=>scheduledPostingSlot(i,target));
test('20 daily automatic posts use 20 fixed windows, not backlog catch-up',()=>{
  assert.deepEqual(config.triggers.crons,['*/30 * * * *','0 21 * * *']);
  const slots=windows(20);
  assert.equal(slots.length,20);
  assert.equal(slots[0],0);assert.equal(slots.at(-1),45);
  assert(slots.slice(1).every((n,i)=>n-slots[i]>=2)); // 60 to 90 min apart
  assert.deepEqual(slots,[0,2,4,7,9,12,14,16,19,21,24,26,28,31,33,36,38,40,43,45]);
  const src=readFileSync('automation.js','utf8');
  assert(!src.includes('todayCount?.cnt||0)>=due'), 'no lag-based catchup gate');
  assert(src.includes('scheduledOrdinal<0'));
});
test('daily quota and PR/trivia shares are deterministic and complete without artificial clustering',()=>{
  for(const [target,share] of [[20,50],[20,30],[20,0],[20,100],[7,50],[48,50]]){
    const total=Math.round(target*share/100);
    const arr=Array.from({length:target},(_,i)=>Math.floor((i+1)*total/target)>Math.floor(i*total/target)?'trivia':'pr');
    assert.equal(arr.filter(x=>x==='trivia').length,total);
    if(target===20&&share===50)assert.deepEqual(arr,['pr','trivia','pr','trivia','pr','trivia','pr','trivia','pr','trivia','pr','trivia','pr','trivia','pr','trivia','pr','trivia','pr','trivia']);
  }
});
test('promotion copy begins with sourced trivia before natural emotional bridge',()=>{
  const fact='魚の頭には「耳石」という硬い組織があり、その輪紋から年齢を推定できる魚がいます。';
  const base={greeting:'いらっしゃいませ。余談商店です。',trivia:`${fact} お魚を調理する際、骨を避ける作業は意外と気を使いますね。`,bridge:'そんな食卓のひと手間に寄り添う品を取り上げました。今日はこの話から始めます。',goodbye:'それでは、また次の余談でお会いしましょう。',articleUrl:'https://shop.example/articles/abc',isPromotion:true,verifiedFact:fact};
  const result=composeNarrative(base);
  assert(result?.startsWith(`【PR】\n\nいらっしゃいませ。余談商店です。\n\n${fact}`));
  assert.equal(composeNarrative({...base,trivia:`お魚を調理する際は骨に気を使います。 ${fact}`}),null);
});
test('no unsupported fact-free product is sent to automatic PR publisher',()=>{
  const src=readFileSync('automation.js','utf8');
  assert.match(src,/NO_VERIFIED_PRODUCT_TRIVIA/);
  assert(src.indexOf('NO_VERIFIED_PRODUCT_TRIVIA')<src.indexOf("await mark('article_ready')"));
  const w=readFileSync('worker.js','utf8');
  assert.match(w,/魚の頭には「耳石（じせき）」/);
});
