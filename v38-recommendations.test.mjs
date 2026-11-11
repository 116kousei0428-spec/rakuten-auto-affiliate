import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRootGenres, pickDiversifiedProducts, refreshRecommended, getLatestRecommended} from '../recommended-shelf.js';
import worker from '../worker.js';

const root = {children: Array.from({length:24},(_,i)=>({genreId:String(100000+i),nameJa:`ジャンル${i+1}`}))};
const productsFor = n => Array.from({length:20},(_,i)=>({
  itemCode:`shop${n}:${i}`,itemName:`商品 ${n} タイプ ${i} 実在確認対象`,itemPrice:1000+i*100,rank:i+1,
  itemUrl:`https://item.rakuten.co.jp/shop${n}/${i}/`,mediumImageUrls:[{imageUrl:`https://thumbnail.image.rakuten.co.jp/x/${n}/${i}.jpg`}],
  shopName:`店舗${n}`,genreId:n,reviewCount:20,reviewAverage:4.2
}));
const fakeFetch = async (url,{headers})=>{
  const q=new URL(url), genre=q.searchParams.get('genreId');
  assert.equal(headers.accessKey,'secret');
  assert.equal(q.searchParams.has('accessKey'),false,'no secret in query');
  if(q.pathname.includes('IchibaGenre'))return Response.json(root);
  if(q.pathname.includes('IchibaItem/Ranking'))return Response.json({Items:productsFor(genre)});
  if(q.pathname.includes('IchibaItem/Search'))return Response.json({Items:[]});
  throw Error('unexpected API: '+q.pathname);
};
function fakeDb(){
 const records=new Map();return {
  records,DB:{prepare(sql){let bind=[];const st={bind(...args){bind=args;return st;},async first(){
    if(sql.includes('WHERE day<=?'))return [...records.values()].filter(x=>x.day<=bind[0]&&x.status==='published').sort((a,b)=>b.day.localeCompare(a.day))[0]||null;
    if(sql.includes('WHERE day=?'))return records.get(bind[0])||null;
    if(sql.includes('FROM yodan_auto_extras'))return {trend_enabled:0};
    throw Error('unexpected first '+sql);
  },async run(){
    if(sql.startsWith('CREATE TABLE'))return {meta:{changes:0}};
    if(sql.startsWith('INSERT INTO yodan_recommended_shelves')){
      const [day,created,updated]=bind,old=records.get(day);
      if(old?.status==='published'||old?.status==='generating'&&Date.now()-Date.parse(old.updated_at)<20*60*1000||old?.status==='failed'&&Date.now()-Date.parse(old.updated_at)<60*60*1000)return {meta:{changes:0}};
      records.set(day,{day,products_json:'[]',status:'generating',created_at:created,updated_at:updated});return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE yodan_recommended_shelves')){
      const success=sql.includes("status='published'"),[products,updated,day]=bind;
      const old=records.get(day);if(!old||old.status!=='generating')return {meta:{changes:0}};
      records.set(day,{...old,status:success?'published':'failed',products_json:products,updated_at:updated});return {meta:{changes:1}};
    }
    throw Error('unexpected run '+sql);
  }};return st;}}};
}
const credentials=db=>({...db,RAKUTEN_APP_ID:'app',RAKUTEN_ACCESS_KEY:'secret',RAKUTEN_SITE_ORIGIN:'https://shop.example'});

test('product selection uses unique verified products and diverse category shelves',()=>{
  const groups=Array.from({length:16},(_,i)=>({id:`${i}`,name:`分類${i}`,items:Array.from({length:5},(_,j)=>({
    id:`${i}-${j}`,code:`${i}-${j}`,name:`製品${i}-${j}`,url:`https://item.rakuten.co.jp/x/${i}-${j}/`,
    price:1200+j*30,score:70-j,genre:`分類${i}`,categoryId:`${i}`,shop:`店舗${i}`,isTrend:false,rank:j+1
  }))}));
  const items=pickDiversifiedProducts(groups);
  assert.equal(items.length,48);
  assert.equal(new Set(items.map(x=>x.code)).size,48);
  for(let i=0;i<4;i++)assert.equal(new Set(items.slice(12*i,12*i+12).map(x=>x.categoryId)).size,12,`diverse shelf ${i}`);
  assert.ok(items.every(x=>x.reason.includes('ランキング')));
});

