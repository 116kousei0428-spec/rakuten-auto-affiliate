import test from 'node:test';
import assert from 'node:assert/strict';
import {readableProductName,generateNarrative,composeNarrative} from '../threads-story-ai.js';
import {mockThreadAI} from './mock-thread-ai.mjs';
import worker from '../worker.js';
import {FakeD1} from './fake-d1.mjs';
const articleId='d1a2f3a4-5e01-4dd6-bb3d-a81a33cad123';
const articleUrl=`https://example.test/articles/${articleId}`;
const admin='test-v35-threads-approval';
const request=(env,path,method='GET',body)=>worker.fetch(new Request('https://example.test'+path,{method,
 headers:{'X-Admin-Token':admin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
async function setup(env,title){
 const r=await request(env,'/api/drafts','POST',{id:articleId,title,markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n品物を紹介する記事です。'});
 assert.equal(r.status,201);
 assert.equal((await request(env,`/api/drafts/${articleId}/publish`,'POST')).status,200);
}
test('sales spam is not passed as the subject for generated Threads copy',()=>{
 assert.equal(readableProductName('【神トククーポン対象】カラコン ワンデー【もれなく1箱無料】1箱｜余談商店の読みもの'),'カラコン ワンデー');
 assert.equal(readableProductName('日本酒 飲み比べセット 普通酒 特割 全国 地酒 一升瓶｜余談商店の読みもの'),'日本酒 飲み比べセット');
 assert.equal(readableProductName('ワイヤレスイヤホン入門'),'ワイヤレスイヤホン');
});
test('a per-product AI narrative uses grounded color-contact trivia, not generic size tips',async()=>{
 const env={AI:mockThreadAI()};
 const fact='カラコンの「DIA」はレンズ全体の直径、「着色直径」は色のついた部分の直径。似ているようで、意味の違う数字です。';
 const post=await generateNarrative({env,title:'【期間限定】カラコン ワンデー【もれなく1箱無料】1箱',markdown:'カラコンのお話です。',articleUrl,isPromotion:true,verifiedFact:fact});
 assert(post.startsWith('【PR】\n\n'));
 assert(post.includes(fact));
 assert(post.includes('カラコン ワンデー'));
 assert(!post.includes('もれなく'));
 assert(!post.includes('買い物の小ネタ'));
 assert(!post.includes('設置場所'));
 assert(post.endsWith('それでは、また次の余談でお会いしましょう。'));
 assert([...post].length<=500);
});
test('bad generic AI output is rejected twice instead of being posted as a fake success',async()=>{
 let calls=0;
 const env={AI:{run:async()=>{calls++;return {response:JSON.stringify({greeting:'いらっしゃいませ。余談商店です。',trivia:'「サイズ」は必ずしも外側の寸法とは限らず、設置場所や持ち運びを考えましょう。'.repeat(2),bridge:'こちらの品を紹介します。商品ページを確認してみてください。',goodbye:'それでは、また次回お会いしましょう。'})};}}};
 await assert.rejects(()=>generateNarrative({env,title:'カラコン ワンデー',articleUrl}),err=>err.code==='THREADS_TEXT_QUALITY_REJECTED');
 assert.equal(calls,2);
});
test('AI outage cannot overwrite an existing saved Threads draft on regeneration',async()=>{
 const env={DB:new FakeD1(),AI_ADMIN_TOKEN:admin,AI:mockThreadAI()};
 await setup(env,'カラコン ワンデー｜余談商店の読みもの');
 const created=await request(env,'/api/social/threads','POST',{articleId});
 assert.equal(created.status,201);
 const original=(await created.json()).post.body;
 env.AI={run:async()=>{throw new Error('down')}};
 const r=await request(env,`/api/social/threads/${articleId}/regenerate`,'POST',{isPromotion:true});
 assert.equal(r.status,502);
 assert.equal((await r.json()).errorCode,'THREADS_AI_FAILED');
 const previous=await request(env,`/api/social/threads/${articleId}`);
 assert.equal((await previous.json()).post.body,original);
});
test('missing AI never saves a filler draft, while existing content and other APIs are unchanged',async()=>{
 const env={DB:new FakeD1(),AI_ADMIN_TOKEN:admin};
 await setup(env,'ペット用知育玩具｜余談商店の読みもの');
 const r=await request(env,'/api/social/threads','POST',{articleId});
 assert.equal(r.status,503);
 assert.equal((await r.json()).errorCode,'THREADS_AI_MISSING');
 assert.equal(env.DB.threads.size,0);
 const published=await request(env,`/articles/${articleId}`);
 assert.equal(published.status,200);
});
test('compose rejects fabricated advertising links and more than 500 codepoints',()=>{
 const base={greeting:'いらっしゃいませ。余談商店です。',trivia:'毎日使うものに、思いがけない発見があるものです。少し眺めるだけで、見落としていた形や色に気がつくかもしれません。',bridge:'そんな一品を紹介しています。今日の記事で、もう少し寄り道してみませんか。',goodbye:'それでは、また次の余談でお会いしましょう。',articleUrl};
 assert(composeNarrative(base));
 assert.equal(composeNarrative({...base,bridge:'ここに来てね https://fake.example.com'}),null);
 assert.equal(composeNarrative({...base,trivia:'長文'.repeat(200)}),null);
});

test('scheduled publishing uses product-specific AI prose and keeps the PR prefix',async()=>{
 const {runAutomation}=await import('../automation.js');
 const queries=[],inserts=[];
 const db={prepare(sql){let params=[];return {bind(...values){params=values;return this;},
   async run(){inserts.push({sql,params});return {meta:{changes:1}};},
   async first(){if(sql.includes('FROM yodan_auto_settings'))return {enabled:1,daily_target:20};if(sql.includes('COUNT(*)'))return {cnt:0};return null;},
   async all(){return {results:[]};}};}};
 const env={DB:db,AI:mockThreadAI(),AI_ADMIN_TOKEN:'local-test-key',THREADS_ACCESS_TOKEN:'local-test-threads',AUTO_PUBLIC_ORIGIN:'https://example.test'};
 const execute=async req=>{
   const path=new URL(req.url).pathname;queries.push(path);
   if(path==='/api/picks/ranking')return Response.json({items:[{name:'【限定クーポン】カラコン ワンデー【もれなく無料】1箱',code:'example:color',price:1980,url:'https://item.rakuten.co.jp/sample/product/',caption:'カラコンです'}]});
   if(path==='/api/search')return Response.json({items:[]});
   if(path==='/api/articles/generate')return Response.json({title:'カラコン ワンデー｜余談商店の読みもの',markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n## 今日の余談\n\nレンズの形についての雑学。',verifiedStoryFact:'カラコンの「DIA」はレンズ全体の直径、「着色直径」は色のついた部分の直径。似ているようで、意味の違う数字です。'});
   if(/\/api\/social\/threads\/[0-9a-f-]+\/publish$/.test(path))return Response.json({status:'published',postId:'local-test-post'});
   throw Error('unexpected request '+path);
 };
 const result=await runAutomation(env,execute,{manual:true});
 assert.equal(result.ok,true,JSON.stringify(result));
 const stored=inserts.find(v=>v.sql.startsWith('INSERT INTO threads_posts'));
 assert(stored);
 assert(stored.params[1].startsWith('【PR】\n\n'));
 assert(stored.params[1].includes('DIA'));
 assert(!stored.params[1].includes('買い物の小ネタ'));
 assert(queries.some(p=>p.endsWith('/publish')));
});

test('scheduled AI failure never calls the Threads publish endpoint',async()=>{
 const {runAutomation}=await import('../automation.js');
 const visited=[];
 const db={prepare(sql){return {bind(){return this;},
    async run(){return {meta:{changes:1}};},
    async first(){if(sql.includes('FROM yodan_auto_settings'))return {enabled:1,daily_target:20};if(sql.includes('COUNT(*)'))return {cnt:0};return null;},
    async all(){return {results:[]};}};}};
 const env={DB:db,AI:{run:async()=>{throw Error('temporary outage')}},AI_ADMIN_TOKEN:'test-key',THREADS_ACCESS_TOKEN:'test-thread-key',AUTO_PUBLIC_ORIGIN:'https://example.test'};
 const execute=async request=>{
   const path=new URL(request.url).pathname;visited.push(path);
   if(path==='/api/picks/ranking')return Response.json({items:[{name:'カラコン ワンデー',code:'test:1',price:2700,url:'https://item.rakuten.co.jp/sample/item/'}]});
   if(path==='/api/search')return Response.json({items:[]});
   if(path==='/api/articles/generate')return Response.json({title:'カラコン ワンデー',markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n## 今日の余談\n\nカラコンの話。',verifiedStoryFact:'カラコンの「DIA」はレンズ全体の直径、「着色直径」は色のついた部分の直径。似ているようで、意味の違う数字です。'});
   throw Error('unexpected external request '+path);
 };
 const result=await runAutomation(env,execute,{manual:true});
 assert.equal(result.ok,false);
 assert.equal(result.status,'failed');
 assert(!visited.some(path=>path.endsWith('/publish')));
});
