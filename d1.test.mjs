import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

import { FakeD1 } from './fake-d1.mjs';

const env = () => ({ DB: new FakeD1(),AI_ADMIN_TOKEN:'key-unique-test-value',ASSETS:{fetch:()=>new Response('static-ok')} });
const query = (e,route='/api/drafts', method='GET', body=null, token='key-unique-test-value', origin='https://example.test')=>worker.fetch(new Request(`https://example.test${route}`,{
  method, headers: {'X-Admin-Token':token,...(body?{'Content-Type':'application/json'}:{}),Origin:origin},body:body?JSON.stringify(body):undefined
}),e);

const initial = { id:'123e4567-e89b-42d3-a456-426614174000',title:'イヤホン紹介',markdown:'※この記事にはアフィリエイト広告が含まれます。\n# イヤホンについて' };

test('health returns D1 binding presence without exposing UUID', async()=>{
  const r=await worker.fetch(new Request('https://example.test/api/health'),env());
  const data=await r.json(); assert.equal(data.dbConfigured,true);
  assert.equal(data.release,'v14'); assert.ok(!JSON.stringify(data).includes('81926891'));
});
test('unauthed drafts never hit D1, missing database yields 503', async()=>{
  const e=env(); const bad=await query(e,'/api/drafts','GET',null,'wrong');
  assert.equal(bad.status,401); assert.equal(e.DB.calls.length,0);
  const missing=await query({...e, DB:null});assert.equal(missing.status,503);
});
test('reject requests from another Origin without schema access',async()=>{
  const e=env();const r=await query(e,'/api/drafts','GET',null,'key-unique-test-value','https://evil.test');
  assert.equal(r.status,403); assert.equal(e.DB.calls.length,0);
});
test('create table, CRUD and preserve editor text across requests',async()=>{
  const e=env();
  const listBefore=await query(e);assert.equal(listBefore.status,200);
  assert.equal((await listBefore.json()).drafts.length,0);
  assert.equal(e.DB.schemaCreated,true);
  const save=await query(e,'/api/drafts','POST',initial);
  assert.equal(save.status,201);
  const saved=(await save.json()).draft;
  assert.equal(saved.title,initial.title);
  assert.equal(saved.markdown,initial.markdown);
  assert.equal(saved.status,'draft');
  assert.equal((await query(e,'/api/drafts','POST',initial)).status,409);
  const list=await query(e);
  assert.equal(list.status,200);
  const entries=(await list.json()).drafts;
  assert.equal(entries.length,1);
  assert.equal(entries[0].id,initial.id);
  assert.equal(entries[0].markdown,undefined,'do not send every full draft in list');
  const got=await query(e,`/api/drafts/${initial.id}`);
  assert.equal((await got.json()).draft.markdown,initial.markdown);
  const newer='## 編集した本文。これは十分な長さがあるテスト文章です。';
  const update=await query(e,`/api/drafts/${initial.id}`,'PUT',{title:'新しいタイトル',markdown:newer});
  assert.equal(update.status,200);
  assert.equal((await update.json()).draft.markdown,newer);
  assert.equal((await (await query(e,`/api/drafts/${initial.id}`)).json()).draft.title,'新しいタイトル');
  const deleted=await query(e,`/api/drafts/${initial.id}`,'DELETE');
  assert.equal(deleted.status,200);
  assert.equal((await query(e,`/api/drafts/${initial.id}`)).status,404);
  assert.equal((await query(e,`/api/drafts/${initial.id}`,'DELETE')).status,404);
});
test('validate IDs, content, methods, oversized requests',async()=>{
  const e=env();
  assert.equal((await query(e,'/api/drafts/bad-id')).status,400);
  assert.equal((await query(e,'/api/drafts','POST',{title:'t',markdown:'short'})).status,400);
  assert.equal((await query(e,'/api/drafts','POST',{title:'t',markdown:'x'.repeat(140000)})).status,413);
  assert.equal((await query(e,'/api/drafts','DELETE')).status,405);
});
