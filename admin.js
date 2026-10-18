const $=s=>document.querySelector(s);
const enc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let products=[], nextOffset=0;
async function api(path,{method='GET',data}={}){
 const r=await fetch('/api/'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 const j=await r.json().catch(()=>({error:'応答が読み取れません'}));if(!r.ok)throw Error(j.error||`HTTP ${r.status}`);return j;
}
function msg(el,text,error=false){$(el).textContent=text;$(el).classList.toggle('error',error)}
async function overview(){
 try{
  const x=await api('admin/overview');
  const counts=Object.fromEntries(x.products.map(v=>[v.status,v.count]));
  $('#metric-published').textContent=counts.published||0;$('#metric-draft').textContent=counts.draft||0;$('#metric-hidden').textContent=counts.hidden||0;$('#metric-clicks').textContent=x.clicks30d||0;
  $('#job-history').innerHTML=x.jobs.length?x.jobs.map(j=>`<div class="draft-entry"><span class="chip ${j.state==='success'?'published':'draft'}">${enc(j.state)}</span> <strong>${enc(j.target)}：</strong>${j.accepted||0}件取込 <span class="muted-small">${enc(j.started_at)}</span><p class="muted-small">${enc(j.message||'')}</p></div>`).join(''):'履歴なし';
  renderDrafts(x.articles||[]);
  msg('#global-alert','接続中：管理者認証に成功。操作ログを記録しています。');
 }catch(e){msg('#global-alert','管理画面に接続できません：'+e.message,true);}
}
async function fetchProducts(reset=true){
 if(reset){products=[];nextOffset=0;}
 try{
  const params=new URLSearchParams({limit:'100',offset:String(nextOffset)});
  const q=$('#admin-search').value.trim();if(q)params.set('q',q);
  if($('#admin-filter').value)params.set('category',$('#admin-filter').value);
  const d=await api('admin/products?'+params);
  products.push(...d.products);nextOffset+=d.products.length;
  $('#admin-next').hidden=nextOffset>=d.total;
  $('#draft-product').innerHTML='<option value="">商品を選択</option>'+products.map(p=>`<option value="${enc(p.id)}">${enc(p.title.slice(0,70))}</option>`).join('');
  $('#admin-product-rows').innerHTML=products.length?products.map(p=>`<tr><td>${enc(p.title)}<div class="muted-small">ID ${enc(p.id)}</div></td><td>${enc(p.category_label)}</td><td>${Math.round(p.score||0)}</td><td><span class="chip ${enc(p.status)}">${enc(p.status)}</span></td><td><button class="admin-btn ${p.status==='published'?'danger':'secondary'}" data-id="${enc(p.id)}" data-status="${p.status==='published'?'hidden':'published'}">${p.status==='published'?'非公開':'公開'}</button>${p.status==='draft'?`<button class="admin-btn secondary" data-id="${enc(p.id)}" data-status="hidden">除外</button>`:''}</td></tr>`).join(''):'<tr><td colspan="5">商品はありません。まず楽天APIで取り込んでください。</td></tr>';
  document.querySelectorAll('[data-id][data-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('admin/products/'+encodeURIComponent(b.dataset.id),{method:'PATCH',data:{status:b.dataset.status}});await fetchProducts();await overview();}catch(e){alert(e.message);b.disabled=false;}});
 }catch(e){$('#admin-product-rows').innerHTML=`<tr><td colspan="5">${enc(e.message)}</td></tr>`;}
}
function renderDrafts(articles){
 const el=$('#draft-list');el.innerHTML=articles.length?articles.map(a=>`<div class="draft-entry" data-draft-id="${enc(a.id)}"><div class="tag"><span class="chip ${enc(a.status)}">${enc(a.status)}</span>　${enc(a.channel)} / ${enc(a.generation_mode)}</div><h3>${enc(a.title)}</h3><textarea aria-label="原稿を編集">${enc(a.body)}</textarea><div class="form-row"><button class="admin-btn secondary" data-action="copy">コピー</button><button class="admin-btn secondary" data-action="save">下書き保存</button><button class="admin-btn" data-action="approve">承認</button>${a.channel==='site'?'<button class="admin-btn" data-action="sitepublish">サイト公開</button>':''}${a.channel==='threads'&&a.status==='approved'?'<button class="admin-btn" data-action="threadspublish">Threads投稿</button>':''}</div></div>`).join(''):'<p class="muted-small">原稿はまだありません。</p>';
 el.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{
  const box=b.closest('[data-draft-id]'),id=box.dataset.draftId,body=box.querySelector('textarea').value,action=b.dataset.action;
  if(action==='copy'){await navigator.clipboard.writeText(body);b.textContent='コピー済み';return;}
  if(action==='threadspublish'&&!confirm('承認済み原稿をThreadsへ公開します。よろしいですか？'))return;
  b.disabled=true;
  try{
   if(action==='threadspublish')await api('admin/threads/publish/'+encodeURIComponent(id),{method:'POST'});
   else await api('admin/drafts/'+encodeURIComponent(id),{method:'PATCH',data:{body,status:({save:'draft',approve:'approved',sitepublish:'published'})[action]}});
   await overview();
  }catch(e){alert(e.message);await overview();}
 });
}
$('#sync-btn').onclick=async()=>{
 const b=$('#sync-btn');b.disabled=true;msg('#sync-msg','楽天APIへ問い合わせています…');
 try{const r=await api('admin/sync',{method:'POST',data:{category:$('#sync-category').value,page:Number($('#sync-page').value)}});msg('#sync-msg',`取得：${r.fetched}件 / 基準通過：${r.accepted}件。公開前に商品一覧で承認してください。`);await fetchProducts();await overview();}
 catch(e){msg('#sync-msg',e.message,true);}finally{b.disabled=false;}
};
$('#draft-btn').onclick=async()=>{
 const id=$('#draft-product').value;if(!id){msg('#draft-msg','先に対象商品を選択してください',true);return;}
 const b=$('#draft-btn');b.disabled=true;msg('#draft-msg','原稿を生成しています…');
 try{const x=await api('admin/drafts',{method:'POST',data:{productId:id,channel:$('#draft-channel').value}});msg('#draft-msg',`下書きを保存：${x.mode==='template'?'データテンプレート':'AI生成（要確認）'}`);await overview();}
 catch(e){msg('#draft-msg',e.message,true);}finally{b.disabled=false;}
};
$('#merge-btn').onclick=async()=>{
 const data={targetId:$('#merge-target').value.trim(),sourceId:$('#merge-source').value.trim(),confirmedSameModel:$('#merge-confirm').checked};
 if(!data.confirmedSameModel){alert('まず同一型番であることを確認してください');return;}
 if(!confirm('販売店舗を統合します。間違った製品をまとめると表示が不正確になります。続行しますか？'))return;
 try{await api('admin/merge',{method:'POST',data});alert('統合しました');await fetchProducts();await overview();}
 catch(e){alert(e.message);}
};
$('#admin-next').onclick=()=>fetchProducts(false);$('#refresh-products').onclick=()=>fetchProducts();let timer;
$('#admin-search').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>fetchProducts(),350)};
$('#admin-filter').onchange=()=>fetchProducts();
await overview();await fetchProducts();