test('root genres are from live response and restricted/duplicate fallback categories are excluded',()=>{
  const xs=parseRootGenres({children:[{genreId:'100',nameJa:'家電'},{genreId:'101',nameJa:'ビール'},{genreId:'200',nameJa:'本・雑誌'}]});
  assert.deepEqual(xs.map(x=>x.name),['家電','本・雑誌']);
});

test('new snapshot caches curated products for one day, does not touch old posts or existing ranking tables',async()=>{
  const db=fakeDb(),env=credentials(db),requests=[];
  const fetcher=async (...args)=>{requests.push(args[0]);return fakeFetch(...args)};
  const first=await refreshRecommended(env,{date:'2026-11-11',fetcher,pause:async()=>{}});
  assert.equal(first.ok,true);assert.equal(first.count,48);
  assert.equal(first.genres>=12,true);
  assert.equal(requests.length,13,'one live genre request + twelve category rankings');
  const saved=await getLatestRecommended(env,{date:'2026-11-11'});
  assert.equal(saved.current,true);assert.equal(saved.items.length,48);
  assert.equal((await refreshRecommended(env,{date:'2026-11-11',fetcher,pause:async()=>{}})).alreadyExists,true);
  assert.equal(requests.length,13,'no repeat API quota spent on already published date');
  assert.deepEqual(Object.keys(db.records.get('2026-11-11')).sort(),['created_at','day','products_json','status','updated_at']);
});

test('failed refresh leaves older published shelf intact and retries are rate-limited',async()=>{
  const db=fakeDb(),env=credentials(db);
  assert.equal((await refreshRecommended(env,{date:'2026-11-10',fetcher:fakeFetch,pause:async()=>{}})).ok,true);
  let calls=0;
  const failed=await refreshRecommended(env,{date:'2026-11-11',fetcher:async()=>{calls++;return Response.json({error:'blocked'},{status:403})},pause:async()=>{}});
  assert.equal(failed.ok,false);assert.equal(calls,1);
  assert.equal(JSON.parse(db.records.get('2026-11-11').products_json).errorCode,'RAKUTEN_FORBIDDEN_403');
  const saved=await getLatestRecommended(env,{date:'2026-11-11'});
  assert.equal(saved.day,'2026-11-10');assert.equal(saved.items.length,48);assert.equal(saved.current,false);
  assert.equal((await refreshRecommended(env,{date:'2026-11-11',fetcher:fakeFetch})).reason,'RETRY_COOLDOWN');
});

test('new route is GET-only, backwards compatible, and bootstraps asynchronously',async()=>{
  const db=fakeDb(),env=credentials(db);const saved=globalThis.fetch;
  globalThis.fetch=fakeFetch;
  try{
    const jobs=[];const url='https://shop.example/api/picks/recommended';
    const response=await worker.fetch(new Request(url),env,{waitUntil(p){jobs.push(p)}});
    assert.equal(response.status,200);assert.deepEqual((await response.json()).items,[]);
    assert.equal(jobs.length,1);
    assert.equal((await jobs[0]).ok,true);
    const latest=await worker.fetch(new Request(url),env);
    assert.equal((await latest.json()).items.length,48);
    assert.equal((await worker.fetch(new Request(url,{method:'POST'}),env)).status,405);
  }finally{globalThis.fetch=saved;}
});

