/**
 * v38: Independent, product-level, genre-diverse shop recommendations.
 * Keeps ranking/daily-picks/Threads untouched and preserves prior published snapshot on failure.
 * Sources: current Rakuten root genres + per-genre ranking + opt-in Google Trends snapshot.
 */
import { currentJstDay } from './daily.js';
import { latestTrends, eligibleShoppingTrends, trendCandidateScore } from './trends.js';

const ROOT_API = 'https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';
const RANKING_API = 'https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601';
const SEARCH_API = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const MODEL = '@cf/google/gemma-4-26b-a4b-it';
const TARGET = 48; // Four shelves of four columns × three rows
const GROUPS_PER_DAY = 12; // Twelve distinct genres; four items per genre across four shelves
const MAX_RANKING_GENRE_ATTEMPTS = 18; // Allow replacements for invalid/unranked genres without exhausting request budgets
const UNRANKED_ROOT_GENRES = new Set(['100000', '101114', '111427']); // Categories reported without usable top-level item rankings
const LOCK_MS = 20 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000; // Freshly deployed shelves may retry safely after an initial failure
const MAX_TREND_QUERIES = 2;
const MIN_REQUEST_GAP_MS = 1250; // Official Rakuten limit: <= one request per app ID per second
const BLOCK = /はちみつ|蜂蜜|アダルト|成人向け|タバコ|たばこ|電子タバコ|ニコチン|ビール|日本酒|焼酎|ワイン|ウイスキー|シャンパン|チューハイ|ふるさと納税|商品券|金券|ギフトカード|医薬品|処方箋|処方薬|ダイエットサプリ|CBD|THC|大麻|銃|エアガン|刃物|殺虫剤|農薬|宝くじ|競馬|パチンコ/i;
const BLOCK_GENRE = /ふるさと納税|医薬品|医療|アダルト|タバコ|酒類|ビール|ワイン|日本酒|焼酎|ウイスキー|サービス|旅行・出張|チケット|金券|ギフトカード|電子書籍|ダウンロード|投資|保険/i;
const norm = v => String(v ?? '').normalize('NFKC').replace(/\s+/g,' ').trim();
const secret = v => typeof v === 'string' ? v.trim().replace(/^("|')(.*)\1$/,'$2').trim() : '';
const keyOf = name => norm(name).toLowerCase().replace(/[\s!！★☆・。、［］\[\]（）()【】\-‐−_]/g,'').slice(0,28);
const validDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const validUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
function cleanImage(entry) {
  const img = entry?.mediumImageUrls?.[0] || entry?.smallImageUrls?.[0];
  return validUrl(typeof img === 'string' ? img : img?.imageUrl);
}
function safeOrigin(value) {
  try { const u = new URL(value); return u.protocol==='https:' && u.pathname==='/' && !u.search && !u.hash && !u.username && !u.password ? u.origin : null; }
  catch { return null; }
}
function rankScore(p) {
  const rankPart = Number.isInteger(p.rank) ? Math.max(0, 60 - p.rank * 2.0) : 8;
  const reviewPart = p.reviews >= 10 && p.rating >= 1 && p.rating <= 5 ? Math.min(15, Math.log10(p.reviews + 1) * p.rating * 1.8) : 0;
  const pricePart = p.price >= 300 && p.price <= 30000 ? 5 : 0;
  return rankPart + reviewPart + pricePart + (p.isTrend ? 7 : 0);
}
export function parseRootGenres(payload) {
  const children = Array.isArray(payload?.children) ? payload.children : [];
  return children.map(x => x?.genre ?? x?.child ?? x).map(x => ({id:String(x?.genreId ?? ''),name:norm(x?.nameJa || x?.jaName)}))
    .filter(x => /^\d{2,9}$/.test(x.id) && x.name && !BLOCK_GENRE.test(x.name) && !UNRANKED_ROOT_GENRES.has(x.id));
}
function productFromEntry(source, group, isTrend, index, term) {
  const p = source?.Item ?? source?.item ?? source;
  const name = norm(p?.itemName).slice(0,130), url = validUrl(p?.affiliateUrl || p?.itemUrl);
  const price = Number(String(p?.itemPrice ?? '').replace(/[,円¥￥\s]/g,''));
  const rank = Number(p?.rank);
  const code = norm(p?.itemCode);
  const image = cleanImage(p);
  if (!name || name.length < 5 || !url || !Number.isFinite(price) || price <= 0 || BLOCK.test(name)) return null;
  if (isTrend && !trendCandidateScore({name}, term)) return null;
  const rating = Number(p?.reviewAverage) || 0;
  const reviews = Number(p?.reviewCount) || 0;
  const item = {id:`${group.id}:${code || index}`,code:code || `${group.id}:${keyOf(name)}`,name,
    price:Math.round(price),url,image,shop:norm(p?.shopName).slice(0,60),genre:group.name,
    categoryId:group.id,isTrend:Boolean(isTrend),trendTerm:isTrend?term:null,
    rank:!isTrend && Number.isInteger(rank)&&rank>0&&rank<=1000?rank:null,
    rating,reviews};
  item.score = rankScore(item);
  return item;
}
function canonical(items) {
  const codes = new Set(), titles = new Set(), unique=[];
  for(const p of items){
    const title=keyOf(p.name);
    if(codes.has(p.code) || titles.has(title))continue;
    codes.add(p.code);titles.add(title);unique.push(p);
  }
  return unique;
}
/** Select individually vetted products; each shelf uses a broad mix of genres. */
export function pickDiversifiedProducts(groups, {limit=TARGET, aiIds=[]} = {}) {
  const aiPreference = new Map([...new Set(aiIds.map(String))].map((id,i)=>[id,i]));
  const pools = groups.map(g => ({...g, queue:canonical((g.items || []).filter(p=>p.name&&p.url&&p.price>0))
    .sort((a,b)=>{
      const aAI=aiPreference.has(a.id), bAI=aiPreference.has(b.id);
      if(aAI!==bAI)return aAI?-1:1;
      return aAI?aiPreference.get(a.id)-aiPreference.get(b.id):b.score-a.score;
    })}));
  const overall = [], usedCodes=new Set(), usedTitles=new Set(), useCounts=new Map();
  const shelfCount = Math.ceil(limit/12);
  for(let shelf=0;shelf<shelfCount;shelf++){
    const current=[], usedCategories=new Set(), usedShops=new Map();
    let passes=0;
    while(current.length<12 && overall.length<limit && passes++<3){
      // Rotate the starting genre, so consecutive shelves do not carry the same category order.
      const ordered=pools.slice().sort((a,b)=>{
        const ax=(pools.indexOf(a)+shelf*5)%Math.max(1,pools.length);
        const bx=(pools.indexOf(b)+shelf*5)%Math.max(1,pools.length);
        return ax-bx;
      });
      let added=false;
      for(const group of ordered){
        if(current.length>=12 || overall.length>=limit)break;
        if(passes<3 && usedCategories.has(group.id))continue;
        if((useCounts.get(group.id)||0)>=4)continue;
        const index=group.queue.findIndex(item => !usedCodes.has(item.code)&&!usedTitles.has(keyOf(item.name)) &&
          (!item.shop || (usedShops.get(item.shop)||0)<(passes<3?1:2)));
        if(index<0)continue;
        const [item]=group.queue.splice(index,1);
        usedCodes.add(item.code);usedTitles.add(keyOf(item.name));usedCategories.add(group.id);
        usedShops.set(item.shop,(usedShops.get(item.shop)||0)+1);
        useCounts.set(group.id,(useCounts.get(group.id)||0)+1);
        current.push({...item,reason:item.isTrend
          ? `Google Trendsの検索語「${item.trendTerm}」に関連する商品候補。商品自体の流行・販売数は未確認。`
          : `楽天「${item.genre}」ランキング${item.rank}位（取得時）。ジャンルを分散して選定。`});
        added=true;
      }
      if(!added)break;
    }
    overall.push(...current);
  }
  return overall.slice(0,limit);
}
export async function ensureRecommendedTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS yodan_recommended_shelves (
    day TEXT PRIMARY KEY, products_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
}
export async function getLatestRecommended(env,{date=currentJstDay()}={}) {
  const empty={items:[],day:null,updatedAt:null,current:false,pending:true,source:'楽天ジャンル別ランキング・Google検索トレンド（任意）'};
  if(!validDay(date)||!env.DB?.prepare)return {...empty,pending:false};
  await ensureRecommendedTable(env);
  const row=await env.DB.prepare("SELECT day,products_json,updated_at FROM yodan_recommended_shelves WHERE day<=? AND status='published' ORDER BY day DESC LIMIT 1").bind(date).first();
  if(!row){
    const attempt=await env.DB.prepare('SELECT status,updated_at,products_json FROM yodan_recommended_shelves WHERE day=?').bind(date).first();
    let failureCode=null, failureStage=null, providerErrorCode=null, parameterHint=null, affectedGenreId=null;
    if(attempt?.status==='failed'){
      try{
        const d=JSON.parse(attempt.products_json);
        failureCode=d?.errorCode||'RECOMMENDATION_FAILED';
        failureStage=d?.stage||null;
        providerErrorCode=d?.providerErrorCode||null;
        parameterHint=d?.parameterHint||null;
        affectedGenreId=d?.affectedGenreId||null;
      }catch{failureCode='RECOMMENDATION_FAILED';}
    }
    return {...empty,pending:attempt?.status!=='failed',status:attempt?.status||'not_started',failureCode,failureStage,providerErrorCode,parameterHint,affectedGenreId,updatedAt:attempt?.updated_at||null};
  }
  try{
    const items=JSON.parse(row.products_json);
    if(!Array.isArray(items)||items.length<12||items.length>TARGET||items.some(x=>!x?.name||!x?.url||!x?.genre))return empty;
    return {items,day:row.day,updatedAt:row.updated_at,current:row.day===date,pending:row.day!==date,source:empty.source};
  }catch{return empty;}
}
// v39.1: capture only a whitelisted diagnosis for HTTP 400. Do not expose a URL,
// credentials, headers, raw provider messages, or arbitrary response-body text.
function rakuten400Diagnostic(body,stage,genreId){
  const errorCode=typeof body?.error==='string' && /^[a-z][a-z0-9_]{1,40}$/.test(body.error) ? body.error : null;
  const desc=typeof body?.error_description==='string'?body.error_description:'';
  const hints=[['applicationId','APP_ID'],['accessKey','ACCESS_KEY'],['affiliateId','AFFILIATE_ID'],
    ['genreId','GENRE_ID'],['keyword','KEYWORD'],['formatVersion','FORMAT_VERSION'],
    ['format','FORMAT'],['hits','HITS'],['page','PAGE']];
  const hint=hints.find(([field])=>new RegExp(`\\b${field}\\b`,'i').test(desc))?.[1]||null;
  return {stage,providerErrorCode:errorCode,parameterHint:hint,
    affectedGenreId:/^\d{2,9}$/.test(String(genreId||''))?String(genreId):null};
}
async function requestJson(fetcher,endpoint,params,headers,stage,genreId=null) {
  const res=await fetcher(`${endpoint}?${params}`,{method:'GET',headers,signal:AbortSignal.timeout(12000)});
  if(res.status===429)throw Error('RAKUTEN_RATE_LIMIT_429');
  if(res.status===403)throw Error('RAKUTEN_FORBIDDEN_403');
  if(res.status===400){
    let upstream=null;
    try{upstream=await res.json();}catch{/* Unparseable upstream response: do not echo raw content. */}
    const diagnostic=rakuten400Diagnostic(upstream,stage,genreId);
    const e=new Error(`RAKUTEN_${stage}_HTTP_400${diagnostic.parameterHint?'_'+diagnostic.parameterHint:''}`);
    e.shelfDiagnostic=diagnostic;
    throw e;
  }
  if(!res.ok)throw Error(`RAKUTEN_API_HTTP_${res.status}`);
  const body=await res.json();
  return body?.error || body?.errors ? null : body;
}
function normalizeAiIds(value, valid) {
  const str=typeof value?.response==='string'?value.response:typeof value?.result?.response==='string'?value.result.response:'';
  const match=str.match(/\{[\s\S]*?\}/);
  if(!match)return [];
  try{return [...new Set(JSON.parse(match[0]).ids.map(String))].filter(id=>valid.has(id)).slice(0,TARGET);}catch{return [];}
}
async function aiCurate(env,groups) {
  if(!env.AI?.run)return [];
  try{
    const shortlist=groups.flatMap(g => [...g.items].sort((a,b)=>b.score-a.score).slice(0,4));
    const result=await env.AI.run(MODEL,{messages:[
      {role:'system',content:'あなたはECの編集担当。渡された実在の商品候補のIDだけを選ぶ。商品ごとの名称・価格・レビュー・ジャンルと、根拠のある順位を比較。宣伝文句や未確認の流行を創作しない。特定ジャンル・店舗に偏らない。妥当な商品のIDを良い順に最大48件、JSON {"ids":[...]} のみで返す。'},
      {role:'user',content:JSON.stringify(shortlist.map(p=>({id:p.id,name:p.name.slice(0,55),category:p.genre,rank:p.rank,price:p.price,reviews:p.reviews,rating:p.rating,trendKeyword:p.trendTerm})))}
    ],temperature:0.2,max_completion_tokens:1000,chat_template_kwargs:{enable_thinking:false}});
    return normalizeAiIds(result,new Set(shortlist.map(p=>p.id)));
  }catch{console.error('Shop shelf AI selection unavailable; ranked diversity fallback');return [];}
}
export async function refreshRecommended(env,{date=currentJstDay(),origin=env.RAKUTEN_SITE_ORIGIN,fetcher=fetch,now=new Date(),pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  if(!validDay(date)||!env.DB?.prepare)return {ok:false,reason:'DB_UNAVAILABLE'};
  const app=secret(env.RAKUTEN_APP_ID),accessKey=secret(env.RAKUTEN_ACCESS_KEY),affiliate=secret(env.RAKUTEN_AFFILIATE_ID),allowedOrigin=safeOrigin(origin);
  if(!app||!accessKey||!allowedOrigin)return {ok:false,reason:'RAKUTEN_SETTINGS_MISSING'};
  await ensureRecommendedTable(env);
  const old=await env.DB.prepare('SELECT status,updated_at FROM yodan_recommended_shelves WHERE day=?').bind(date).first();
  if(old?.status==='published')return {ok:true,alreadyExists:true};
  const elapsed=old?.updated_at?now.getTime()-Date.parse(old.updated_at):Infinity;
  if(old?.status==='generating'&&elapsed<LOCK_MS)return {ok:false,reason:'BUSY'};
  if(old?.status==='failed'&&elapsed<RETRY_MS)return {ok:false,reason:'RETRY_COOLDOWN'};
  const stamp=now.toISOString();
  const lock=await env.DB.prepare("INSERT INTO yodan_recommended_shelves(day,products_json,status,created_at,updated_at) VALUES(?,'[]','generating',?,?) ON CONFLICT(day) DO UPDATE SET status='generating',updated_at=excluded.updated_at WHERE status!='published' AND (status!='generating' OR updated_at<?) AND (status!='failed' OR updated_at<?)")
    .bind(date,stamp,stamp,new Date(now.getTime()-LOCK_MS).toISOString(),new Date(now.getTime()-RETRY_MS).toISOString()).run();
  if(!lock.meta?.changes)return {ok:false,reason:'BUSY'};
  try{
    // A single refresh can issue several different Rakuten API requests.
    // Never launch a parallel burst: application IDs are limited to one request/second.
    let lastRequestAt=null;
    const pacedRequest=async(endpoint,params,headers,stage,genreId=null)=>{
      const started=Date.now();
      if(lastRequestAt!==null){
        const delay=Math.max(0,MIN_REQUEST_GAP_MS-(started-lastRequestAt));
        if(delay)await pause(delay);
      }
      lastRequestAt=Date.now();
      return requestJson(fetcher,endpoint,params,headers,stage,genreId);
    };
    const headers={Accept:'application/json',accessKey,Origin:allowedOrigin,Referer:`${allowedOrigin}/`};
    const params=new URLSearchParams({format:'json',formatVersion:'2',applicationId:app,genreId:'0'});
    const root=await pacedRequest(ROOT_API,params,headers,'GENRE_ROOT');
    if(!root)throw Error('GENRE_ROOT_UNAVAILABLE');
    const allGenres=parseRootGenres(root);
    if(allGenres.length<12)throw Error('NOT_ENOUGH_GENRES');
    // Vary which first-level categories are represented from one day to the next.
    const daySeed=Number(date.replaceAll('-',''));
    const offset = daySeed % allGenres.length;
    // Rotate through different categories and keep spare categories for failed/unranked ones.
    // In particular, a valid genre in Genre Search may have no usable Ranking API feed.
    const candidateCount=Math.min(allGenres.length,MAX_RANKING_GENRE_ATTEMPTS);
    const genres=Array.from({length:candidateCount},(_,i)=>
      allGenres[(Math.floor(i*allGenres.length/candidateCount)+offset)%allGenres.length]);
    const groups=[];
    let firstGenreFailure=null;
    for(const genre of genres){
      if(groups.length>=GROUPS_PER_DAY)break;
      const params=new URLSearchParams({format:'json',formatVersion:'2',applicationId:app,genreId:genre.id});
      if(affiliate)params.set('affiliateId',affiliate);
      let body;
      try{body=await pacedRequest(RANKING_API,params,headers,'GENRE_RANKING',genre.id);}
      catch(e){
        const code=String(e?.message||'');
        const hint=e?.shelfDiagnostic?.parameterHint;
        if((code.startsWith('RAKUTEN_GENRE_RANKING_HTTP_400') && (hint===null || hint==='GENRE_ID')) || code==='RAKUTEN_API_HTTP_404'){
          if(!firstGenreFailure)firstGenreFailure=e;
          // This category is not rankable. Other categories can still produce a real shelf.
          continue;
        }
        throw e; // invalid credentials, forbidden access, rate limiting, or other unexpected provider errors
      }
      if(!body)continue;
      const entries=Array.isArray(body.Items)?body.Items:Array.isArray(body.items)?body.items:[];
      const items=canonical(entries.map((item,i)=>productFromEntry(item,genre,false,i,null)).filter(x=>x&&x.rank)).sort((a,b)=>b.score-a.score).slice(0,9);
      if(items.length)groups.push({...genre,items});
    }
    if(groups.length<6 && firstGenreFailure)throw firstGenreFailure; // retain the original provider diagnostics
    // Reuse the v37 opt-in trend snapshot; never hit public social APIs or guess a trend.
    let trends=null;
    try{
      const extra=await env.DB.prepare('SELECT trend_enabled FROM yodan_auto_extras WHERE id=1').first();
      if(extra?.trend_enabled===1)trends=await latestTrends(env);
    }catch{/* old deployments without v37 table continue with normal genres */}
    if(trends&&!trends.stale){
      const ranked=eligibleShoppingTrends(trends.topics).sort((a,b)=>
        ({approx_rising:0,new_in_sample:1,seen_before:2,history_missing:3}[a.signal]??3)-
        ({approx_rising:0,new_in_sample:1,seen_before:2,history_missing:3}[b.signal]??3));
      let added=0;
      for(const t of ranked){
        if(added>=MAX_TREND_QUERIES)break;
        if(new TextEncoder().encode(t.term).length>128)continue;
        const params=new URLSearchParams({format:'json',formatVersion:'2',applicationId:app,keyword:t.term,hits:'20'});
        if(affiliate)params.set('affiliateId',affiliate);
        let body;
        try{body=await pacedRequest(SEARCH_API,params,headers,'TREND_SEARCH');}catch(e){if(String(e.message).startsWith('RAKUTEN_'))throw e;continue;}
        if(!body)continue;
        const entries=Array.isArray(body.Items)?body.Items:Array.isArray(body.items)?body.items:[];
        const group={id:`trend${added}`,name:`検索トレンド関連：${t.term}`};
        const items=canonical(entries.map((item,i)=>productFromEntry(item,group,true,i,t.term)).filter(Boolean)).sort((a,b)=>b.score-a.score).slice(0,6);
        if(items.length){groups.push({...group,items});added++;}
      }
    }
    if(groups.length<6)throw Error('INSUFFICIENT_CATEGORIES');
    const aiIds=await aiCurate(env,groups);
    const items=pickDiversifiedProducts(groups,{aiIds});
    if(items.length<12)throw Error('INSUFFICIENT_PRODUCTS');
    const updated=await env.DB.prepare("UPDATE yodan_recommended_shelves SET products_json=?,status='published',updated_at=? WHERE day=? AND status='generating'")
      .bind(JSON.stringify(items),new Date().toISOString(),date).run();
    if(!updated.meta?.changes)throw Error('PUBLISH_RACE');
    return {ok:true,day:date,count:items.length,genres:new Set(items.map(p=>p.categoryId)).size,trends:items.filter(p=>p.isTrend).length,selectedByAI:aiIds.length>0};
  }catch(e){
    const errorCode=(e instanceof Error?e.message:'UNKNOWN').replace(/[^A-Z0-9_]/g,'').slice(0,55)||'UNKNOWN';
    const diagnostic=e?.shelfDiagnostic||{};
    await env.DB.prepare("UPDATE yodan_recommended_shelves SET products_json=?,status='failed',updated_at=? WHERE day=? AND status='generating'")
      .bind(JSON.stringify({errorCode,...diagnostic}),new Date().toISOString(),date).run();
    console.error('Recommended shelf refresh failed',{reason:errorCode,
      stage:diagnostic.stage||null,providerErrorCode:diagnostic.providerErrorCode||null,
      parameterHint:diagnostic.parameterHint||null,affectedGenreId:diagnostic.affectedGenreId||null});
    return {ok:false,reason:'RECOMMENDATION_REFRESH_FAILED'};
  }
}
