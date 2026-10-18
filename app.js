const $=s=>document.querySelector(s);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(n);
const ico={gadgets:'⌘',appliances:'▣',beauty:'✧',fashion:'♧',home:'⌂',pets:'♟',food:'☕',other:'⊞'};
const state={category:'',q:'',sort:'score',offset:0,limit:20,total:0,loading:false,categories:[],token:0};
async function api(path){const response=await fetch('/api/'+path);const data=await response.json();if(!response.ok)throw Error(data.error||'読み込みエラー');return data;}
function renderCategories(){
  const categories=state.categories;
  $('#category-grid').innerHTML=categories.map(c=>`<button class="category-tile" data-cat="${escapeHtml(c.id)}"><span class="cat-symbol">${ico[c.id]||'◈'}</span><span class="category-bottom"><strong>${escapeHtml(c.label)}</strong><span>↗</span></span></button>`).join('');
  $('#category-pills').innerHTML=`<button class="pill ${!state.category?'active':''}" data-cat="">すべて</button>`+categories.map(c=>`<button class="pill ${state.category===c.id?'active':''}" data-cat="${escapeHtml(c.id)}">${escapeHtml(c.label)}</button>`).join('');
  document.querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.cat;state.offset=0;renderCategories();loadProducts(true);document.getElementById('discover').scrollIntoView({behavior:'smooth'});}));
}
function card(p){
  const image=p.image_url&&p.image_url.startsWith('https://')?`<img loading="lazy" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.title)}" referrerpolicy="no-referrer">`:'<span class="cat-symbol">◈</span>';
  return `<button type="button" class="product-card" data-product="${escapeHtml(p.id)}" aria-label="${escapeHtml(p.title)}の販売店舗を見る"><div class="product-image">${image}<span class="score">独自評価 ${Math.round(p.score||0)}</span></div><div class="product-content"><span class="product-category">${escapeHtml(p.category_label||'セレクト商品')}</span><div class="product-title">${escapeHtml(p.title)}</div><div class="price-line">${p.best_price!=null?yen(p.best_price):'価格未取得'}<small>〜</small></div><div class="product-meta">${p.review_average?'★ '+Number(p.review_average).toFixed(1)+' / '+p.review_count+'件のレビュー':'レビュー情報は未確認'}</div><div class="product-action">販売店舗を比較する <span>↗</span></div></div></button>`;
}
async function loadProducts(reset=false){
  if(state.loading&&!reset)return;
  const token=++state.token;
  state.loading=true;
  const grid=$('#product-grid');
  if(reset){state.offset=0;grid.innerHTML='<div class="section-muted">商品を探しています…</div>';}
  try{
    const params=new URLSearchParams({limit:String(state.limit),offset:String(state.offset),sort:state.sort});
    if(state.category)params.set('category',state.category);
    if(state.q)params.set('q',state.q);
    const data=await api('products?'+params.toString());
    if(token!==state.token)return;
    state.total=data.total;
    if(state.offset===0)grid.innerHTML='';
    if(!data.products.length&&state.offset===0)grid.innerHTML='<div class="empty"><strong>掲載準備中です。</strong><p>承認された商品がまだありません。<br>商品登録後にこちらへ表示されます。</p></div>';
    grid.insertAdjacentHTML('beforeend',data.products.map(card).join(''));
    grid.querySelectorAll('[data-product]').forEach(el=>{if(!el.dataset.bound){el.dataset.bound='1';el.addEventListener('click',()=>openDetail(el.dataset.product));}});
    $('#results-label').textContent=`${state.total.toLocaleString()}件の商品`;
    $('#load-more').hidden=(state.offset+data.products.length>=state.total);
    if(reset){try{const stats=await api('stats');if(token===state.token)$('#updated-label').textContent=stats.lastUpdated?`最終更新：${stats.lastUpdated.replace('T',' ').slice(0,16)} UTC`:'商品情報の自動更新は準備中';}catch{}}
  }catch(e){if(token===state.token){grid.innerHTML=`<div class="error-banner">${escapeHtml(e.message)}</div>`;$('#results-label').textContent='情報を取得できません';$('#load-more').hidden=true;}}
  finally{if(token===state.token)state.loading=false;}
}
async function openDetail(id){
  const d=$('#details');
  $('#detail-content').innerHTML='<div class="section-muted">販売情報を読み込み中…</div>';d.showModal();
  try{
    const {product,offers}=await api('products/'+encodeURIComponent(id));
    const img=product.image_url&&product.image_url.startsWith('https://')?`<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.title)}">`:'';
    $('#detail-content').innerHTML=`<div class="details-top"><div>${img}</div><div><span class="product-category">${escapeHtml(product.category_label)}</span><h2 id="detail-title">${escapeHtml(product.title)}</h2><p>${escapeHtml(String(product.description||'').replace(/<[^>]*>/g,'').slice(0,260))}</p><p>独自評価 ${Math.round(product.score||0)}点 / 100点</p></div></div><div class="offers-list"><strong>購入先の比較（取得価格）</strong>${offers.length?offers.map(o=>`<div class="offer-row"><div><strong>${escapeHtml(o.shop_name)}</strong><small>${o.review_average?'★ '+o.review_average+' ('+o.review_count+'件)　':''}${o.shipping_included?'送料込み表示':'送料は要確認'} / 最終取得 ${escapeHtml((o.fetched_at||'').slice(0,10))}</small></div><div style="text-align:right"><strong>${yen(o.price)}</strong><a class="offer-buy" href="/api/out/${encodeURIComponent(o.item_code)}?src=site" target="_blank" rel="noopener noreferrer sponsored">楽天で見る ↗</a></div></div>`).join(''):'<p>在庫のある販売店舗がありません。</p>'}</div><div class="details-warning">PR：リンク経由の購入で紹介報酬を受け取る場合があります。価格・送料・在庫は楽天の販売ページで必ず確認してください。商品同一性が未確認の販売店は統合しません。</div>`;
  }catch(e){$('#detail-content').innerHTML=`<p class="error-banner">${escapeHtml(e.message)}</p>`;}
}
let timer;
$('#search').addEventListener('input',e=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=e.target.value.trim();loadProducts(true);},320);});
$('#sort').addEventListener('change',e=>{state.sort=e.target.value;loadProducts(true);});
$('#load-more').addEventListener('click',()=>{state.offset+=state.limit;loadProducts(false);});
$('#close-detail').addEventListener('click',()=>$('#details').close());
$('#details').addEventListener('click',e=>{if(e.target===$('#details'))$('#details').close();});
async function init(){
  try{const cats=await api('categories');state.categories=cats.categories||[];renderCategories();}catch{$('#category-grid').innerHTML='<div class="section-muted">カテゴリーを読み込めません</div>';}
  await loadProducts(true);
  const deep=new URLSearchParams(location.search).get('product');if(deep)openDetail(deep);
}
init();
