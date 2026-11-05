import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLatestDailyPicks, refreshDailyPicks, selectDailyTopics, canStartDailyPicksRefresh } from '../daily-picks.js';
import { FALLBACK_PICK_TOPICS } from '../fallback-picks.js';
import worker from '../worker.js';

function fakeDB() {
  const state = new Map(), queries = [];
  const DB = { prepare(sql) {
    queries.push(sql);
    let args=[];
    const statement={
      bind(...values){args=values;return statement;},
      async run(){
        if(sql.includes('CREATE TABLE'))return {meta:{changes:0}};
        if(sql.includes('INSERT INTO daily_shop_picks')){
          const [day,created,updated]=args;
          const prior=state.get(day);
          if(prior?.status==='published')return {meta:{changes:0}};
          if(prior?.status==='generating'&&Date.now()-Date.parse(prior.updated_at)<20*60*1000)return {meta:{changes:0}};
          if(prior?.status==='failed'&&Date.now()-Date.parse(prior.updated_at)<60*60*1000)return {meta:{changes:0}};
          state.set(day,{day,topics_json:'[]',status:'generating',created_at:prior?.created_at??created,updated_at:updated});
          return {meta:{changes:1}};
        }
        if(sql.includes("SET topics_json=?")){
          const [payload,updated,day]=args;
          const prior=state.get(day);
          if(prior?.status!=='generating')return {meta:{changes:0}};
          state.set(day,{...prior,topics_json:payload,updated_at:updated,status:'published'});
          return {meta:{changes:1}};
        }
        if(sql.includes("SET status='failed'")){
          const [updated,day]=args,prior=state.get(day);
          if(prior?.status==='generating')state.set(day,{...prior,status:'failed',updated_at:updated});
          return {meta:{changes:1}};
        }
        throw new Error(`Unexpected SQL run: ${sql}`);
      },
      async first(){
        if(sql.includes("WHERE day<=?"))return [...state.values()].filter(x=>x.day<=args[0]&&x.status==='published').sort((a,b)=>b.day.localeCompare(a.day))[0]??null;
        if(sql.includes('WHERE day=?'))return state.get(args[0])??null;
        throw new Error(`Unexpected SQL first: ${sql}`);
      }
    };
    return statement;
  }};
  return {DB,state,queries};
}

const envOf = db => ({...db,RAKUTEN_APP_ID:'test-app',RAKUTEN_ACCESS_KEY:'test-secret',RAKUTEN_AFFILIATE_ID:'test-aff',RAKUTEN_SITE_ORIGIN:'https://rakuten-auto-affiliate.example.com'});
const fakeRanking = async (uri,opts) => {
  const url=new URL(uri);
  assert.equal(url.origin,'https://openapi.rakuten.co.jp');
  assert.equal(url.pathname,'/ichibaranking/api/IchibaItem/Ranking/20220601');
  assert.equal(url.searchParams.get('applicationId'),'test-app');
  assert.equal(url.searchParams.has('accessKey'),false);
  assert.equal(opts.headers.accessKey,'test-secret');
  assert.equal(opts.headers.Origin,'https://rakuten-auto-affiliate.example.com');
  assert.equal(opts.headers.Referer,'https://rakuten-auto-affiliate.example.com/');
  const page=Number(url.searchParams.get('page')||'1');
  const age=Number(url.searchParams.get('age')||'0');
  const sex=Number(url.searchParams.get('sex')||'0');
  const seed=page*1000+age*100+sex*10000;
  const Items=Array.from({length:30},(_,i)=>({
    itemCode:`shop:${seed+i}`,
    itemName:`最新トレンド家電商品${seed+i} 充電対応`,
    itemPrice:1000+i*75,
    genreId:550000+(i%18),
    rank:i+1,
    itemUrl:`https://item.rakuten.co.jp/shop/${seed+i}/`
  }));
  Items[1].itemName='はちみつ お得セット';
  Items[2].itemName='腕時計 新品';
  return Response.json({Items,lastBuildDate:'2026-11-06 05:59'});
};

