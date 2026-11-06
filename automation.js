import { generateNarrative } from './threads-story-ai.js';
// Yodan Shoten v22: server-side opt-in Threads automation.
// The existing v21 generation and posting endpoints remain the source of truth.
const SCHEMA = `CREATE TABLE IF NOT EXISTS yodan_auto_settings (id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL DEFAULT 0,daily_target INTEGER NOT NULL DEFAULT 20,updated_at TEXT NOT NULL)`;
const JOBS = `CREATE TABLE IF NOT EXISTS yodan_auto_jobs (slot TEXT PRIMARY KEY,product_key TEXT,article_id TEXT,status TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const PICKS = `CREATE TABLE IF NOT EXISTS yodan_auto_products (product_key TEXT PRIMARY KEY,article_id TEXT NOT NULL,selected_at TEXT NOT NULL)`;
const MAX_TARGET=48; // 30-minute cron has at most 48 opportunities per day.
const keywords=['生活雑貨','家電','キッチン用品','収納','文房具','アウトドア','インテリア','美容用品','ペット用品','ファッション','スマホアクセサリー','食品','スポーツ用品','ホビー','防災用品','育児用品'];
const iso=()=>new Date().toISOString();
const japanParts=(date=new Date())=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
};
export async function ensureAutomationTables(env){
  if(!env.DB?.prepare) throw new Error('D1_MISSING');
  for(const sql of [SCHEMA,JOBS,PICKS]) await env.DB.prepare(sql).run();
  await env.DB.prepare("INSERT OR IGNORE INTO yodan_auto_settings (id,enabled,daily_target,updated_at) VALUES (1,0,20,?)").bind(iso()).run();
}
export async function automationStatus(env){
  await ensureAutomationTables(env);
  const settings=await env.DB.prepare('SELECT enabled,daily_target,updated_at FROM yodan_auto_settings WHERE id=1').first();
  const today=japanParts().date;
  const logs=await env.DB.prepare('SELECT slot,status,article_id,detail,updated_at FROM yodan_auto_jobs ORDER BY created_at DESC LIMIT 50').all();
  const todayJobs=(logs.results||[]).filter(x=>x.slot.startsWith(today));
  return {enabled:settings.enabled===1,dailyTarget:settings.daily_target,updatedAt:settings.updated_at,today,successToday:todayJobs.filter(x=>x.status==='published').length,logs:logs.results||[],imageAutoAttach:false};
}
export async function automationApi(request,env,execute){
  if(request.method==='GET')return Response.json(await automationStatus(env));
  if(request.method!=='PUT' && request.method!=='POST')return Response.json({error:'Method not allowed'}, {status:405});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return Response.json({error:'JSON required'},{status:415});
  let body;
  try{const raw=await request.text();if(raw.length>1000)return Response.json({error:'Too large'},{status:413});body=JSON.parse(raw);}catch{return Response.json({error:'Invalid JSON'},{status:400});}
  if(request.method==='PUT'){
    if(typeof body?.enabled!=='boolean' || !Number.isInteger(body.dailyTarget)||body.dailyTarget<1||body.dailyTarget>MAX_TARGET)
      return Response.json({error:`投稿数は1〜${MAX_TARGET}件、ON/OFFは真偽値で指定してください。`},{status:400});
    await ensureAutomationTables(env);
    await env.DB.prepare('UPDATE yodan_auto_settings SET enabled=?,daily_target=?,updated_at=? WHERE id=1').bind(body.enabled?1:0,body.dailyTarget,iso()).run();
    return Response.json(await automationStatus(env));
  }
  // Explicit test-run action; never bypasses the OFF switch.
  if(body?.action!=='runOnce')return Response.json({error:'Unsupported action'},{status:400});
  const result=await runAutomation(env,execute,{manual:true});
  return Response.json(result,{status:result.ok?200:409});
}
const productKey=(p)=>String(p.code||p.url||'').slice(0,400);
const validProduct=p=>p&&typeof p.name==='string'&&p.name.length>4&&p.name.length<160&&typeof p.url==='string'&&/^https:\/\/(?:[^/]+\.)?rakuten\.co\.jp\//.test(p.url)&&Number.isFinite(p.price)&&p.price>0;
const selectScore=(p)=>{
  const price=p.price;
  const priceScore=price>=1000&&price<=15000?20:price<=30000?12:5;
  const detailScore=Math.min(20,Math.floor((p.caption||'').length/35));
  return priceScore+detailScore+((p.rank&&p.rank<=10)?30:(p.rank?15:0));
};
async function internalJson(execute, origin, path, init={}) {
  const req=new Request(new URL(path,origin),{...init,headers:{Origin:origin,...(init.headers||{})}});
  const res=await execute(req);
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(`INTERNAL_${res.status}_${String(data.errorCode||'ERROR').slice(0,60)}`);
  return data;
}
export async function runAutomation(env,execute,{manual=false}={}){
  await ensureAutomationTables(env);
  const settings=await env.DB.prepare('SELECT enabled,daily_target FROM yodan_auto_settings WHERE id=1').first();
  if(settings.enabled!==1)return {ok:false,reason:'DISABLED'};
  // A verified public origin must be configured. Never guess a deployed hostname.
  let origin;
  try{origin=new URL(env.AUTO_PUBLIC_ORIGIN).origin;if(!origin.startsWith('https://'))throw Error();}catch{return {ok:false,reason:'AUTO_PUBLIC_ORIGIN_MISSING'};}
  if(!env.AI_ADMIN_TOKEN || !env.THREADS_ACCESS_TOKEN || !env.AI || !env.DB)return {ok:false,reason:'SECRETS_OR_BINDINGS_MISSING'};
  const jp=japanParts();
  const dailyTarget=Math.min(MAX_TARGET,settings.daily_target);
  const due=Math.ceil((Math.floor(jp.minutes/30)+1)*dailyTarget/48);
  if(!manual && due<=0)return {ok:true,reason:'NOT_DUE'};
  const todayCount=await env.DB.prepare("SELECT COUNT(*) AS cnt FROM yodan_auto_jobs WHERE slot>=? AND slot<? AND status IN ('claimed','article_ready','sending','published','uncertain','failed')").bind(jp.date,jp.date+'~').first();
  if(Number(todayCount?.cnt||0)>=dailyTarget)return {ok:true,reason:'DAILY_LIMIT'};
  if(!manual && Number(todayCount?.cnt||0)>=due)return {ok:true,reason:'NOT_DUE'};
  // One slot per cron window, reserved atomically before calling any external service.
  const slot=`${jp.date}:${String(Math.floor(jp.minutes/30)).padStart(2,'0')}`;
  const now=iso();
  const claimed=await env.DB.prepare("INSERT OR IGNORE INTO yodan_auto_jobs (slot,status,created_at,updated_at) VALUES (?,'claimed',?,?)").bind(slot,now,now).run();
  if((claimed.meta?.changes??0)!==1)return {ok:true,reason:'SLOT_ALREADY_CLAIMED'};
  let articleId=null, key=null;
  const mark=async (status,detail='')=>env.DB.prepare('UPDATE yodan_auto_jobs SET status=?,detail=?,product_key=?,article_id=?,updated_at=? WHERE slot=?').bind(status,detail,key,articleId,iso(),slot).run();
  try{
    // Rotate through categories; ranking is also consulted for sales popularity.
    const word=keywords[(jp.minutes/30+Number(jp.date.slice(-2)))%keywords.length|0];
    const responses=await Promise.allSettled([
      internalJson(execute,origin,'/api/picks/ranking'),
      internalJson(execute,origin,`/api/search?keyword=${encodeURIComponent(word)}`)
    ]);
    const candidates=responses.flatMap(r=>r.status==='fulfilled'?(r.value.items||[]):[]).filter(validProduct);
    const recent=await env.DB.prepare("SELECT product_key FROM yodan_auto_products WHERE selected_at>=?").bind(new Date(Date.now()-30*86400000).toISOString()).all();
    const blocked=new Set((recent.results||[]).map(x=>x.product_key));
    // Prices and ranking are observable signals; external trend popularity is NOT verified.
    const available=candidates.filter(p=>!blocked.has(productKey(p))).sort((a,b)=>selectScore(b)-selectScore(a));
    if(!available.length)throw new Error('NO_ELIGIBLE_PRODUCTS');
    const p=available[0];key=productKey(p);
    articleId=crypto.randomUUID();
    // Unique product reservation prevents a second automation from selecting it.
    const reserved=await env.DB.prepare('INSERT INTO yodan_auto_products (product_key,article_id,selected_at) VALUES (?,?,?) ON CONFLICT(product_key) DO UPDATE SET article_id=excluded.article_id,selected_at=excluded.selected_at WHERE yodan_auto_products.selected_at < ?').bind(key,articleId,iso(),new Date(Date.now()-30*86400000).toISOString()).run();
    if((reserved.meta?.changes??0)!==1)throw new Error('PRODUCT_ALREADY_RESERVED');
    const headers={'Content-Type':'application/json','X-Admin-Token':env.AI_ADMIN_TOKEN};
    const generated=await internalJson(execute,origin,'/api/articles/generate',{method:'POST',headers,body:JSON.stringify({item:p,tone:'標準'})});
    const title=generated.title,markdown=generated.markdown;
    if(!title || !markdown || !markdown.includes('アフィリエイト広告'))throw new Error('INVALID_ARTICLE');
    const ts=iso();
    // Commit both a saved draft and a public snapshot (same as v21 publication semantics).
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS article_drafts (id TEXT PRIMARY KEY,title TEXT NOT NULL,markdown TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft' CHECK(status='draft'),created_at TEXT NOT NULL,updated_at TEXT NOT NULL)").run();
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS article_publications (id TEXT PRIMARY KEY,title TEXT NOT NULL,markdown TEXT NOT NULL,published_at TEXT NOT NULL,updated_at TEXT NOT NULL)').run();
    await env.DB.prepare("INSERT INTO article_drafts (id,title,markdown,status,created_at,updated_at) VALUES (?,?,?,'draft',?,?)").bind(articleId,title,markdown,ts,ts).run();
    await env.DB.prepare('INSERT INTO article_publications (id,title,markdown,published_at,updated_at) VALUES (?,?,?,?,?)').bind(articleId,title,markdown,ts,ts).run();
    await mark('article_ready');
    const pageUrl=`${origin}/articles/${articleId}`;
    // Automated Threads posts use the same product-specific AI narrative as manual posts.
    // No generic shopping-tip fallback: if generation fails, do NOT publish filler.
    const text=await generateNarrative({
      env,title:p.name,markdown,articleUrl:pageUrl,isPromotion:true,
      verifiedFact:typeof generated.verifiedStoryFact==='string'?generated.verifiedStoryFact:'',previousBody:''
    });
    if(!text)throw new Error('POST_TOO_LONG');
    if([...text].length>500)throw new Error('POST_TOO_LONG');
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS threads_posts (article_id TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT \'draft\',container_id TEXT,external_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,published_at TEXT)').run();
    await env.DB.prepare("INSERT INTO threads_posts (article_id,body,status,created_at,updated_at) VALUES (?,?,'draft',?,?)").bind(articleId,text,ts,ts).run();
    await mark('sending');
    // Auto images remain disabled unless per-image rights and distribution authorization are verifiable.
    // The existing manual publish flow still supports individually confirmed image permissions.
    const posted=await internalJson(execute,origin,`/api/social/threads/${articleId}/publish`,{method:'POST',headers,body:JSON.stringify({attachImage:false})});
    if(posted.status!=='published')throw new Error('UNCONFIRMED_POST');
    await mark('published',String(posted.postId||''));
    return {ok:true,status:'published',slot,articleId};
  }catch(e){
    const code=e instanceof Error?e.message:'UNKNOWN';
    // Unknown outbound outcomes must never be retried automatically.
    await mark(code.includes('THREADS')||code.includes('INTERNAL_502')?'uncertain':'failed',code.slice(0,150));
    console.error('v22 auto job failed',{code:code.slice(0,70)});
    return {ok:false,status:'failed',reason:code.slice(0,90),slot};
  }
}
