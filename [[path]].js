import { json, fail, str, safeHttps } from '../../lib/shared.js';
import { authenticate, deny } from '../../lib/auth.js';
import { syncCategory } from '../../lib/sync.js';

const n = (v,defaultValue,min,max) => { const x=Number(v); return Number.isInteger(x) ? Math.max(min,Math.min(max,x)) : defaultValue; };
const readBody = async req => { try { return await req.json(); } catch { return null; } };
const allowedCategories = new Set(['gadgets','appliances','beauty','fashion','home','pets','food','other']);
const badDb = () => fail('データベースが未接続です。セットアップ手順を確認してください。',503);
async function audit(db,actor,action,target,details='') {
  await db.prepare('INSERT INTO audit_events(id,actor,action,target,details) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor,action,str(target,250),str(details,600)).run();
}
async function listProducts(db, url, admin=false) {
  const category = str(url.searchParams.get('category')||'',40);
  const q = str(url.searchParams.get('q')||'',14);
  const sort = url.searchParams.get('sort') || 'score';
  const limit = n(url.searchParams.get('limit'),24,1,100), offset=n(url.searchParams.get('offset'),0,0,5000);
  const where = [`p.status ${admin?'IN (\'draft\',\'published\',\'hidden\')':'= \'published\''}`];
  const bind=[];
  if(category && allowedCategories.has(category)) { where.push('p.category_id=?'); bind.push(category); }
  if(q) { where.push('(p.title LIKE ? OR p.description LIKE ?)'); bind.push(`%${q}%`,`%${q}%`); }
  const order=({score:'p.score DESC',recent:'p.created_at DESC',low:'best_price ASC',high:'best_price DESC',name:'p.title ASC'})[sort] || 'p.score DESC';
  const base = `FROM products p LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN offers o ON o.item_code=(SELECT x.item_code FROM offers x WHERE x.product_id=p.id AND x.availability=1 AND x.fetched_at>=datetime('now','-7 day') ORDER BY x.price ASC LIMIT 1)
    WHERE ${where.join(' AND ')}`;
  const rows = await db.prepare(`SELECT p.id,p.title,p.description,p.image_url,p.category_id,c.label AS category_label,
    p.score,p.status,p.featured,p.updated_at,p.source_updated_at,o.item_code AS best_item_code,
    o.shop_name,o.price AS best_price,o.review_average,o.review_count,o.fetched_at
    ${base} ORDER BY ${order},p.id LIMIT ? OFFSET ?`).bind(...bind,limit,offset).all();
  const total = await db.prepare(`SELECT COUNT(*) AS count ${base}`).bind(...bind).first();
  return json({ products:rows.results||[], total:total?.count||0, limit,offset });
}
async function productDetails(db,id) {
  const product = await db.prepare(`SELECT p.*,c.label AS category_label FROM products p
    JOIN categories c ON c.id=p.category_id WHERE p.id=? AND p.status='published'`).bind(id).first();
  if (!product) return fail('商品が見つかりません',404);
  const offers = await db.prepare(`SELECT item_code,shop_name,price,review_average,review_count,shipping_included,availability,fetched_at
    FROM offers WHERE product_id=? AND availability=1 AND fetched_at>=datetime('now','-7 day') ORDER BY price ASC LIMIT 15`).bind(id).all();
  return json({ product, offers:offers.results||[] });
}
function templateDraft(product,offer,channel,origin) {
  const title = (channel==='note' ? '選ぶ前に確認したい：' : '') + product.title;
  const description = str(product.description.replace(/<[^>]*>/g,'').replace(/\s+/g,' '),260);
  if(channel==='threads') {
    return {title,body:`【PR】${product.title}\n\n参考価格：${Number(offer.price).toLocaleString('ja-JP')}円（取得時点）\nレビュー：${offer.review_average}/5（${offer.review_count}件）\n${offer.shipping_included?'送料込み表示':'送料は購入先で要確認'}\n\n最新価格・詳細はサイトで確認👇\n${origin}/?product=${encodeURIComponent(product.id)}\n\n※価格・在庫は変わる場合があります。`};
  }
  return {title,body:`【PR / アフィリエイト広告】\n\n# ${title}\n\n${description || '商品の仕様は楽天の販売ページで確認してください。'}\n\n## 現在確認できる情報\n- 参考価格：${Number(offer.price).toLocaleString('ja-JP')}円（取得時点）\n- レビュー平均：${offer.review_average}/5（${offer.review_count}件）\n- 送料：${offer.shipping_included?'送料込み表示':'購入先で要確認'}\n\n## 選ぶときの注意点\n- 最新の価格、在庫、保証、付属品を購入先で確認してください。\n- 実物を試したという意味ではありません。\n\n商品比較はこちら：${origin}/?product=${encodeURIComponent(product.id)}\n\n※これは商品データを基に作成した下書きです。公開前に文章と根拠を確認してください。`};
}
async function draftText(env,product,offer,channel,origin) {
  const base = templateDraft(product,offer,channel,origin);
  if (!env.AI || !env.AI_MODEL) return { ...base,mode:'template' };
  const facts={name:product.title,price:offer.price,reviewAverage:offer.review_average,reviewCount:offer.review_count,shippingIncluded:!!offer.shipping_included,
    productDescription:str(product.description.replace(/<[^>]*>/g,''),500),url:`${origin}/?product=${encodeURIComponent(product.id)}`};
  try {
    const output = await env.AI.run(env.AI_MODEL,{messages:[
      {role:'system',content:'あなたは商品データだけに基づいて日本語の広告原稿の下書きを作成する編集者です。実体験・未確認の性能・売上・最安値などは捏造しない。冒頭に【PR】を明示。価格・在庫変動と未使用であることを必要に応じて明示。渡された事実以外の断定を禁止。見出しを適度に入れる。'},
      {role:'user',content:`形式:${channel}\n確認済み情報:${JSON.stringify(facts)}\nテキストのみで生成。${channel==='threads'?'350字以内':'700字以内'}。`}
    ]});
    const textValue=str(output?.response || output?.result?.response || '',5000);
    return textValue ? {title:base.title,body:textValue,mode:'ai-needs-review'} : { ...base,mode:'template' };
  } catch { return {...base,mode:'template'}; }
}
async function publishThreads(env,article) {
  if (!env.THREADS_ACCESS_TOKEN) throw new Error('Threads認証が未設定です');
  const text = str(article.body,480);
  const endpoint='https://graph.threads.net/v1.0/me/threads';
  const form = new URLSearchParams({media_type:'TEXT',text});
  const headers={ Authorization:`Bearer ${env.THREADS_ACCESS_TOKEN}`, 'Content-Type':'application/x-www-form-urlencoded' };
  const created=await fetch(endpoint,{method:'POST',headers,body:form,signal:AbortSignal.timeout(15000)});
  if(!created.ok) throw new Error('Threadsコンテナ作成に失敗 HTTP '+created.status);
  const container=await created.json();
  if(!container.id) throw new Error('ThreadsコンテナIDを取得できません');
  const publish=await fetch('https://graph.threads.net/v1.0/me/threads_publish',{
    method:'POST',headers,body:new URLSearchParams({creation_id:container.id}),signal:AbortSignal.timeout(15000)
  });
  if(!publish.ok) throw new Error('公開状態を確認してください（重複防止のため自動再実行不可） HTTP '+publish.status);
  const result=await publish.json();
  if(!result.id) throw new Error('公開応答が不明。再投稿前に手動確認してください');
  return result.id;
}
async function syncJob(db,env,id,page=1) {
  try { return json(await syncCategory(db,env,id,page)); }
  catch(e) { return fail(e.message || '同期失敗',502); }
}
export async function onRequest(context) {
  const {request,env}=context;
  const url=new URL(request.url);
  const path=url.pathname.replace(/^\/api\/?/,'').replace(/\/+$/,'');
  const method=request.method.toUpperCase();
  if(path==='status' && method==='GET') return json({ ready:!!env.DB, rakutenConfigured:!!(env.RAKUTEN_APP_ID&&env.RAKUTEN_ACCESS_KEY&&env.RAKUTEN_AFFILIATE_ID),
    threadsConfigured:!!env.THREADS_ACCESS_TOKEN, aiConfigured:!!(env.AI&&env.AI_MODEL), updated:new Date().toISOString() });
  if(!env.DB) return badDb();
  const db=env.DB;
  try {
    if(path==='categories' && method==='GET') {
      const rows=await db.prepare('SELECT id,label,icon,sort_order FROM categories WHERE enabled=1 ORDER BY sort_order').all();
      return json({categories:rows.results||[]});
    }
    if(path==='products' && method==='GET') return listProducts(db,url);
    if(path.startsWith('products/') && method==='GET') return productDetails(db,path.slice(9));
    if(path==='stats' && method==='GET') {
      const p=await db.prepare("SELECT COUNT(*) AS n FROM products WHERE status='published'").first();
      const a=await db.prepare("SELECT MAX(finished_at) AS last_update FROM job_runs WHERE state='success'").first();
      return json({published:p?.n||0,lastUpdated:a?.last_update||null});
    }
    if(path==='articles' && method==='GET') {
      const rows=await db.prepare("SELECT id,title,body,created_at,channel FROM articles WHERE channel='site' AND status='published' ORDER BY created_at DESC LIMIT 30").all();
      return json({articles:rows.results||[]});
    }
    if(path.startsWith('out/') && method==='GET') {
      const itemCode=decodeURIComponent(path.slice(4));
      const offer=await db.prepare("SELECT affiliate_url FROM offers WHERE item_code=? AND availability=1 AND fetched_at>=datetime('now','-7 day')").bind(itemCode).first();
      if(!offer?.affiliate_url || !safeHttps(offer.affiliate_url)) return fail('購入リンクを確認できません',404);
      const src=str(url.searchParams.get('src')||'site',40).replace(/[^a-z0-9_\-]/gi,'');
      await db.prepare('INSERT INTO click_events(id,item_code,source) VALUES(?,?,?)').bind(crypto.randomUUID(),itemCode,src).run();
      return new Response(null,{status:302,headers:{Location:offer.affiliate_url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
    if(path==='internal/sync' && method==='POST') {
      const secret=String(env.SYNC_JOB_SECRET||'');
      if(secret.length < 24 || request.headers.get('Authorization') !== `Bearer ${secret}`) return fail('Unauthorized',401);
      const body=await readBody(request);
      if(!body || !allowedCategories.has(body.category)) return fail('ジャンル指定が不正');
      return syncJob(db,env,body.category,n(body.page,1,1,3));
    }
    if(!path.startsWith('admin/')) return fail('指定されたAPIはありません',404);
    const user=await authenticate(request,env);
    if(!user) return deny();
    const subpath=path.slice(6);
    if(subpath==='overview' && method==='GET') {
      const products=await db.prepare('SELECT status,COUNT(*) AS count FROM products GROUP BY status').all();
      const clicks=await db.prepare("SELECT COUNT(*) AS n FROM click_events WHERE occurred_at >= datetime('now','-30 day')").first();
      const jobs=await db.prepare('SELECT * FROM job_runs ORDER BY started_at DESC LIMIT 12').all();
      const drafts=await db.prepare('SELECT * FROM articles ORDER BY created_at DESC LIMIT 30').all();
      return json({products:products.results||[],clicks30d:clicks?.n||0,jobs:jobs.results||[],articles:drafts.results||[]});
    }
    if(subpath==='products' && method==='GET') return listProducts(db,url,true);
    if(subpath==='sync' && method==='POST') {
      const body=await readBody(request);
      if(!allowedCategories.has(body?.category)) return fail('ジャンル指定が不正');
      const result=await syncJob(db,env,body.category,n(body.page,1,1,3));
      await audit(db,user.email,'sync-request',body.category);
      return result;
    }
    if(subpath.startsWith('products/') && method==='PATCH') {
      const id=subpath.slice(9), body=await readBody(request);
      if(!body || !['draft','published','hidden'].includes(body.status)) return fail('ステータスが不正');
      const result=await db.prepare('UPDATE products SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(body.status,id).run();
      if(!result.meta?.changes) return fail('商品が見つかりません',404);
      await audit(db,user.email,'product-status',id,body.status);
      return json({ok:true});
    }
    if(subpath==='merge' && method==='POST') {
      const body=await readBody(request);
      const target=str(body?.targetId,100),source=str(body?.sourceId,100);
      if(!target||!source||target===source||body?.confirmedSameModel!==true) return fail('同一型番であることを確認してください');
      const existing=await db.prepare('SELECT id,category_id FROM products WHERE id IN (?,?)').bind(target,source).all();
      if((existing.results||[]).length!==2 || existing.results[0].category_id!==existing.results[1].category_id) return fail('同一ジャンルの2商品を指定してください');
      await db.batch([
        db.prepare('UPDATE offers SET product_id=? WHERE product_id=?').bind(target,source),
        db.prepare('DELETE FROM products WHERE id=?').bind(source),
        db.prepare('UPDATE products SET score=(SELECT MAX(score) FROM offers WHERE product_id=?),updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(target,target)
      ]);
      await audit(db,user.email,'verified-merge',target,`source=${source}`);
      return json({ok:true});
    }
    if(subpath==='drafts' && method==='POST') {
      const body=await readBody(request);
      if(!body || !['site','threads','note'].includes(body.channel)) return fail('生成先が不正');
      const p=await db.prepare(`SELECT p.id,p.title,p.description,o.price,o.review_average,o.review_count,o.shipping_included
        FROM products p JOIN offers o ON o.item_code=(SELECT item_code FROM offers WHERE product_id=p.id AND availability=1 AND fetched_at>=datetime('now','-7 day') ORDER BY price LIMIT 1)
        WHERE p.id=? LIMIT 1`).bind(str(body.productId,100)).first();
      if(!p) return fail('対象商品の販売情報がありません',404);
      const origin=new URL(request.url).origin;
      const draft=await draftText(env,p,p,body.channel,origin);
      const id=crypto.randomUUID();
      await db.prepare('INSERT INTO articles(id,product_id,channel,title,body,generation_mode) VALUES(?,?,?,?,?,?)')
        .bind(id,p.id,body.channel,draft.title,draft.body,draft.mode).run();
      await audit(db,user.email,'draft-created',id,body.channel);
      return json({id,...draft});
    }
    if(subpath.startsWith('drafts/') && method==='PATCH') {
      const id=subpath.slice(7),body=await readBody(request);
      if(!body || !['draft','approved','published','hidden'].includes(body.status) || typeof body.body!=='string' || body.body.length>10000) return fail('入力が不正');
      const a=await db.prepare('SELECT channel,status FROM articles WHERE id=?').bind(id).first();
      if(!a) return fail('原稿が見つかりません',404);
      if(a.channel==='threads' && body.status==='published') return fail('Threadsへの公開は専用操作を使ってください');
      if(a.channel==='note' && body.status==='published') return fail('noteの公開は手動です。システム上ではapprovedとして管理してください');
      await db.prepare('UPDATE articles SET body=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(body.body,body.status,id).run();
      await audit(db,user.email,'draft-updated',id,body.status);
      return json({ok:true});
    }
    if(subpath.startsWith('threads/publish/') && method==='POST') {
      const id=subpath.slice(16);
      const a=await db.prepare("SELECT * FROM articles WHERE id=? AND channel='threads'").bind(id).first();
      if(!a || a.status!=='approved' || a.external_id) return fail('承認済み・未投稿の原稿のみ公開できます',409);
      // Mark pending before external request; failures require explicit manual inspection.
      const lock=await db.prepare("UPDATE articles SET status='hidden' WHERE id=? AND status='approved' AND external_id IS NULL").bind(id).run();
      if(!lock.meta?.changes) return fail('すでに処理されています',409);
      try {
        const externalId=await publishThreads(env,a);
        await db.prepare("UPDATE articles SET status='published',external_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(externalId,id).run();
        await audit(db,user.email,'threads-published',id,externalId);
        return json({ok:true,externalId});
      } catch(e) { await audit(db,user.email,'threads-check-required',id,e.message); return fail(`${e.message}。状態は要確認に変更しました。`,502); }
    }
    return fail('指定されたAPIはありません',404);
  } catch(e) {
    console.error('API error',e?.message || 'unknown');
    return fail('処理に失敗しました。接続・DB初期化・設定を確認してください。',500);
  }
}
