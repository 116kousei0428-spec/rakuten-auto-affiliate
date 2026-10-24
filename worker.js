const API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const cachedResponse = (data, ttl) => Response.json(data, { headers: { 'Cache-Control': `public, max-age=${ttl}`, 'X-Content-Type-Options': 'nosniff' } });
const cacheFor = () => (typeof caches !== 'undefined' && caches.default ? caches.default : null);
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'rakuten-affiliate', apiConfigured: Boolean(env.RAKUTEN_APP_ID && env.RAKUTEN_ACCESS_KEY), affiliateConfigured: Boolean(env.RAKUTEN_AFFILIATE_ID) });
    if (url.pathname === '/api/search') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      if (!env.RAKUTEN_APP_ID || !env.RAKUTEN_ACCESS_KEY) return json({ error: '楽天APIの認証情報が未設定です。CloudflareのVariables and SecretsにRAKUTEN_APP_IDとRAKUTEN_ACCESS_KEYを設定してください。' }, 503);
      const keyword = (url.searchParams.get('keyword') || '').trim();
      if (!keyword || keyword.length > 100) return json({ error: '検索キーワードは1〜100文字で入力してください。' }, 400);
      const page = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
      const params = new URLSearchParams({ applicationId: env.RAKUTEN_APP_ID, keyword, format: 'json', hits: '12', page: String(page) });
      if (env.RAKUTEN_AFFILIATE_ID) params.set('affiliateId', env.RAKUTEN_AFFILIATE_ID);
      try {
        const cache = cacheFor();
        const cacheKey = new Request(url.toString(), { method: 'GET' });
        const cooldownKey = new Request(`${url.origin}/api/__rakuten_rate_limit`, { method: 'GET' });
        // Return an existing result without another upstream request.
        if (cache) {
          const hit = await cache.match(cacheKey);
          if (hit) return hit;
          const cooldown = await cache.match(cooldownKey);
          if (cooldown) return json({ error: '楽天APIが利用制限中です。少し時間を空けて再試行してください。', retryAfterSeconds: 120 }, 503, { 'Retry-After': '120' });
        }
        // Access key must never appear in browser requests or logs.
        const upstream = await fetch(`${API_URL}?${params}`, { headers: { accessKey: env.RAKUTEN_ACCESS_KEY }, signal: AbortSignal.timeout(10000) });
        if (upstream.status === 429) {
          // Keep a shared short cooldown at each Cloudflare edge to reduce repeated calls.
          if (cache) await cache.put(cooldownKey, cachedResponse({ cooldown: true }, 120));
          return json({ error: '楽天APIの利用上限（HTTP 429）に達しました。連続検索を止め、時間を空けてください。', retryAfterSeconds: 120 }, 503, { 'Retry-After': '120' });
        }
        if (!upstream.ok) return json({ error: `楽天APIがHTTP ${upstream.status}を返しました。認証情報やAPI設定を確認してください。` }, 502);
        const body = await upstream.json();
        if (body.error) return json({ error: '楽天APIからエラーが返されました。アプリID・アクセスキーと許可ドメインを確認してください。' }, 502);
        const raw = Array.isArray(body.Items) ? body.Items : [];
        const items = raw.map((entry) => {
          const item = entry.Item ?? entry;
          const img = item.mediumImageUrls?.[0];
          return { name: item.itemName || '', price: item.itemPrice ?? null, url: env.RAKUTEN_AFFILIATE_ID ? (item.affiliateUrl || item.itemUrl || '') : (item.itemUrl || ''), image: typeof img === 'string' ? img : img?.imageUrl || '', shop: item.shopName || '' };
        });
        const result = { items, page, count: items.length, affiliateConfigured: Boolean(env.RAKUTEN_AFFILIATE_ID) };
        const response = json(result);
        if (cache) await cache.put(cacheKey, cachedResponse(result, 600));
        return response;
      } catch { return json({ error: '楽天APIとの通信に失敗しました。' }, 502); }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
