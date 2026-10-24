// Rakuten Ichiba Item Search API (2026-07-01) – GitHub → Cloudflare Workers
// Secrets are read only on the Worker. They must never be embedded in public assets.
const API_URL = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const json = (data, status = 200, headers = {}) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});
const asSecret = (value) => {
  let result = typeof value === 'string' ? value.trim() : '';
  // Also tolerate credentials mistakenly pasted with enclosing quotes.
  if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("'") && result.endsWith("'"))) result = result.slice(1, -1).trim();
  return result;
};
const cacheFor = () => (typeof caches !== 'undefined' && caches.default ? caches.default : null);
const cachedResponse = (data, ttl) => Response.json(data, {
  headers: { 'Cache-Control': `public, max-age=${ttl}`, 'X-Content-Type-Options': 'nosniff' }
});
const safeErrorCode = (data) => {
  const code = data && typeof data.error === 'string' ? data.error : '';
  // Do not reflect arbitrary provider output or credentials to public visitors.
  return /^[a-z][a-z0-9_-]{0,59}$/.test(code) ? code : null;
};
const safeItem = (entry) => {
  const item = entry?.Item ?? entry ?? {};
  const img = item.mediumImageUrls?.[0];
  return {
    name: typeof item.itemName === 'string' ? item.itemName : '',
    price: Number.isFinite(item.itemPrice) ? item.itemPrice : null,
    url: item.affiliateUrl || item.itemUrl || '',
    image: typeof img === 'string' ? img : img?.imageUrl || '',
    shop: typeof item.shopName === 'string' ? item.shopName : ''
  };
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({
      ok: true,
      service: 'rakuten-auto-affiliate',
      apiConfigured: Boolean(asSecret(env.RAKUTEN_APP_ID) && asSecret(env.RAKUTEN_ACCESS_KEY)),
      affiliateConfigured: Boolean(asSecret(env.RAKUTEN_AFFILIATE_ID)),
      apiVersion: '2026-07-01',
      release: 'v8'
    });

    if (url.pathname === '/api/search') {
      if (request.method !== 'GET') return json({ error: 'GETのみ対応しています。' }, 405);
      const applicationId = asSecret(env.RAKUTEN_APP_ID);
      const accessKey = asSecret(env.RAKUTEN_ACCESS_KEY);
      const affiliateId = asSecret(env.RAKUTEN_AFFILIATE_ID);
      if (!applicationId || !accessKey) return json({ error: '楽天APIの認証情報が未設定です。Cloudflareの生産環境にRAKUTEN_APP_IDとRAKUTEN_ACCESS_KEYをSecretで設定してください。' }, 503);
      const keyword = (url.searchParams.get('keyword') || '').trim();
      if (!keyword || new TextEncoder().encode(keyword).length > 128) return json({ error: '検索キーワードは1〜128バイトで入力してください。' }, 400);
      const pageInput = url.searchParams.get('page') || '1';
      const page = /^\d+$/.test(pageInput) ? Math.max(1, Math.min(100, Number(pageInput))) : 1;

      // Mirror the successful Rakuten official API test form: applicationId and
      // accessKey are both sent as API parameters. Rakuten docs also allow a header.
      // This URL is used ONLY server-side and is never sent to the browser or logged.
      const params = new URLSearchParams({
        format: 'json', applicationId, accessKey, keyword, hits: '12', page: String(page)
      });
      if (affiliateId) params.set('affiliateId', affiliateId);

      // Edge-local cache: avoid repeated requests (rate limits). A new versioned
      // cache namespace prevents previous releases' responses from being reused.
      const cache = cacheFor();
      const searchCacheKey = new Request(`${url.origin}/api/__v8_result?keyword=${encodeURIComponent(keyword)}&page=${page}`);
      const cooldownKey = new Request(`${url.origin}/api/__v8_cooldown`);
      try {
        if (cache) {
          const hit = await cache.match(searchCacheKey);
          if (hit) return hit;
          if (await cache.match(cooldownKey)) return json({ error: '楽天APIの利用制限中です。時間を空けてから再試行してください。', upstreamStatus: 429 }, 503, { 'Retry-After': '120' });
        }

        let upstream;
        try {
          upstream = await fetch(`${API_URL}?${params}`, {
            method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12000)
          });
        } catch {
          return json({ error: '楽天APIへの通信に失敗しました。ネットワーク接続を確認してください。' }, 502);
        }

        if (!upstream.ok) {
          if (upstream.status === 429 && cache) await cache.put(cooldownKey, cachedResponse({ limited: true }, 120));
          let code = null;
          try { code = safeErrorCode(await upstream.json()); } catch { /* not JSON */ }
          if (upstream.status === 403) return json({
            error: '楽天APIがHTTP 403でアクセスを拒否しました。楽天の許可ウェブサイト、アプリIDとアクセスキーの組み合わせ、API利用権限を確認してください。',
            upstreamStatus: 403, upstreamErrorCode: code
          }, 502);
          if (upstream.status === 429) return json({
            error: '楽天APIがHTTP 429（利用制限）を返しました。再試行を繰り返さないでください。',
            upstreamStatus: 429, upstreamErrorCode: code
          }, 503, { 'Retry-After': '120' });
          return json({
            error: `楽天APIがHTTP ${upstream.status}を返しました。`,
            upstreamStatus: upstream.status,
            upstreamErrorCode: code
          }, 502);
        }

        let body;
        try { body = await upstream.json(); } catch {
          return json({ error: '楽天APIの応答がJSONではありませんでした。' }, 502);
        }
        if (body?.error) return json({
          error: '楽天APIからエラーが返されました。', upstreamErrorCode: safeErrorCode(body)
        }, 502);
        const entries = Array.isArray(body?.Items) ? body.Items : [];
        const result = {
          items: entries.map(safeItem), page,
          count: entries.length,
          affiliateConfigured: Boolean(affiliateId)
        };
        if (cache) await cache.put(searchCacheKey, cachedResponse(result, 600));
        return json(result);
      } catch {
        return json({ error: '検索処理中にエラーが発生しました。' }, 502);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  }
};
