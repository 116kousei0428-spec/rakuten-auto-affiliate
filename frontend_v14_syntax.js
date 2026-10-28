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
const dbList = $('#db-list');
const dbStatus = $('#db-status');
const publishStatus = $('#publish-status');
const adminHeaders = () => ({ 'X-Admin-Token': $('#admin-token').value.trim() });
const requireToken = () => {
  if ($('#admin-token').value.trim()) return true;
  dbStatus.textContent = '管理者キーを入力してください。';
  $('#admin-token').focus();
  return false;
};
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
  currentDraft = { ...draft };
  draftText.value = draft.markdown;
  draftMeta.textContent = `${draft.title || '無題の下書き'} ／ ${(draft.updatedAt || draft.generatedAt) ? new Date(draft.updatedAt || draft.generatedAt).toLocaleString('ja-JP') : ''}`;
  editor.hidden = false;
  draftStatus.textContent = '公開前に文章・価格・リンクを確認してください。';
  publishStatus.textContent = draft.status === 'published' ? 'この記事は公開中です。編集内容は「保存して公開・更新」で反映されます。' : '未公開の記事です。';
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

const apiRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { ...adminHeaders(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};
const loadDbDrafts = async () => {
  if (!requireToken()) return;
  dbStatus.textContent = 'D1の記事一覧を取得中…';
  try {
    const data = await apiRequest('/api/drafts');
    dbList.replaceChildren();
    if (!data.drafts.length) {
      const p = document.createElement('p'); p.className = 'help'; p.textContent = 'D1にはまだ記事がありません。'; dbList.append(p);
    }
    for (const entry of data.drafts) {
      const line = document.createElement('div'); line.className = 'draft-row';
      const label = document.createElement('span'); label.textContent = `${entry.status === 'published' ? '公開中' : '下書き'} ／ ${entry.title} ／ ${entry.updatedAt.slice(0, 10)}`;
      const open = document.createElement('button'); open.type = 'button'; open.className = 'secondary small'; open.textContent = '開く・編集';
      open.addEventListener('click', async () => {
        try {
          const data = await apiRequest(`/api/drafts/${encodeURIComponent(entry.id)}`);
          openDraft({ ...data.draft, savedToDb: true });
        } catch (error) { dbStatus.textContent = error.message || '記事の取得に失敗しました。'; }
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary small'; remove.textContent = '削除';
      remove.addEventListener('click', async () => {
        if (!confirm(`「${entry.title}」をD1から削除しますか？`)) return;
        try {
          await apiRequest(`/api/drafts/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
          if (currentDraft?.id === entry.id) { currentDraft = null; editor.hidden = true; }
          await loadDbDrafts();
        } catch (error) { dbStatus.textContent = error.message || '削除に失敗しました。'; }
      });
      const pub = document.createElement('button'); pub.type = 'button'; pub.className = 'small publish'; pub.textContent = entry.status === 'published' ? '再公開' : '公開';
      pub.addEventListener('click', async () => {
        try {
          if (entry.status !== 'published' && !confirm(`「${entry.title}」を公開しますか？一般の訪問者が読めるようになります。`)) return;
          await apiRequest(`/api/drafts/${encodeURIComponent(entry.id)}/publish`, { method:'POST' });
          dbStatus.textContent = '公開しました。';
          await loadDbDrafts();
        } catch (error) { dbStatus.textContent = error.message || '公開に失敗しました。'; }
      });
      const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'small secondary'; stop.textContent = '公開停止'; stop.disabled = entry.status !== 'published';
      stop.addEventListener('click', async () => {
        try {
          await apiRequest(`/api/drafts/${encodeURIComponent(entry.id)}/publish`, {method:'DELETE'});
          if (currentDraft?.id === entry.id) { currentDraft.status = 'draft'; publishStatus.textContent = '公開を停止しました。'; }
          await loadDbDrafts();
        } catch (error) { dbStatus.textContent = error.message || '公開停止に失敗しました。'; }
      });
      line.append(label, open, pub, stop);
      if (entry.status === 'published') {
        const a = document.createElement('a'); a.href = `/articles/${encodeURIComponent(entry.id)}`;
        a.target = '_blank'; a.rel = 'noopener'; a.className = 'pub-link'; a.textContent = '記事を見る'; line.append(a);
      }
      line.append(remove); dbList.append(line);
    }
    dbStatus.textContent = `${data.drafts.length}件をD1から取得しました。`;
  } catch (error) { dbStatus.textContent = error.message || 'D1への接続に失敗しました。'; }
};
$('#load-db-drafts').addEventListener('click', loadDbDrafts);

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
    if ($('#auto-publish-after-generate').checked) {
      aiStatus.textContent = 'AI記事をD1に保存して公開中…';
      await publishCurrent();
      aiStatus.textContent = 'AI記事を自動公開しました。公開記事へのリンクは編集欄に表示されています。';
      await loadDbDrafts();
    }
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

const saveDbCurrent = async () => {
  if (!currentDraft) throw new Error('記事が選択されていません。');
  if (!$('#admin-token').value.trim()) throw new Error('管理者キーが必要です。');
  const draft = { ...currentDraft, markdown: draftText.value };
  const exists = Boolean(currentDraft.savedToDb);
  const data = await apiRequest(exists ? `/api/drafts/${encodeURIComponent(draft.id)}` : '/api/drafts', {
    method: exists ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({id:draft.id,title:draft.title,markdown:draft.markdown})
  });
  currentDraft = {...data.draft, savedToDb:true};
  return currentDraft;
};
const publishCurrent = async () => {
  const draft = await saveDbCurrent();
  const result = await apiRequest(`/api/drafts/${encodeURIComponent(draft.id)}/publish`, {method:'POST'});
  currentDraft = {...draft, status:'published', publishedAt:result.publishedAt};
  const link = `/articles/${encodeURIComponent(draft.id)}`;
  publishStatus.replaceChildren();
  const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '公開記事を開く';
  publishStatus.append('公開しました。 ',a);
  return result;
};
$('#save-draft').addEventListener('click', async () => {
  const button = $('#save-draft'); button.disabled = true;
  draftStatus.textContent = 'D1に保存中…';
  try { await saveDbCurrent(); draftStatus.textContent = '下書きをD1に保存しました（公開はされません）。'; await loadDbDrafts(); }
  catch (error) { draftStatus.textContent = error.message || 'D1に保存できませんでした。'; }
  finally { button.disabled = false; }
});
$('#publish-current').addEventListener('click', async () => {
  if (!currentDraft) return;
  if (currentDraft.status !== 'published' && !confirm('記事を公開しますか？一般の訪問者が読めるようになります。')) return;
  const button = $('#publish-current'); button.disabled = true;
  publishStatus.textContent = '保存して公開中…';
  try { await publishCurrent(); await loadDbDrafts(); }
  catch (error) { publishStatus.textContent = error.message || '公開に失敗しました。'; }
  finally { button.disabled = false; }
});
$('#unpublish-current').addEventListener('click', async () => {
  if (!currentDraft?.savedToDb) { publishStatus.textContent = 'まだD1に保存されていません。'; return; }
  try {
    await apiRequest(`/api/drafts/${encodeURIComponent(currentDraft.id)}/publish`,{method:'DELETE'});
    currentDraft.status='draft'; publishStatus.textContent='公開を停止しました。下書きはD1に残ります。';
    await loadDbDrafts();
  } catch (error) { publishStatus.textContent=error.message || '公開停止に失敗しました。'; }
});
$('#save-local-draft').addEventListener('click', () => {
  if (!currentDraft) return;
  currentDraft = { ...currentDraft, markdown: draftText.value };
  const drafts = storedDrafts().filter(e => e.id !== currentDraft.id);
  drafts.unshift(currentDraft);
  draftStatus.textContent = storeDrafts(drafts) ? 'この端末に保存しました。' : 'この端末には保存できませんでした。';
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
