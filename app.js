const form = document.querySelector('#search-form');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const yen = (n) => typeof n === 'number' ? `${n.toLocaleString('ja-JP')}円` : '価格未取得';
const safe = (url) => { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const setStatus = (message) => { status.textContent = message; };
fetch('/api/health').then(r => r.json()).then(data => setStatus(data.apiConfigured ? '検索できます。' : '楽天APIの認証情報が未設定です。管理者がCloudflare側で設定してください。')).catch(() => setStatus('APIに接続できません。'));
form.addEventListener('submit', async (e) => {
  e.preventDefault(); results.replaceChildren(); setStatus('検索中…');
  const keyword = document.querySelector('#keyword').value.trim();
  if (!keyword) return setStatus('キーワードを入力してください。');
  try {
    const response = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`);
    const data = await response.json().catch(() => ({ error: `API応答を読み取れません（HTTP ${response.status}）`, errorCode: 'INVALID_API_RESPONSE' }));
    if (!response.ok) throw new Error(`${data.error || '検索に失敗しました。'}${data.errorCode ? ' [診断: ' + data.errorCode + (data.errorType ? '/' + data.errorType : '') + ']' : ''}${data.upstreamErrorCode ? ' [楽天側: ' + data.upstreamErrorCode + ']' : ''}`);
    setStatus(`${data.count}件取得${data.affiliateConfigured ? '' : '（アフィリエイトID未設定）'}`);
    for (const item of data.items) {
      const article = document.createElement('article'); article.className = 'item';
      const imgUrl = safe(item.image); if (imgUrl) { const img = document.createElement('img'); img.src = imgUrl; img.alt = ''; img.loading = 'lazy'; article.append(img); }
      const h2 = document.createElement('h2'); h2.textContent = item.name;
      const price = document.createElement('span'); price.className = 'price'; price.textContent = yen(item.price);
      const shop = document.createElement('span'); shop.className = 'shop'; shop.textContent = item.shop;
      article.append(h2, price, shop);
      const href = safe(item.url); if (href) { const link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer sponsored'; link.textContent = '楽天市場で見る'; article.append(link); }
      results.append(article);
    }
  } catch (error) { setStatus(error instanceof Error ? error.message : '通信が失敗しました（詳細不明）'); }
});