test('v37 original posting and Cloudflare config are unmodified',()=>{
 const conf=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 assert.deepEqual(conf.triggers.crons,['*/30 * * * *','0 21 * * *']);
 const src=readFileSync('worker.js','utf8');
 assert.match(src,/\/api\/picks\/ranking/);assert.match(src,/\/api\/search/);
 assert.match(src,/ctx\.waitUntil\(runAutomation\(env/);
 assert.match(src,/ctx\.waitUntil\(refreshDailyPicks\(env/);
 for(const p of ['public/index.html','public/visitor.html']){
   const html=readFileSync(p,'utf8');assert.match(html,/\/api\/picks\/recommended/);
   assert.match(html,/\/api\/picks\/ranking/);assert.match(html,/PICKS_PER_SHELF=12/);
 }
});

test('trend opt-in: only observed matching search products are mixed, not invented popularity',async()=>{
  const db=fakeDb(),basic=db.DB;
  db.DB={prepare(sql){
    if(sql.includes('FROM yodan_auto_extras'))return {async first(){return {trend_enabled:1}}};
    if(sql.startsWith('CREATE TABLE IF NOT EXISTS yodan_trend_snapshots'))return {async run(){return {meta:{changes:0}}}};
    if(sql.includes('FROM yodan_trend_snapshots'))return {async first(){return {topics_json:JSON.stringify([{term:'Switch2 ケース',signal:'new_in_sample',traffic:'10K+'}]),updated_at:'2026-11-11T08:00:00.000Z'}}};
    return basic.prepare(sql);
  }};
  const env=credentials(db),fetcher=async(url,opts)=>{
    if(url.includes('IchibaItem/Search'))return Response.json({Items:[
      {itemCode:'trend-shop:1',itemName:'Switch2 ケース 収納 防滴 モデル1',itemPrice:2400,itemUrl:'https://item.rakuten.co.jp/trend/1/',shopName:'トレンド小物',reviewCount:45,reviewAverage:4.5},
      {itemCode:'trend-shop:2',itemName:'Switch2 ケース モデル2',itemPrice:2800,itemUrl:'https://item.rakuten.co.jp/trend/2/',shopName:'トレンド小物',reviewCount:33,reviewAverage:4.1},
      {itemCode:'trend-shop:3',itemName:'Switch2 ケース モデル3',itemPrice:1600,itemUrl:'https://item.rakuten.co.jp/trend/3/',shopName:'トレンド小物',reviewCount:5,reviewAverage:4.2},
      {itemCode:'irrelevant:4',itemName:'全く関係のない生活用品',itemPrice:3500,itemUrl:'https://item.rakuten.co.jp/trend/4/'}
    ]});
    return fakeFetch(url,opts);
  };
  const res=await refreshRecommended(env,{date:'2026-11-11',now:new Date('2026-11-11T09:00:00.000Z'),fetcher,pause:async()=>{}});
  assert.equal(res.ok,true);
  assert.ok(res.trends>0);
  const items=(await getLatestRecommended(env,{date:'2026-11-11'})).items;
  const trendy=items.filter(x=>x.isTrend);
  assert.ok(trendy.length>0);
  assert.ok(trendy.every(x=>x.name.includes('Switch2 ケース')&&x.reason.includes('商品自体の流行・販売数は未確認')));
  assert.ok(!items.some(x=>x.name.includes('全く関係のない')));
});

test('HTTP 400 diagnosis identifies endpoint and safe parameter without revealing secrets or touching existing posting',async()=>{
  for (const scenario of [
    {stage:'GENRE_ROOT',target:'IchibaGenre',description:'specify valid applicationId',hint:'APP_ID'},
    {stage:'GENRE_RANKING',target:'IchibaItem/Ranking',description:'invalid genreId parameter',hint:'GENRE_ID'},
    {stage:'GENRE_ROOT',target:'IchibaGenre',description:'unrecognized client issue: key=VERY_SECRET',hint:null}
  ]) {
    const db=fakeDb(),env=credentials(db);
    const fetcher=async (url,opts)=>{
      if(url.includes(scenario.target))return Response.json({error:'wrong_parameter',error_description:scenario.description},{status:400});
      return fakeFetch(url,opts);
    };
    const ret=await refreshRecommended(env,{date:'2026-11-12',fetcher,pause:async()=>{}});
    assert.equal(ret.ok,false);
    const stored=JSON.parse(db.records.get('2026-11-12').products_json);
    assert.equal(stored.stage,scenario.stage);
    assert.equal(stored.providerErrorCode,'wrong_parameter');
    assert.equal(stored.parameterHint,scenario.hint);
    assert.match(stored.errorCode,new RegExp(`^RAKUTEN_${scenario.stage}_HTTP_400`));
    assert.equal(JSON.stringify(stored).includes('VERY_SECRET'),false);
    const visible=await getLatestRecommended(env,{date:'2026-11-12'});
    assert.equal(visible.failureStage,scenario.stage);
    assert.equal(visible.parameterHint,scenario.hint);
    assert.equal(visible.providerErrorCode,'wrong_parameter');
    assert.equal(visible.items.length,0);
  }
});
