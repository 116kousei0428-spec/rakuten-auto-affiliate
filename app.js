const $ = (selector) => document.querySelector(selector);
const form = $('#search-form');
const status = $('#status');
const results = $('#results');
const aiStatus = $('#ai-status');
const editor = $('#editor');
const draftText = $('#draft-text');
const draftMeta = $('#draft-meta');
const draftStatus = $('#draft-status');
const draftList = $('#draft-list');
const yen = (n) => typeof n === 'number' ? `${n.toLocaleString('ja-JP')}円` : '価格未取得';
const safe = (value) => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };
const setStatus = (message) => { status.textContent = message; };
const DRAFT_STORAGE_KEY = 'rakuten_ai_article_drafts_v11';
let currentDraft = null;
let aiBusy = false;

const storedDrafts = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, 15).filter(e => typeof e?.markdown === 'string') : [];
  } catch { return []; }
};
const storeDrafts = (entries) => {
  try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(entries.slice(0, 15))); return true; }
  catch { return false; }
};
const openDraft = (draft) => {
  currentDraft = draft;
  draftText.value = draft.markdown;
  draftMeta.textContent = `${draft.title || '無題の下書き'} ／ ${draft.generatedAt ? new Date(draft.generatedAt).toLocaleString('ja-JP') : ''}`;
  editor.hidden = false;
  draftStatus.textContent = '公開前に文章・価格・リンクを確認してください。';
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
const renderSavedDrafts = () => {
  draftList.replaceChildren();
  const saved = storedDrafts();
  if (!saved.length) { const p = document.createElement('p'); p.className = 'help'; p.textContent = '保存した下書きはありません。'; draftList.append(p); return; }
  for (const draft of saved) {
    const line = document.createElement('div'); line.className = 'draft-row';
    const label = document.createElement('span'); label.textContent = draft.title || '無題';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'secondary small'; open.textContent = '開く'; open.addEventListener('click', () => openDraft(draft));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary small'; remove.textContent = '削除'; remove.addEventListener('click', () => {
      storeDrafts(storedDrafts().filter(e => e.id !== draft.id)); renderSavedDrafts();
    });
    line.append(label, open, remove); draftList.append(line);
  }
};
const generateArticle = async (item, button) => {
  if (aiBusy) return;
  const token = $('#admin-token').value.trim();
  if (!token) { aiStatus.textContent = 'Cloudflareに設定した管理者キーを入力してください。'; $('#admin-token').focus(); return; }
  aiBusy = true;
  button.disabled = true;
  aiStatus.textContent = `「${item.name.slice(0, 25)}」の記事を生成中…`;
  try {
    const response = await fetch('/api/articles/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ item, tone: $('#tone').value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `記事生成に失敗しました（HTTP ${response.status}）`);
    const draft = { id: crypto.randomUUID(), title: data.title, markdown: data.markdown, generatedAt: data.generatedAt };
    openDraft(draft);
    aiStatus.textContent = '記事の下書きが生成されました。内容を確認して保存してください。';
  } catch (error) { aiStatus.textContent = error instanceof Error ? error.message : '記事生成に失敗しました。'; }
  finally { aiBusy = false; button.disabled = false; }
};

fetch('/api/health')
  .then(r => r.json())
  .then(data => {
    setStatus(data.apiConfigured ? '検索できます。' : '楽天APIの認証情報が未設定です。');
    if (!data.aiConfigured || !data.aiAdminConfigured) aiStatus.textContent = `記事生成の準備：${!data.aiConfigured ? 'Workers AI接続を確認してください。 ' : ''}${!data.aiAdminConfigured ? 'AI_ADMIN_TOKENの設定が必要です。' : ''}`;
  })
  .catch(() => setStatus('APIに接続できません。'));

form.addEventListener('submit', async (e) => {
  e.preventDefault(); results.replaceChildren(); setStatus('検索中…');
  const keyword = $('#keyword').value.trim();
  if (!keyword) return setStatus('キーワードを入力してください。');
  try {
    const response = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`);
    const data = await response.json().catch(() => ({ error: `API応答を読み取れません（HTTP ${response.status}）` }));
    if (!response.ok) throw new Error(data.error || '検索に失敗しました。');
    setStatus(`${data.count}件取得${data.affiliateConfigured ? '' : '（アフィリエイトID未設定）'}`);
    for (const item of data.items) {
      const article = document.createElement('article'); article.className = 'item';
      const imgUrl = safe(item.image); if (imgUrl) { const img = document.createElement('img'); img.src = imgUrl; img.alt = ''; img.loading = 'lazy'; article.append(img); }
      const h2 = document.createElement('h2'); h2.textContent = item.name;
      const price = document.createElement('span'); price.className = 'price'; price.textContent = yen(item.price);
      const shop = document.createElement('span'); shop.className = 'shop'; shop.textContent = item.shop;
      article.append(h2, price, shop);
      const href = safe(item.url);
      if (href) {
        const link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer sponsored'; link.textContent = '楽天市場で見る'; article.append(link);
      }
      const generate = document.createElement('button'); generate.type = 'button'; generate.textContent = 'AI記事を作成'; generate.className = 'generate';
      generate.addEventListener('click', () => generateArticle(item, generate));
      article.append(generate);
      results.append(article);
    }
  } catch (error) { setStatus(error instanceof Error ? error.message : '検索に失敗しました。'); }
});

$('#save-draft').addEventListener('click', () => {
  if (!currentDraft) return;
  currentDraft = { ...currentDraft, markdown: draftText.value };
  const drafts = storedDrafts().filter(e => e.id !== currentDraft.id);
  drafts.unshift(currentDraft);
  draftStatus.textContent = storeDrafts(drafts) ? 'このブラウザに保存しました。' : '保存できませんでした。ブラウザの容量やプライベートモードを確認してください。';
  renderSavedDrafts();
});
$('#copy-draft').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(draftText.value); draftStatus.textContent = '記事をコピーしました。'; }
  catch { draftStatus.textContent = 'コピーできませんでした。記事を選択して手動でコピーしてください。'; }
});
$('#download-draft').addEventListener('click', () => {
  if (!currentDraft) return;
  const blob = new Blob([draftText.value], { type: 'text/markdown;charset=utf-8' });
  const fileUrl = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = fileUrl; a.download = `rakuten-article-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
});
renderSavedDrafts();
