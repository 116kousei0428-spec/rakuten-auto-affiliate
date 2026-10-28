import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
import { FakeD1 } from './fake-d1.mjs';
const id='123e4567-e89b-42d3-a456-426614174000';
const key='secret-publishing-admin-key';
const env=()=>({DB:new FakeD1(),AI_ADMIN_TOKEN:key,ASSETS:{fetch:()=>new Response('static')}});
const req=(e,path,method='GET',body,token=key,origin='https://example.test')=> worker.fetch(new Request(`https://example.test${path}`, {
  method,headers:{'X-Admin-Token':token,...(body?{'Content-Type':'application/json'}:{}),Origin:origin},body:body?JSON.stringify(body):undefined
}),e);
const draft={id,title:'イヤホン紹介<script>alert(1)</script>',markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n# イヤホン商品\n\n商品概要。\n\n[楽天はこちら](https://item.rakuten.co.jp/test/test)\n\n<script>alert(42)</script> [不正リンク](javascript:alert(1))'};

test('public listing is empty until explicitly published; private drafts require auth',async()=>{
 const e=env();await req(e,'/api/drafts');
 assert.equal((await req(e,'/api/drafts','POST',draft)).status,201);
 const pub=await req(e,'/articles');const html=await pub.text();
 assert.equal(pub.status,200);assert.match(html,/公開済みの記事はまだありません/);assert.doesNotMatch(html,/イヤホン紹介/);
 assert.equal((await req(e,`/articles/${id}`)).status,404);
 assert.equal((await req(e,'/api/drafts','GET',null,'wrong')).status,401);
});
test('publish, safe HTML, unpublish, republish with snapshot semantics, then delete',async()=>{
 const e=env();await req(e,'/api/drafts');await req(e,'/api/drafts','POST',draft);
 assert.equal((await req(e,`/api/drafts/${id}/publish`,'POST',null,'bad')).status,401);
 assert.equal((await req(e,`/api/drafts/${id}/publish`,'POST',null,key,'https://foreign.site')).status,403);
 const ok=await req(e,`/api/drafts/${id}/publish`,'POST');assert.equal(ok.status,200);
 assert.equal((await ok.json()).url,`/articles/${id}`);
 const page=await req(e,`/articles/${id}`);const text=await page.text();
 assert.equal(page.status,200);
 assert.match(text,/item\.rakuten\.co\.jp\/test\/test/);
 assert.match(text,/rel="nofollow sponsored noopener noreferrer"/);
 assert.doesNotMatch(text,/<script>/);
 assert.match(text,/&lt;script&gt;alert/);
 assert.match(text,/アフィリエイト広告/);
 assert.equal(page.headers.get('Content-Type'),'text/html; charset=utf-8');
 const listing=await req(e,'/articles');const listText=await listing.text();
 assert.match(listText,/イヤホン紹介/);assert.doesNotMatch(listText,/<script>/);
 assert.equal((await (await req(e,'/api/drafts')).json()).drafts[0].status,'published');
 const modified={title:'新しい下書きの見出し',markdown:'## 内容の編集はすぐには公開されません。'};
 assert.equal((await req(e,`/api/drafts/${id}`,'PUT',modified)).status,200);
 assert.doesNotMatch(await (await req(e,`/articles/${id}`)).text(),/内容の編集はすぐには/);
 assert.equal((await req(e,`/api/drafts/${id}/publish`,'POST')).status,200);
 assert.match(await (await req(e,`/articles/${id}`)).text(),/内容の編集はすぐには/);
 assert.equal((await req(e,`/api/drafts/${id}/publish`,'DELETE')).status,200);
 assert.equal((await req(e,`/articles/${id}`)).status,404);
 assert.equal((await req(e,`/api/drafts/${id}`)).status,200,'unpublish keeps draft');
 await req(e,`/api/drafts/${id}/publish`,'POST');
 assert.equal((await req(e,`/api/drafts/${id}`,'DELETE')).status,200);
 assert.equal((await req(e,`/articles/${id}`)).status,404,'deleting a draft also deletes publication');
});
test('method validation, missing IDs, and public listing no admin key',async()=>{
 const e=env();await req(e,'/api/drafts');
 assert.equal((await req(e,`/api/drafts/${id}/publish`,'GET')).status,405);
 assert.equal((await req(e,'/api/drafts/bad/publish','POST')).status,400);
 assert.equal((await req(e,`/api/drafts/${id}/publish`,'POST')).status,404);
 assert.equal((await req(e,'/articles','POST')).status,405);
 const visitor=await worker.fetch(new Request('https://example.test/articles'),e);
 assert.equal(visitor.status,200);
});
