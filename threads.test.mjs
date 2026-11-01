import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import {readFileSync} from 'node:fs';
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

test('draft layout: plain prose without headings or PR by default, article URL, D1 save/load',async()=>{
 const env=e();await saveAndPublish(env);
 const response=await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal(response.status,201);
 const data=await response.json();
 const body=data.post.body;
 assert(!body.startsWith('【PR】'));
 assert(!body.includes('【ちょっとした雑学】'));
 assert(!body.includes('【商品紹介】'));
 assert(!body.includes('──────'));
 assert(body.indexOf('ノイズキャンセリング') < body.indexOf('イヤホンの特徴'));
 assert(body.includes('イヤホンの特徴'));
 assert(!body.includes('ワイヤレスイヤホン入門'),'do not quote SEO title verbatim');
 assert(body.includes(`/articles/${id}`));
 assert(!body.includes('※PR・アフィリエイト広告を含みます'));
 assert([...body].length <= 500);
 const duplicate=await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal(duplicate.status,200);
 assert.equal((await duplicate.json()).alreadyExists,true);
 const updateText=body.replace('イヤホンの特徴', 'イヤホンの使い方');
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:updateText})).status,200);
 const list=await req(env,'/api/social/threads');
 assert.equal(list.status,200);
 assert.equal((await list.json()).posts[0].body,updateText);
 assert.notEqual(updateText,body);
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

test('UI v20 has a visible generation action on published article list, and inline syntax is valid',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/余談商店/);
 assert.match(html,/雑学→Threads投稿文/);
 assert.match(html,/Threadsへ投稿（承認後）/);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 const {Script}=await import('node:vm');assert.doesNotThrow(()=>new Script(scripts[0][1]));
});

test('sake post uses sake-specific verified trivia, concise intro and D1 regeneration',async()=>{
 const env=e();
 const title='日本酒 飲み比べセット 普通酒 特割 全国 地酒 一升瓶 5本組 6本組 第5弾 1800ml 酒 誕生日 父親 お父さん お祝い 内祝い 男性｜特徴と購入前のチェックポイント';
 const text='※PR：日本酒の飲み比べセットです。本数や容量などを確認してください。';
 assert.equal((await req(env,'/api/drafts','POST',{id,title,markdown:text})).status,201);
 assert.equal((await req(env,`/api/drafts/${id}/publish`,'POST')).status,200);
 const created=(await (await req(env,'/api/social/threads','POST',{articleId:id})).json()).post;
 assert.match(created.body,/(日本酒の「一升」|「四合瓶」)/);
 assert.doesNotMatch(created.body,/【商品紹介】/);
 assert(!created.body.includes('通販の商品説明'));
 assert(!created.body.includes('特徴と購入前のチェックポ'));
 assert(!created.body.includes('日本酒 飲み比べセット 普通酒 特割 全国 地酒'));
 assert([...created.body].length<=500);
 const edited=created.body.replace('日本酒の飲み比べセットを紹介。','個人的な紹介文。');
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:edited})).status,200);
 const regenerated=await req(env,`/api/social/threads/${id}/regenerate`,'POST');
 assert.equal(regenerated.status,200);
 const newText=(await regenerated.json()).post.body;
 assert.notEqual(newText,created.body);
 assert.match(newText,/(日本酒の「一升」|「四合瓶」)/);
 assert.notEqual(newText,edited);
 assert.equal((await (await req(env,`/api/social/threads/${id}`)).json()).post.body,newText);
 assert.equal((await req(env,`/api/social/threads/${id}/regenerate`,'GET')).status,405);
});

test('Threads connection diagnostic is admin-only, does not expose token, tests Meta profile',async()=>{
 const env=e();
 const path='/api/social/threads/connection';
 assert.equal((await req(env,path,'GET',null,'wrong')).status,401);
 assert.equal((await req(env,path,'GET',null,admin,'https://other.test')).status,403);
 const empty=await (await req(env,path)).json();
 assert.deepEqual([empty.configured,empty.connected],[false,false]);
 env.THREADS_ACCESS_TOKEN='secret-threads-example';
 const old=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async(url,options)=>{
   calls++;
   assert.match(url,/graph\.threads\.net\/v1\.0\/me\?fields=id,username/);
   assert.equal(options.headers.Authorization,`Bearer ${env.THREADS_ACCESS_TOKEN}`);
   return Response.json({id:'threads-user-123',username:'example_account'});
 };
 try {
   const res=await req(env,path);
   const payload=await res.json();
   assert.equal(calls,1);
   assert.equal(payload.connected,true);
   assert.equal(payload.username,'example_account');
   assert(!JSON.stringify(payload).includes(env.THREADS_ACCESS_TOKEN));
 }finally{globalThis.fetch=old;}
});

