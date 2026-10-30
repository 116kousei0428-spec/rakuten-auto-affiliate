import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { FakeD1 } from './fake-d1.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const admin='threads-test-very-long-secret';
const e=(extra={})=>({DB:new FakeD1(),AI_ADMIN_TOKEN:admin,ASSETS:{fetch:()=>new Response('asset')},...extra});
const req=(env,path,method='GET',body,token=admin,origin='https://example.test')=>worker.fetch(new Request(`https://example.test${path}`,{method,headers:{'X-Admin-Token':token,Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
const saveAndPublish=async env=>{
 await req(env,'/api/drafts');
 assert.equal((await req(env,'/api/drafts','POST',{id,title:'ワイヤレスイヤホン入門',markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n商品の選び方を説明する記事です。'})).status,201);
 assert.equal((await req(env,`/api/drafts/${id}/publish`,'POST')).status,200);
};

test('posts cannot be generated without admin or a published article', async()=>{
 const env=e();
 assert.equal((await req(env,'/api/social/threads','POST',{articleId:id},'wrong')).status,401);
 assert.equal((await req(env,'/api/social/threads','POST',{articleId:id},admin,'https://evil.test')).status,403);
 assert.equal((await req(env,'/api/social/threads','POST',{articleId:id})).status,404);
 await saveAndPublish(env);
 assert.equal((await req(env,'/api/social/threads','POST',{articleId:'bad'})).status,400);
});

test('draft layout: verified trivia first, product intro below, PR and article URL, D1 save/load',async()=>{
 const env=e();await saveAndPublish(env);
 const response=await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal(response.status,201);
 const data=await response.json();
 const body=data.post.body;
 assert(body.startsWith('【ちょっとした雑学】'));
 assert(body.indexOf('ノイズキャンセリング') < body.indexOf('【商品紹介】'));
 assert(body.includes('ワイヤレスイヤホン入門'));
 assert(body.includes(`/articles/${id}`));
 assert(body.includes('※PR・アフィリエイト広告を含みます'));
 assert([...body].length <= 500);
 const duplicate=await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).alreadyExists,true);
 const updateText=body.replace('紹介。特徴や','取り上げました。特徴や');
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:updateText})).status,200);
 const list=await req(env,'/api/social/threads');
 assert.equal(list.status,200);
 assert.equal((await list.json()).posts[0].body,updateText);
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:'30文字に満たない'})).status,400);
});

test('no publish without Threads token, no double posting; two Meta calls',async()=>{
 const env=e();await saveAndPublish(env);await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal((await req(env,`/api/social/threads/${id}/publish`,'POST')).status,503);
 env.THREADS_ACCESS_TOKEN='meta-test-token';
 const old=globalThis.fetch;
 const calls=[];
 globalThis.fetch=async (url,options)=>{
   calls.push({url,options});
   assert.equal(options.headers.Authorization,'Bearer meta-test-token');
   return Response.json({id:calls.length===1?'container-xyz':'thread-post-xyz'});
 };
 try {
  const response=await req(env,`/api/social/threads/${id}/publish`,'POST');
  assert.equal(response.status,200);
  assert.equal((await response.json()).postId,'thread-post-xyz');
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/\/me\/threads$/);
  assert.match(calls[1].url,/\/me\/threads_publish$/);
  assert.equal(new URLSearchParams(calls[0].options.body).get('media_type'),'TEXT');
  assert.equal(new URLSearchParams(calls[1].options.body).get('creation_id'),'container-xyz');
  assert.equal((await req(env,`/api/social/threads/${id}/publish`,'POST')).status,409);
  assert.equal(calls.length,2);
  assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:'変えたいです'})).status,400);
  const list=await req(env,'/api/social/threads');
  assert.equal((await list.json()).posts[0].status,'published');
 }finally {globalThis.fetch=old;}
});

test('unknown Threads outcome is not retried automatically',async()=>{
 const env=e({THREADS_ACCESS_TOKEN:'meta-test-token'});await saveAndPublish(env);await req(env,'/api/social/threads','POST',{articleId:id});
 const old=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;throw new Error('network uncertainty');};
 try {
  assert.equal((await req(env,`/api/social/threads/${id}/publish`,'POST')).status,502);
  assert.equal((await req(env,`/api/social/threads/${id}/publish`,'POST')).status,409);
  assert.equal(count,1);
 }finally {globalThis.fetch=old;}
});

test('UI v15 has a visible generation action on published article list, and inline syntax is valid',async()=>{
 const env=e(); const res=await req(env,'/'); const html=await res.text();
 assert.match(html,/UI v15/);
 assert.match(html,/雑学→Threads投稿文/);
 assert.match(html,/Threadsへ投稿（承認後）/);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const {Script}=await import('node:vm');assert.doesNotThrow(()=>new Script(scripts[0][1]));
});
