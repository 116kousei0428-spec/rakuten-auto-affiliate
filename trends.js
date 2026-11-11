// v37: optional, fail-closed observed search trends. Not an assertion of SNS popularity.
// The RSS feed is the public Google Trends Trending Now export for Japan.
const RSS_URL = 'https://trends.google.com/trending/rss?geo=JP';
const TABLE = `CREATE TABLE IF NOT EXISTS yodan_trend_snapshots (slot TEXT PRIMARY KEY, status TEXT NOT NULL, topics_json TEXT NOT NULL DEFAULT '[]', detail TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL)`;
const STALE_MS = 18 * 60 * 60 * 1000;
const MAX_ITEMS = 50;
const risky = /(容疑|逮捕|事件|事故|死亡|殺人|自殺|地震|津波|台風|災害|戦争|選挙|政治|病気|感染|診断|薬|訃報|倒産|障害|不倫|スキャンダル|炎上|訴訟|裁判|爆発|性的|犯罪|暴力|被害|難民|テロ)/;
const shopping = /(コスメ|メイク|美容|スキンケア|ヘアケア|香水|ファッション|服|スニーカー|靴|バッグ|カバン|財布|アクセサリー|ガジェット|スマホ|iphone|android|switch|ゲーム|イヤホン|ヘッドホン|パソコン|pc|キーボード|充電|カメラ|おもちゃ|カプセルトイ|フィギュア|グッズ|福袋|クリスマス|ハロウィン|バレンタイン|プレゼント|ギフト|インテリア|収納|掃除|キッチン|家電|加湿|暖房|扇風機|プロテイン|お菓子|食品|お弁当|コーヒー|お茶|アウトドア|キャンプ|防災|ペット|猫|犬|文具|文房具|勉強|旅行|ぬいぐるみ|推し活|日焼け|uv|乾燥|花粉|冷感|保冷|保温|マグ|水筒)/i;
const clean = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([a-f\d]+));/gi,(s,d,h)=>{
  if(d||h){const n=parseInt(d||h,h?16:10);return n>31&&n<=0x10ffff?String.fromCodePoint(n):'';}
  return ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"})[s.toLowerCase()]||s;
}).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const tag = (xml, name) => {const m=xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));return m ? clean(m[1]) : '';};
const jstDay = (date = new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function trendSlot(date = new Date()) { return `${jstDay(date)}:${Math.floor(Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}).format(date))/6)}`; }
export function parseTrendsRss(xml) {
  if (typeof xml !== 'string' || !xml.includes('<rss') || xml.length > 750000) return [];
  const results=[]; const seen=new Set();
  const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  for (const item of items.slice(0,150)) {
    const title=tag(item,'title').slice(0,100);
    if ([...title].length<2 || [...title].length>75 || risky.test(title)) continue;
    const normalized=title.toLocaleLowerCase('ja-JP').replace(/\s+/g,'');
    if(seen.has(normalized))continue;
    seen.add(normalized);
    const traffic=tag(item,'ht:approx_traffic').slice(0,30) || null;
    const published=tag(item,'pubDate');
    results.push({term:title,traffic,publishedAt:published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null, source:'Google Trends JP'});
    if(results.length>=MAX_ITEMS)break;
  }
  return results;
}
// A two-snapshot observation is a signal, never a forecast of future popularity.
function approximateTraffic(value){
  const m=String(value||'').trim().replace(/,/g,'').match(/^(\d+(?:\.\d+)?)\s*([KMB])?\+?$/i);
  if(!m)return null;
  return Number(m[1])*({K:1000,M:1000000,B:1000000000}[String(m[2]||'').toUpperCase()]||1);
}
export function annotateTrendSignals(current, previous){
  const old=Array.isArray(previous)?new Map(previous.map(x=>[String(x?.term||'').toLocaleLowerCase('ja-JP').replace(/\s+/g,''),x])):null;
  return current.map(t=>{
    if(!old)return {...t,signal:'history_missing'};
    const earlier=old.get(t.term.toLocaleLowerCase('ja-JP').replace(/\s+/g,''));
    if(!earlier)return {...t,signal:'new_in_sample'};
    const before=approximateTraffic(earlier.traffic),after=approximateTraffic(t.traffic);
    return {...t,signal:before!==null&&after!==null&&after>before?'approx_rising':'seen_before'};
  });
}
export function eligibleShoppingTrends(topics) {
  if(!Array.isArray(topics))return [];
  return topics.filter(x=>x?.term && shopping.test(x.term) && !risky.test(x.term)).slice(0,12);
}
export async function ensureTrendTable(env){
  if(!env.DB?.prepare)throw new Error('D1_MISSING');
  await env.DB.prepare(TABLE).run();
}
export async function latestTrends(env,{now=new Date()}={}) {
  await ensureTrendTable(env);
  const row=await env.DB.prepare("SELECT slot,topics_json,updated_at FROM yodan_trend_snapshots WHERE status='ready' ORDER BY updated_at DESC LIMIT 1").first();
  if(!row)return {source:'Google Trends JP',topics:[],updatedAt:null,stale:true};
  let topics=[];
  try {const parsed=JSON.parse(row.topics_json);if(Array.isArray(parsed))topics=parsed.slice(0,MAX_ITEMS).filter(t=>typeof t?.term==='string');}catch{}
  return {source:'Google Trends JP',topics,updatedAt:row.updated_at,stale:!Number.isFinite(Date.parse(row.updated_at)) || now.getTime()-Date.parse(row.updated_at)>STALE_MS};
}
export async function refreshTrends(env,{now=new Date(),fetcher=fetch}={}){
  if(!env.DB?.prepare)return {ok:false,reason:'DB_MISSING'};
  await ensureTrendTable(env);
  const slot=trendSlot(now), stamp=now.toISOString();
  // A failing feed must never block or modify the existing auto-posting loop.
  const prior=await env.DB.prepare('SELECT status,updated_at FROM yodan_trend_snapshots WHERE slot=?').bind(slot).first();
  if(prior?.status==='ready')return {ok:true,alreadyExists:true};
  if(prior && now.getTime()-Date.parse(prior.updated_at)<20*60*1000)return {ok:false,reason:'REFRESH_COOLDOWN'};
  const lock=await env.DB.prepare("INSERT INTO yodan_trend_snapshots(slot,status,topics_json,updated_at) VALUES(?,'fetching','[]',?) ON CONFLICT(slot) DO UPDATE SET status='fetching',updated_at=excluded.updated_at WHERE status!='ready' AND updated_at<?")
    .bind(slot,stamp,new Date(now.getTime()-20*60*1000).toISOString()).run();
  if(!lock.meta?.changes)return {ok:false,reason:'BUSY'};
  try{
    const res=await fetcher(RSS_URL,{headers:{Accept:'application/rss+xml,application/xml;q=0.9'},signal:AbortSignal.timeout(12000)});
    if(!res.ok)throw Error(`HTTP_${res.status}`);
    const length=Number(res.headers?.get?.('Content-Length') || 0);
    if(length>750000)throw Error('FEED_TOO_LARGE');
    const xml=await res.text();
    let topics=parseTrendsRss(xml);
    if(topics.length<1)throw Error('EMPTY_OR_INVALID_FEED');
    // Compare with the previous successful sample; no invented search-volume data.
    const previous=await env.DB.prepare("SELECT topics_json FROM yodan_trend_snapshots WHERE status='ready' ORDER BY updated_at DESC LIMIT 1").first();
    let historical=null;
    if(previous){try{const rows=JSON.parse(previous.topics_json);if(Array.isArray(rows))historical=rows;}catch{}}
    topics=annotateTrendSignals(topics,historical);
    const done=await env.DB.prepare("UPDATE yodan_trend_snapshots SET status='ready',topics_json=?,detail='',updated_at=? WHERE slot=? AND status='fetching'")
      .bind(JSON.stringify(topics),stamp,slot).run();
    if(!done.meta?.changes)throw Error('SNAPSHOT_RACE');
    return {ok:true,slot,count:topics.length,shoppingCount:eligibleShoppingTrends(topics).length};
  }catch(e){
    const reason=e instanceof Error?e.message:'UNKNOWN';
    await env.DB.prepare("UPDATE yodan_trend_snapshots SET status='failed',detail=?,updated_at=? WHERE slot=? AND status='fetching'").bind(reason.slice(0,60),stamp,slot).run();
    console.error('Trend snapshot refresh failed',{reason:reason.slice(0,60)});
    return {ok:false,reason:'TREND_FETCH_FAILED'};
  }
}
export function selectTrendKeyword(topics,seed=0){
  const options=eligibleShoppingTrends(topics);
  const ordered=[...options].sort((a,b)=>({approx_rising:0,new_in_sample:1,seen_before:2,history_missing:3}[a.signal]??3)-({approx_rising:0,new_in_sample:1,seen_before:2,history_missing:3}[b.signal]??3));
  return ordered.length?ordered[Math.abs(seed)%ordered.length].term:null;
}
export function trendCandidateScore(product,keyword){
  if(!keyword || !product?.name)return 0;
  const term=keyword.toLocaleLowerCase('ja-JP');
  const name=product.name.toLocaleLowerCase('ja-JP');
  const chunks=term.split(/[\s　/・／、]+/).map(s=>s.trim()).filter(s=>[...s].length>=2);
  return chunks.some(w=>name.includes(w)) ? 35 : 0;
}