test('UI hides the old admin key and preserves Threads publishing tools after login',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="admin-token"|remember-admin-token|forget-admin-token/);
 assert.match(html,/id="regenerate-social"/);
 assert.match(html,/id="check-threads-connection"/);
 assert.match(html,/action="\/admin\/logout"/);
});

test('moon light selects moon-specific facts before generic lighting without PR by default',async()=>{
 const env=e();
 const title='3D 月面ライト USB充電式 ムーンライト クリスマス プレゼント｜特徴と購入前のチェックポイント';
 const md='この記事には色温度やルーメンなどの照明用語が含まれます。';
 assert.equal((await req(env,'/api/drafts','POST',{id,title,markdown:md})).status,201);
 assert.equal((await req(env,`/api/drafts/${id}/publish`,'POST')).status,200);
 const r=await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal(r.status,201);const body=(await r.json()).post.body;
 assert.doesNotMatch(body,/^【PR】/);
 assert.match(body,/月は地球|月の裏側/);
 assert.doesNotMatch(body,/色温度|ルーメン/);
 assert.match(body,/月面をモチーフ/);
 assert(!body.includes('※PR・アフィリエイト広告を含みます'));
 assert([...body].length<=500);
 const updated=await req(env,`/api/social/threads/${id}/regenerate`,'POST');
 assert.equal(updated.status,200);
 assert.notEqual((await updated.json()).post.body,body);
});

test('category uses product title only, never generic article body; no false trivia',async()=>{
 const env=e();
 const title='無関係な装飾品A｜特徴と購入前のチェックポイント';
 const md='これは一般的な記事。照明についても触れているが商品のカテゴリは違います。';
 assert.equal((await req(env,'/api/drafts','POST',{id,title,markdown:md})).status,201);
 assert.equal((await req(env,`/api/drafts/${id}/publish`,'POST')).status,200);
 const r=await req(env,'/api/social/threads','POST',{articleId:id});
 assert.equal(r.status,422);
 assert.equal((await r.json()).errorCode,'NO_VERIFIED_TRIVIA');
});


test('sponsored mode prefixes PR only when requested on create and on regenerate',async()=>{
 const env=e(); await saveAndPublish(env);
 const created=await req(env,'/api/social/threads','POST',{articleId:id,isPromotion:true});
 assert.equal(created.status,201);
 const first=(await created.json()).post.body;
 assert(first.startsWith('【PR】\n\n'));
 assert(!first.includes('【商品紹介】'));
 assert(!first.includes('【ちょっとした雑学】'));
 assert(!first.includes('※PR・アフィリエイト広告を含みます'));
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:first})).status,200);
 const changed=await req(env,`/api/social/threads/${id}/regenerate`,'POST',{isPromotion:false});
 assert.equal(changed.status,200);
 const normal=(await changed.json()).post.body;
 assert(!normal.startsWith('【PR】'));
 assert(!normal.includes('──────'));
 assert(normal.includes(`/articles/${id}`));
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:normal})).status,200);
 const changedBack=await req(env,`/api/social/threads/${id}/regenerate`,'POST',{isPromotion:true});
 assert.equal(changedBack.status,200);
 const sponsored=(await changedBack.json()).post.body;
 assert(sponsored.startsWith('【PR】\n\n'));
 assert.equal((await req(env,`/api/social/threads/${id}`,'PUT',{body:sponsored})).status,200);
});

test('default off and invalid sponsored settings are rejected',async()=>{
 const env=e(); await saveAndPublish(env);
 const invalid=await req(env,'/api/social/threads','POST',{articleId:id,isPromotion:'true'});
 assert.equal(invalid.status,400);
 const created=await req(env,'/api/social/threads','POST',{articleId:id});
 const data=(await created.json()).post.body;
 assert(!data.startsWith('【PR】'));
 assert.equal((await req(env,`/api/social/threads/${id}/regenerate`,'POST',{isPromotion:'true'})).status,400);
 assert.equal((await req(env,`/api/social/threads/${id}/regenerate`,'POST',{isPromotion:false})).status,200);
});

test('sponsored toggle is visible unchecked and wired to both generation requests',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="is-sponsored-post" type="checkbox" autocomplete="off"/);
 assert.match(html,/isPromotion:isSponsoredPost\.checked/g);
 assert.doesNotMatch(html,/id="is-sponsored-post"[^>]*checked/);
 assert.match(html,/案件スイッチは毎回OFFから始まります/);
 assert.match(html,/isSponsoredPost\.checked=false/);
});
