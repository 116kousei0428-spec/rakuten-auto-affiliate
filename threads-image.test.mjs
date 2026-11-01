import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import {readFileSync} from 'node:fs';
import { FakeD1 } from './fake-d1.mjs';
const id='223e4567-e89b-42d3-a456-426614174001';
const key='test-admin-key';
const env=()=>({DB:new FakeD1(),AI_ADMIN_TOKEN:key,THREADS_ACCESS_TOKEN:'meta-example-test',ASSETS:{fetch:()=>new Response('asset')}});
const req=(e,path,method='GET',body)=>worker.fetch(new Request('https://example.test'+path,{method,headers:{Origin:'https://example.test','X-Admin-Token':key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),e);
const setup=async(e,media={})=>{
  const doc=await req(e,'/api/drafts','POST',{id,title:'月面ライト',markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n月面ライトの商品解説です。',...media});
  assert.equal(doc.status,201);
  assert.equal((await req(e,`/api/drafts/${id}/publish`,'POST')).status,200);
  const created=await req(e,'/api/social/threads','POST',{articleId:id});
  assert.equal(created.status,201);
  return (await created.json()).post;
};
test('item image metadata is stored and shown as preview, not permission to republish',async()=>{
 const e=env(); const preview='https://thumbnail.image.rakuten.co.jp/test/moon.jpg';
 const post=await setup(e,{imageUrl:preview,imageAlt:'月面ライト',imageSource:'rakuten_api_preview'});
 assert.equal(post.image_url,preview);
 assert.equal(post.image_source,'rakuten_api_preview');
 const d=await (await req(e,`/api/drafts/${id}`)).json();
 assert.equal(d.draft.imageUrl,preview);
 const list=await (await req(e,'/api/social/threads')).json();
 assert.equal(list.posts[0].image_url,preview);
 assert.equal(e.DB.media.size,1);
});
test('image attachment requires affirmative rights confirmation and an HTTPS URL before lock',async()=>{
 const e=env(); await setup(e);
 const url=`/api/social/threads/${id}/publish`;
 assert.equal((await req(e,url,'POST',{attachImage:true,imageUrl:'https://cdn.example.test/test.jpg'})).status,400);
 assert.equal((await req(e,url,'POST',{attachImage:true,imageUsageConfirmed:true,imageUrl:'http://example.test/test.jpg'})).status,400);
 assert.equal((await req(e,url,'POST',{attachImage:true,imageUsageConfirmed:true,imageUrl:'https://localhost/something.jpg'})).status,400);
 assert.equal((await req(e,url,'POST',{attachImage:'yes',imageUrl:'https://example.test/test.jpg'})).status,400);
 assert.equal(e.DB.threads.get(id).status,'draft');
});
test('with rights confirmed, posts IMAGE container with article text, then publishes once',async()=>{
 const e=env();await setup(e);
 const old=globalThis.fetch;const calls=[];
 globalThis.fetch=async(u,options)=>{calls.push({u,options});return Response.json({id:calls.length===1?'container-image':'published-image'});};
 try {
  const r=await req(e,`/api/social/threads/${id}/publish`,'POST',{
    attachImage:true,imageUsageConfirmed:true,imageUrl:'https://media.example.test/approved-image.jpg',imageAlt:'商品の写真'
  });
  assert.equal(r.status,200);
  assert.equal((await r.json()).mediaType,'IMAGE');
  const body=new URLSearchParams(calls[0].options.body);
  assert.equal(body.get('media_type'),'IMAGE');
  assert.equal(body.get('image_url'),'https://media.example.test/approved-image.jpg');
  assert.equal(body.get('alt_text'),'商品の写真');
  assert.match(body.get('text'),/\/articles\//);
  assert.equal(calls.length,2);
  assert.equal((await req(e,`/api/social/threads/${id}/publish`,'POST',{attachImage:true,imageUsageConfirmed:true,imageUrl:'https://media.example.test/approved-image.jpg'})).status,409);
  assert.equal(calls.length,2);
 }finally{globalThis.fetch=old;}
});
test('no image selected continues the legacy TEXT path',async()=>{
 const e=env();await setup(e);const old=globalThis.fetch;const calls=[];
 globalThis.fetch=async(u,options)=>{calls.push({u,options});return Response.json({id:calls.length===1?'txt-container':'txt-post'});};
 try {
  const r=await req(e,`/api/social/threads/${id}/publish`,'POST',{attachImage:false});
  assert.equal(r.status,200);assert.equal((await r.json()).mediaType,'TEXT');
  assert.equal(new URLSearchParams(calls[0].options.body).get('media_type'),'TEXT');
 }finally{globalThis.fetch=old;}
});
test('v20 UI displays image-preview and rights checks, still defaults to text',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/余談商店/);assert.match(html,/id="social-image-url"/);assert.match(html,/id="social-image-rights"/);assert.match(html,/id="social-attach-image"/);
 assert.match(html,/楽天APIの写真は商品確認用プレビュー/);
 assert.match(html,/socialImageRights\.checked=false/);
 assert.match(html,/写真付きでThreadsへ投稿/);
});
