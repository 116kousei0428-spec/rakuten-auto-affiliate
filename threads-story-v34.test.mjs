import test from 'node:test';
import assert from 'node:assert/strict';
import { composeThreadsStory } from '../threads-copy.js';
import worker from '../worker.js';
import { FakeD1 } from './fake-d1.mjs';
import { mockThreadAI } from './mock-thread-ai.mjs';
const admin='test-only-long-secret-token';
const id='88b2fe10-e9df-4ddb-9633-988888888888';
const articleUrl=`https://example.test/articles/${id}`;
const req=(env,path,method='GET',body)=>worker.fetch(new Request(`https://example.test${path}`,{
  method,headers:{'X-Admin-Token':admin,...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined
}),env);
const assertStory = (text, promotion=false) => {
  assert(text);
  assert([...text].length<=500);
  assert.equal(text.startsWith('【PR】\n\n'),promotion);
  assert(text.includes('余談商店'));
  assert(text.includes(articleUrl));
  const sections=text.replace(/^【PR】\n\n/,'').split(/\n\n/);
  assert.equal(sections.length,5); // greeting, trivia, connecting sentence, article link, goodbye
  assert.match(sections[0],/余談商店/);
  assert(sections[1].length>20);
  assert(sections[2].length>15);
  assert.match(sections[3],/^(?:記事はこちら：\n)?https:\/\//);
  assert.match(sections[4],/また/);
  assert(text.trim().endsWith(sections[4]));
};
test('shared story template always includes greeting, full trivia, connection, link, and farewell',()=>{
  const trivia='月の裏側にも日光は届きます。地球から常に見えにくいことと、太陽の光が当たらないことは別です。';
  for(let variant=0;variant<4;variant++){
    const text=composeThreadsStory({trivia,intro:'月モチーフの品を紹介。',articleUrl,variant});
    assertStory(text);
    assert(text.includes(trivia));
  }
});
test('sponsored disclosure is at the start and manual default has no PR',()=>{
  const input={trivia:'緑茶と紅茶は、どちらもチャノキの葉から作られます。',articleUrl};
  assertStory(composeThreadsStory({...input,isPromotion:true}),true);
  assertStory(composeThreadsStory(input),false);
});
test('long intro falls back without removing facts; oversized fact fails explicitly',()=>{
  const trivia='これは削ってはいけない、裏付けがある雑学です。'.repeat(7);
  const result=composeThreadsStory({trivia,intro:'長い説明'.repeat(100),articleUrl});
  assertStory(result);
  assert(result.includes(trivia));
  assert.equal(composeThreadsStory({trivia:'長文'.repeat(400),articleUrl}),null);
});
test('manual creation and regeneration share new four-step structure without damaging original article',async()=>{
  const env={DB:new FakeD1(),AI_ADMIN_TOKEN:admin,AI:mockThreadAI()};
  await req(env,'/api/drafts');
  const title='紅茶 飲み比べセット｜特徴と購入前のチェックポイント';
  const markdown='※この記事にはアフィリエイト広告が含まれます。\n\n## 今日の余談\n\n緑茶と紅茶の話です。';
  assert.equal((await req(env,'/api/drafts','POST',{id,title,markdown})).status,201);
  assert.equal((await req(env,`/api/drafts/${id}/publish`,'POST')).status,200);
  const created=await req(env,'/api/social/threads','POST',{articleId:id,isPromotion:true});
  assert.equal(created.status,201);
  const first=(await created.json()).post.body;
  assertStory(first,true);
  assert.match(first,/緑茶も紅茶も|お茶の味わい/);
  const edited=await req(env,`/api/social/threads/${id}/regenerate`,'POST',{isPromotion:false});
  assert.equal(edited.status,200);
  const second=(await edited.json()).post.body;
  assertStory(second,false);
  assert.notEqual(first,second);
  const published=await req(env,`/api/drafts/${id}`);
  assert.equal((await published.json()).draft.markdown,markdown);
});
test('unknown genre can still use fact-safe note and proper greeting/farewell',async()=>{
  const env={DB:new FakeD1(),AI_ADMIN_TOKEN:admin,AI:mockThreadAI()};
  await req(env,'/api/drafts');
  const title='ペット用知育玩具｜特徴と購入前のチェックポイント';
  assert.equal((await req(env,'/api/drafts','POST',{id,title,markdown:'商品情報は商品ページをご確認ください。'})).status,201);
  assert.equal((await req(env,`/api/drafts/${id}/publish`,'POST')).status,200);
  const created=await req(env,'/api/social/threads','POST',{articleId:id});
  assert.equal(created.status,201);
  const body=(await created.json()).post.body;
  assertStory(body);
  assert.doesNotMatch(body,/買い物の小ネタ/);
});
