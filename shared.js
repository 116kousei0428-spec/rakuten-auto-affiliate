export const toNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export const safeHttps = (url) => { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
export const str = (v, max = 240) => String(v ?? '').trim().slice(0, max);
export const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export const fail = (message, status = 400) => json({ error: message }, status);
export function scoreOffer(item) {
  const count = Math.max(0, toNumber(item.reviewCount));
  const avg = Math.max(0, Math.min(5, toNumber(item.reviewAverage)));
  const rate = Math.max(0, toNumber(item.affiliateRate));
  const price = Math.max(0, toNumber(item.itemPrice));
  const confidence = Math.min(1, Math.log1p(count) / Math.log1p(100));
  const reward = Math.min(1000, price * rate / 100);
  return Math.round((35 * (avg / 5) * confidence + 30 * Math.log1p(reward) / Math.log1p(1000) + 25 * confidence + (Number(item.postageFlag) === 0 ? 10 : 0)) * 10) / 10;
}
export function normalizeItem(item) {
  const img = item.mediumImageUrls?.[0];
  const image = typeof img === 'string' ? img : (img?.imageUrl || '');
  return {
    itemCode: str(item.itemCode, 160), title: str(item.itemName, 300),
    description: str(item.itemCaption, 1000), image: safeHttps(image),
    price: Math.max(0, Math.floor(toNumber(item.itemPrice))),
    shopCode: str(item.shopCode, 100), shopName: str(item.shopName, 200),
    rate: Math.max(0, toNumber(item.affiliateRate)),
    reviewAverage: Math.min(5, Math.max(0, toNumber(item.reviewAverage))),
    reviewCount: Math.max(0, Math.floor(toNumber(item.reviewCount))),
    available: Number(item.availability) === 1 ? 1 : 0,
    postageIncluded: Number(item.postageFlag) === 0 ? 1 : 0,
    affiliateUrl: safeHttps(item.affiliateUrl), score: scoreOffer(item)
  };
}
export function qualityPass(x) {
  return Boolean(x.itemCode && x.title && x.image && x.affiliateUrl && x.available && x.price > 0 && x.reviewCount >= 3 && x.reviewAverage >= 3.5);
}
export function publicOffer(row) {
  return { itemCode: row.item_code, shopName: row.shop_name, price: row.price,
    reviewCount: row.review_count, reviewAverage: row.review_average,
    shippingIncluded: Boolean(row.shipping_included), available: Boolean(row.availability),
    fetchedAt: row.fetched_at };
}
