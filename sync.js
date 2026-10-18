import { normalizeItem, qualityPass, str, json } from './shared.js';
const ENDPOINT = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
export async function syncCategory(db, env, categoryId, page = 1) {
  if (!Number.isInteger(page) || page < 1 || page > 3) throw new Error('ページ番号が不正');
  if (!db) throw new Error('D1未接続');
  if (!env.RAKUTEN_APP_ID || !env.RAKUTEN_ACCESS_KEY || !env.RAKUTEN_AFFILIATE_ID) throw new Error('楽天APIの3つの認証情報が未設定');
  const category = await db.prepare('SELECT * FROM categories WHERE id=? AND enabled=1').bind(categoryId).first();
  if (!category) throw new Error('ジャンルが存在しません');
  const runId = crypto.randomUUID();
  await db.prepare('INSERT INTO job_runs(id,name,target,state) VALUES(?,?,?,?)').bind(runId,'rakuten-sync',`${categoryId}:${page}`,'running').run();
  try {
    const u = new URL(ENDPOINT);
    for(const [k,v] of Object.entries({ applicationId:env.RAKUTEN_APP_ID, affiliateId:env.RAKUTEN_AFFILIATE_ID,
      keyword:category.query, hits:'10', page:String(page), formatVersion:'2', imageFlag:'1', hasReviewFlag:'1' })) u.searchParams.set(k,v);
    const response = await fetch(u.toString(), { headers:{ accessKey:env.RAKUTEN_ACCESS_KEY }, signal:AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`楽天API HTTP ${response.status}`);
    const api = await response.json();
    if (!Array.isArray(api.items)) throw new Error('楽天APIの応答形式が想定外');
    const rows = api.items.map(v => normalizeItem(v.item || v)).filter(qualityPass);
    const codes = rows.map(x => x.itemCode);
    const existing = codes.length ? await db.prepare(`SELECT item_code,product_id FROM offers WHERE item_code IN (${codes.map(()=>'?').join(',')})`).bind(...codes).all() : {results:[]};
    const productFor = new Map((existing.results||[]).map(x=>[x.item_code,x.product_id]));
    const statements = [];
    const touchedProductIds = new Set();
    for(const x of rows) {
      let productId = productFor.get(x.itemCode);
      if (!productId) {
        productId = crypto.randomUUID();
        statements.push(db.prepare(`INSERT OR IGNORE INTO products
          (id,identity_key,category_id,title,description,image_url,score)
          VALUES (?,?,?,?,?,?,?)`).bind(productId,`offer:${x.itemCode}`,category.id,x.title,x.description,x.image,x.score));
      }
      touchedProductIds.add(productId);
      statements.push(db.prepare(`INSERT INTO offers
        (item_code,product_id,shop_code,shop_name,price,affiliate_rate,review_average,review_count,image_url,affiliate_url,availability,shipping_included,score,fetched_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(item_code) DO UPDATE SET shop_code=excluded.shop_code,shop_name=excluded.shop_name,
        price=excluded.price,affiliate_rate=excluded.affiliate_rate,review_average=excluded.review_average,
        review_count=excluded.review_count,image_url=excluded.image_url,affiliate_url=excluded.affiliate_url,
        availability=excluded.availability,shipping_included=excluded.shipping_included,score=excluded.score,
        fetched_at=CURRENT_TIMESTAMP`).bind(x.itemCode,productId,x.shopCode,x.shopName,x.price,x.rate,x.reviewAverage,x.reviewCount,x.image,x.affiliateUrl,x.available,x.postageIncluded,x.score));

    }
    for (const productId of touchedProductIds) {
      statements.push(db.prepare(`UPDATE products SET score=COALESCE((SELECT MAX(score) FROM offers WHERE product_id=? AND availability=1),0),source_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(productId,productId));
    }
    // Batched, transactional DB writes: never destroy previous data on a failed API fetch.
    if (statements.length) await db.batch(statements);
    await db.prepare('UPDATE job_runs SET state=?,fetched=?,accepted=?,message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind('success',api.items.length,rows.length,'商品は承認待ちとして登録。公開は管理画面で承認。',runId).run();
    return { id:runId, category:categoryId, page, fetched:api.items.length, accepted:rows.length, state:'success' };
  } catch(e) {
    await db.prepare('UPDATE job_runs SET state=?,message=?,finished_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind('failed',str(e.message,300),runId).run();
    throw e;
  }
}