test('daily cron in UTC preserves the original half-hour tasks and adds Japan 06:00 trigger',()=>{
 const conf=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 assert.deepEqual(conf.triggers.crons,['*/30 * * * *','0 21 * * *']);
 assert.equal(conf.vars.RAKUTEN_SITE_ORIGIN,'https://rakuten-auto-affiliate.116kousei0428.workers.dev');
 assert.ok(readFileSync('worker.js','utf8').includes("event?.cron === '0 21 * * *'"));
 assert.ok(readFileSync('worker.js','utf8').includes("event.cron === '*/30 * * * *'"));
});

test('daily update: fresh 40 validated distinct ranked themes; no invented numbers, no repeated calls on same day',async()=>{
 const db=fakeDB(), env=envOf(db), calls=[];
 const fetcher=async(...args)=>{calls.push(args[0]);return fakeRanking(...args);};
 const result=await refreshDailyPicks(env,{date:'2026-11-06',fetcher,fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.deepEqual({ok:result.ok,count:result.count,ranked:result.ranked},{ok:true,count:40,ranked:40});
 assert.equal(calls.length,6);
 const saved=await getLatestDailyPicks(env,{date:'2026-11-06'});
 assert.equal(saved.current,true);
 assert.equal(saved.day,'2026-11-06');
 assert.equal(saved.topics.length,40);
 assert.equal(new Set(saved.topics.map(x=>x.keyword)).size,40);
 assert.ok(saved.topics.every(x=>x.basis==='楽天ランキング'&&x.reason.includes('位')));
 assert.ok(saved.topics.every(x=>!/(はちみつ|腕時計)/.test(x.name)));
 assert.ok(saved.topics.every(x=>new TextEncoder().encode(x.keyword).length<=128));
 assert.equal((await refreshDailyPicks(env,{date:'2026-11-06',fetcher})).alreadyExists,true);
 assert.equal(calls.length,6,'No extra API calls after published snapshot');
 assert.equal((await getLatestDailyPicks(env,{date:'2026-11-05'})).topics.length,0,'no future data leaks');
});

test('failed next-day upstream keeps previous published snapshot, with correct stale label',async()=>{
 const db=fakeDB(), env=envOf(db);
 const first=await refreshDailyPicks(env,{date:'2026-11-06',fetcher:fakeRanking,fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.equal(first.ok,true);
 let requests=0;
 const fail=async()=>{requests++;return new Response('denied',{status:403});};
 const outcome=await refreshDailyPicks(env,{date:'2026-11-07',fetcher:fail,fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.equal(outcome.ok,false);
 assert.equal(outcome.reason,'RANKING_REFRESH_FAILED');
 assert.equal(requests,1,'403 stops further calls to protect API access');
 const latest=await getLatestDailyPicks(env,{date:'2026-11-07'});
 assert.equal(latest.day,'2026-11-06');
 assert.equal(latest.current,false);
 assert.equal(latest.topics.length,40);
 const cooldown=await refreshDailyPicks(env,{date:'2026-11-07',fetcher:fail,fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.equal(cooldown.reason,'RETRY_COOLDOWN');
 assert.equal(requests,1);
});

test('invalid credentials and malformed origin never hit Rakuten API',async()=>{
 const db=fakeDB(); let hit=0;const fetcher=()=>{hit++;throw new Error('should not call')};
 assert.equal((await refreshDailyPicks({...db},{date:'2026-11-06',fetcher})).reason,'RANKING_SETTINGS_MISSING');
 assert.equal((await refreshDailyPicks({...envOf(db),RAKUTEN_SITE_ORIGIN:'http://example.org'},{date:'2026-11-06',fetcher})).reason,'RANKING_SETTINGS_MISSING');
 assert.equal(hit,0);
});

test('AI can reorder grounded candidates but cannot add unknown product IDs',async()=>{
 const db=fakeDB(),env=envOf(db);
 env.AI={run:async()=>({response:'{"ids":["20f:5","madeup:999","overall1:8","20f:5"]}'})};
 const result=await refreshDailyPicks(env,{date:'2026-11-06',fetcher:fakeRanking,fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.equal(result.ok,true);
 assert.equal(result.selectedByAI,true);
 const {topics}=await getLatestDailyPicks(env,{date:'2026-11-06'});
 assert.equal(topics.length,40);
 assert.ok(topics.every(t=>!t.itemCode?.includes('madeup')));
});

test('AI outage uses ranking-only fallback without breaking refresh or original daily trivia',async()=>{
 const db=fakeDB(),env=envOf(db);
 env.AI={run:async()=>{throw new Error('AI unavailable')}};
 const result=await refreshDailyPicks(env,{date:'2026-11-06',fetcher:fakeRanking,fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.equal(result.ok,true);
 assert.equal(result.selectedByAI,false);
 assert.equal((await getLatestDailyPicks(env,{date:'2026-11-06'})).topics.length,40);
});

test('small ranked set gets editorial filler explicitly labeled, never fake ranking',()=>{
 const sample=[{id:'x:0',code:'a',title:'動物用自動給水器',keyword:'動物用自動給水器',price:2000,genreId:'200',rank:1,segment:'総合'}];
 const topics=selectDailyTopics(sample,{date:'2026-11-06',fallbackTopics:FALLBACK_PICK_TOPICS});
 assert.equal(topics.length,40);
 assert.equal(topics[0].basis,'楽天ランキング');
 assert.equal(topics.filter(t=>t.basis==='編集候補').length,39);
});

test('public daily endpoint serves last completed snapshot; no DB shows empty payload; POST rejected',async()=>{
 const db=fakeDB(),env=envOf(db);
 const missing=await worker.fetch(new Request('https://shop.example/api/picks/daily'),{ASSETS:{fetch:async()=>new Response('ok')}});
 assert.equal(missing.status,200);
 assert.deepEqual((await missing.json()).topics,[]);
 assert.equal((await worker.fetch(new Request('https://shop.example/api/picks/daily',{method:'POST'}),env)).status,405);
 // A snapshot from yesterday must be reused even with the scheduled task failing today.
 const nowDate='2026-11-05';
 await refreshDailyPicks(env,{date:nowDate,fetcher:fakeRanking,fallbackTopics:FALLBACK_PICK_TOPICS});
 const response=await worker.fetch(new Request('https://shop.example/api/picks/daily'),env);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.day,nowDate);
 assert.equal(data.current,false);
 assert.equal(data.topics.length,40);
 assert.ok(!JSON.stringify(data).includes('test-secret'));
});

test('first public view bootstraps ranking asynchronously without modifying other routes',async()=>{
 const db=fakeDB(),env=envOf(db),url='https://rakuten-auto-affiliate.example.com/api/picks/daily';
 const previous=globalThis.fetch;
 let calls=0;globalThis.fetch=async(...args)=>{calls++;return fakeRanking(...args);};
 try{
  const jobs=[];
  const ctx={waitUntil(promise){jobs.push(promise)}};
  const first=await worker.fetch(new Request(url),env,ctx);
  assert.equal(first.status,200);
  assert.equal((await first.json()).topics.length,0);
  assert.equal(jobs.length,1);
  const result=await jobs[0];
  assert.equal(result.ok,true);
  assert.equal(calls,6);
  const fresh=await worker.fetch(new Request(url),env,ctx);
  assert.equal(fresh.status,200);
  assert.equal((await fresh.json()).topics.length,40);
  assert.equal(jobs.length,1,'no repeat background task after success');
 }finally{globalThis.fetch=previous;}
});

test('daily cron runs ranking update only, not Threads automation or trivia',async()=>{
 const db=fakeDB(),env=envOf(db),previous=globalThis.fetch;
 let calls=0;globalThis.fetch=async(...args)=>{calls++;return fakeRanking(...args)};
 try{
  const jobs=[];
  await worker.scheduled({cron:'0 21 * * *'},env,{waitUntil(p){jobs.push(p)}});
  assert.equal(jobs.length,1,'no unrelated scheduled tasks on the new cron');
  assert.equal((await jobs[0]).ok,true);
  assert.equal(calls,6);
 }finally{globalThis.fetch=previous;}
});


test('before 06:00 JST preserves yesterday; first-time bootstrap is allowed; current day needs no rerun',()=>{
 assert.equal(canStartDailyPicksRefresh({day:'2026-11-05',current:false},0),false);
 assert.equal(canStartDailyPicksRefresh({day:'2026-11-05',current:false},5),false);
 assert.equal(canStartDailyPicksRefresh({day:'2026-11-05',current:false},6),true);
 assert.equal(canStartDailyPicksRefresh({day:null,current:false},1),true);
 assert.equal(canStartDailyPicksRefresh({day:'2026-11-06',current:true},18),false);
});
