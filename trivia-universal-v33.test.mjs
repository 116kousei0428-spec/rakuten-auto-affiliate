import test from 'node:test';
import assert from 'node:assert/strict';
import { shoppingTrivia, productNameFromTitle } from '../trivia-fallback.js';
import worker from '../worker.js';
import { FakeD1 } from './fake-d1.mjs';
import { mockThreadAI } from './mock-thread-ai.mjs';
const admin='test-only-long-secret-token';
const uuid='c0b7fb08-d07e-4fdc-bc11-333333333333';
const req=(env,path,method='GET',body)=>worker.fetch(new Request(`https://example.test${path}`,{method,headers:{'X-Admin-Token':admin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),env);
const categories=[
  '防災用折りたたみヘルメット','ペット用知育おもちゃ','タブレット対応ケース','オーガニック野菜の詰め合わせセット',
  '折り畳み収納ボックス 30cm','宇宙柄の装飾品','工業用の交換パーツ','ボードゲーム','新感覚の謎グッズ','和菓子',
  '自転車用の鍵','ホームトレーニング器具','雑貨A','変わったタイトル'
];
test('unreviewed genres always have nonempty safe notes under 400 chars',()=>{
  for(const title of categories){
    const memo=shoppingTrivia(title,0);
    assert(memo.includes(title.slice(0,6)),title);
    assert.match(memo,/買い物の小ネタ/);
    assert([...memo].length<400);
    assert(!memo.includes('由来は')); // no unsupported history
  }
});
test('variant selection is stable, and repeated generations can change the note',()=>{
  assert.notEqual(shoppingTrivia('装飾品A',0),shoppingTrivia('装飾品A',1));
  assert.equal(shoppingTrivia('装飾品A',1),shoppingTrivia('装飾品A',7));
  assert.equal(productNameFromTitle('装飾品A｜余談商店の読みもの'),'装飾品A');
  assert(!shoppingTrivia('A\nB\u0000\rC').includes('\n'));
});
test('manual Threads creation and regeneration work for multiple previously unsupported genres',async()=>{
  for(const title of categories){
    const env={DB:new FakeD1(),AI_ADMIN_TOKEN:admin,AI:mockThreadAI()};
    await req(env,'/api/drafts');
    const saved=await req(env,'/api/drafts','POST',{id:uuid,title:`${title}｜特徴と購入前のチェックポイント`,markdown:'※この記事にはアフィリエイト広告が含まれます。\n\n商品情報は販売者の説明です。'});
    assert.equal(saved.status,201,title);
    assert.equal((await req(env,`/api/drafts/${uuid}/publish`,'POST')).status,200);
    const created=await req(env,'/api/social/threads','POST',{articleId:uuid});
    assert.equal(created.status,201,title);
    const body=(await created.json()).post.body;
    assert(body.includes('/articles/'+uuid),title);
    assert([...body].length<=500,title);
    const regenerated=await req(env,`/api/social/threads/${uuid}/regenerate`,'POST');
    assert.equal(regenerated.status,200,title);
    assert.notEqual((await regenerated.json()).post.body,body,title);
  }
});
test('AI article generation uses a grounded note for an unknown product, not a fabricated fact',async()=>{
  const generatedText='## 今日の余談\n店主の話です。気になる点があります。\n\n## この品とのつながり\nこの商品は購入前に選ぶ条件を確認したい品です。どんな用途で使うか想像してみましょう。\n\n## お買い物前のひとこと\n販売ページで商品情報を確認してください。付属品などの説明を見比べるのもよいでしょう。\n\n## 店主のしめくくり\n用途に合っているかを確かめ、納得して選びたいですね。';
  const env={AI_ADMIN_TOKEN:admin,AI:{run:async()=>({response:generatedText})}};
  const res=await req(env,'/api/articles/generate','POST',{item:{name:'不思議な装飾品A',code:'shop:0001',price:2000,shop:'テスト',caption:'装飾品',url:'https://item.rakuten.co.jp/example/item/'}});
  assert.equal(res.status,200);
  const body=(await res.json()).markdown;
  assert.match(body,/店主から、ひとつ余談を。/);
  assert.match(body,/買い物の小ネタ/);
  assert.doesNotMatch(body,/月は地球|ルーメン|架空の由来/);
});
