import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {parseTrendsRss, annotateTrendSignals, eligibleShoppingTrends, selectTrendKeyword, trendCandidateScore, refreshTrends,latestTrends,trendSlot} from '../trends.js';
import { chooseTriviaAnchor, generateTriviaPost, runAutomation } from '../automation.js';
import worker from '../worker.js';
const xml=`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:ht="https://trends.google.com/trending/rss"><channel>
  <item><title><![CDATA[Switch2 ケース]]></title><ht:approx_traffic>20K+</ht:approx_traffic><pubDate>Wed, 11 Nov 2026 09:00:00 GMT</pubDate></item>
  <item><title>逮捕 事件</title><ht:approx_traffic>100K+</ht:approx_traffic></item>
  <item><title>コスメ &amp; メイク</title><ht:approx_traffic>10K+</ht:approx_traffic></item>
  <item><title>Switch2 ケース</title></item>
 </channel></rss>`;
test('RSS parser handles CDATA, entities, duplicates, and sensitive-news exclusion',()=>{
 const terms=parseTrendsRss(xml);
 assert.deepEqual(terms.map(x=>x.term),['Switch2 ケース','コスメ & メイク']);
 assert.equal(terms[0].traffic,'20K+');
 assert.equal(terms[0].source,'Google Trends JP');
 assert.deepEqual(parseTrendsRss('<html>no feed</html>'),[]);
 assert.equal(eligibleShoppingTrends(terms).length,2);
 assert.equal(annotateTrendSignals(terms,null)[0].signal,'history_missing');
 assert.equal(annotateTrendSignals(terms,[{term:'Switch2 ケース',traffic:'10K+'}])[0].signal,'approx_rising');
 assert.equal(annotateTrendSignals(terms,[{term:'Switch2 ケース',traffic:'10K+'}])[1].signal,'new_in_sample');
 assert.equal(selectTrendKeyword(terms,0),'Switch2 ケース');
 assert.equal(trendCandidateScore({name:'Nintendo Switch2 用 ケース 収納'},'Switch2 ケース'),35);
 assert.equal(trendCandidateScore({name:'無関係なマグカップ'},'Switch2 ケース'),0);
});
test('Google trend snapshot lock and stale fallback do not require any live internet',async()=>{
 class MemoryTrendDB{
   constructor(){this.data=new Map();}
   prepare(sql){const obj=this;let args=[];return {
     bind(...x){args=x;return this;},
     async run(){
       if(sql.startsWith('CREATE TABLE'))return {meta:{changes:0}};
       if(sql.startsWith('INSERT INTO yodan_trend_snapshots')){
         const [slot,stamp,minStamp]=args;
         const old=obj.data.get(slot);
         if(old?.status==='ready'||old && old.updated_at>=minStamp)return {meta:{changes:0}};
         obj.data.set(slot,{slot,status:'fetching',topics_json:'[]',updated_at:stamp});return {meta:{changes:1}};
       }
       if(sql.startsWith('UPDATE yodan_trend_snapshots')){
         const [val,stamp,slot]=args.length===3?args:[null,...args];
         const row=obj.data.get(slot);
         if(!row||row.status!=='fetching')return {meta:{changes:0}};
         if(sql.includes("status='ready'")){row.status='ready';row.topics_json=val;row.updated_at=stamp;}
         else {row.status='failed';row.updated_at=stamp;}
         return {meta:{changes:1}};
       }
       throw Error('unexpected query '+sql);
     },
     async first(){
       if(sql.includes('FROM yodan_trend_snapshots WHERE slot='))return obj.data.get(args[0])||null;
       if(sql.includes("status='ready'"))return [...obj.data.values()].filter(x=>x.status==='ready').sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0]||null;
       return null;
     }
   };}
 }
 const DB=new MemoryTrendDB(),env={DB},now=new Date('2026-11-11T09:00:00Z');
 const a=await refreshTrends(env,{now,fetcher:async()=>new Response(xml,{status:200})});
 assert.equal(a.ok,true);assert.equal(a.count,2);
 const snapshot=await latestTrends(env,{now});
 assert.equal(snapshot.stale,false);assert.equal(snapshot.topics.length,2);
 const second=await refreshTrends(env,{now,fetcher:async()=>{throw Error('should not repeat');}});
 assert.equal(second.alreadyExists,true);
 assert.equal((await latestTrends(env,{now:new Date('2026-11-12T10:00:00Z')})).stale,true);
 assert.match(trendSlot(now),/^2026-11-11:[0-3]$/);
});
test('pure trivia generation is source-locked and excludes PR, ads and links',async()=>{
 const sample=chooseTriviaAnchor('2026-11-11',0,'猫');
 assert.match(sample.anchor,/猫/);
 const text=await generateTriviaPost({AI:{run:async()=>{throw Error('AI offline');}}},sample);
 assert.match(text,/余談商店/);
 assert.ok(text.includes(sample.anchor));
 assert.doesNotMatch(text,/【PR】|https?:\/\/|アフィリエイト/);
 assert.ok([...text].length<=500);
});
test('new trend endpoint requires existing authentication',async()=>{
 const result=await worker.fetch(new Request('https://shop.example/api/trends'),{});
 assert.equal(result.status,401);
});
test('new UI settings are opt-in and preserves original Cloudflare cron',()=>{
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 assert.deepEqual(config.triggers.crons,['*/30 * * * *','0 21 * * *']);
 const html=readFileSync('public/index.html','utf8');
 for(const id of ['auto-mix','auto-trivia-share','auto-trend','trend-fetch'])assert.ok(html.includes(`id="${id}"`));
 const workerSrc=readFileSync('worker.js','utf8');
 assert.ok(workerSrc.includes(JSON.stringify(html)));
});
test('opt-in mixed automation publishes independent trivia without PR/article URL',async()=>{
 const calls=[];const jobs=new Map();const threads=new Map();
 const db={prepare(sql){let args=[];return {
   bind(...values){args=values;return this;},
   async run(){calls.push({sql,args});
     if(sql.startsWith('CREATE TABLE')||sql.startsWith('INSERT OR IGNORE INTO yodan_auto_settings')||sql.startsWith('INSERT OR IGNORE INTO yodan_auto_extras'))return {meta:{changes:0}};
     if(sql.startsWith('INSERT OR IGNORE INTO yodan_auto_jobs')){
       if(jobs.has(args[0]))return {meta:{changes:0}};
       jobs.set(args[0],{slot:args[0],status:'claimed',product_key:null});return {meta:{changes:1}};
     }
     if(sql.startsWith('UPDATE yodan_auto_jobs')){
       const job=jobs.get(args[5]);Object.assign(job,{status:args[0],detail:args[1],product_key:args[2],article_id:args[3]});return {meta:{changes:1}};
     }
     if(sql.startsWith('INSERT INTO threads_posts')){threads.set(args[0],args[1]);return {meta:{changes:1}};}
     throw Error('Unexpected run: '+sql);
   },
   async first(){
     if(sql.startsWith('SELECT enabled,daily_target FROM'))return {enabled:1,daily_target:20};
     if(sql.startsWith('SELECT mix_enabled'))return {mix_enabled:1,trivia_share:50,trend_enabled:0};
     if(sql.includes('SELECT COUNT(*) AS cnt')){
       const filtered=[...jobs.values()].filter(x=>x.status!=='failed'&&x.slot>=args[0]&&x.slot<args[1]);
       return {cnt:sql.includes('TRIVIA:%')?filtered.filter(x=>x.product_key?.startsWith('TRIVIA:')).length:filtered.length};
     }
     throw Error('Unexpected first: '+sql);
   },
   async all(){return {results:[]};}
 };}};
 const env={DB:db,RAKUTEN_SITE_ORIGIN:'https://shop.example',AI_ADMIN_TOKEN:'not-real-token',THREADS_ACCESS_TOKEN:'not-real-token',AI:{run:async()=>{throw Error('AI unavailable');}}};
 const execute=async req=>{
   const url=new URL(req.url);
   assert.match(url.pathname,/^\/api\/social\/threads\/[0-9a-f-]{36}\/publish$/);
   return Response.json({status:'published',postId:'mocked-post'});
 };
 const result=await runAutomation(env,execute,{manual:true});
 assert.equal(result.ok,true);assert.equal(result.kind,'trivia');
 assert.equal(threads.size,1);
 const body=[...threads.values()][0];
 assert.match(body,/余談商店/);assert.doesNotMatch(body,/https?:\/\/|【PR】|アフィリエイト/);
 assert.equal([...jobs.values()][0].status,'published');
});
test('existing PR automation still follows ranking -> article -> Threads when new features are OFF',async()=>{
 const events=[];const jobs=new Map(),posts=new Map();
 const db={prepare(sql){let args=[];return {
   bind(...x){args=x;return this;},
   async run(){
     if(sql.startsWith('CREATE TABLE')||sql.startsWith('INSERT OR IGNORE INTO yodan_auto_settings')||sql.startsWith('INSERT OR IGNORE INTO yodan_auto_extras'))return {meta:{changes:0}};
     if(sql.startsWith('INSERT OR IGNORE INTO yodan_auto_jobs')){jobs.set(args[0],{slot:args[0],status:'claimed'});return {meta:{changes:1}};}
     if(sql.startsWith('UPDATE yodan_auto_jobs')){Object.assign(jobs.get(args[5]),{status:args[0],detail:args[1],product_key:args[2],article_id:args[3]});return {meta:{changes:1}};}
     if(sql.startsWith('INSERT INTO yodan_auto_products')||sql.startsWith('INSERT INTO article_drafts')||sql.startsWith('INSERT INTO article_publications'))return {meta:{changes:1}};
     if(sql.startsWith('INSERT INTO threads_posts')){posts.set(args[0],args[1]);return {meta:{changes:1}};}
     throw Error('Unexpected run '+sql);
   },
   async first(){
     if(sql.startsWith('SELECT enabled,daily_target FROM'))return {enabled:1,daily_target:20};
     if(sql.startsWith('SELECT mix_enabled'))return {mix_enabled:0,trivia_share:50,trend_enabled:0};
     if(sql.includes('SELECT COUNT(*) AS cnt'))return {cnt:0};
     throw Error('Unexpected first '+sql);
   },
   async all(){return {results:[]};}
 };}};
 const mockItem={name:'とてもおしゃれな保存ケース',url:'https://item.rakuten.co.jp/shop/case123/',code:'item:case123',price:2400,caption:'たくさんの小物を収納できる商品です。',rank:4};
 const env={DB:db,RAKUTEN_SITE_ORIGIN:'https://shop.example',AI_ADMIN_TOKEN:'not-real',THREADS_ACCESS_TOKEN:'not-real',AI:{run:async()=>({response:JSON.stringify({
    greeting:'いらっしゃいませ。余談商店の店主です。',
    trivia:'道具を選ぶとき、細かな使い勝手を考えてみるのも面白いものです。毎日目にする道具ほど、見慣れた風景の中で存在感を発揮するかもしれません。',
    bridge:'今日ご紹介するのは小物の保存ケース。どう使うのか想像しながら記事を読んでいただければ幸いです。',
    goodbye:'それでは、また気が向いたら商店へお立ち寄りください。'
 })})}};
 const execute=async req=>{
   const path=new URL(req.url).pathname;events.push(path);
   if(path==='/api/picks/ranking')return Response.json({items:[mockItem]});
   if(path==='/api/search')return Response.json({items:[mockItem]});
   if(path==='/api/articles/generate')return Response.json({title:'小物ケースの紹介',markdown:'## 余談商店\n\nアフィリエイト広告を含みます。\n\n[商品](https://item.rakuten.co.jp/shop/case123/)',verifiedStoryFact:''});
   if(path.startsWith('/api/social/threads/'))return Response.json({status:'published',postId:'mock-post'});
   throw Error('Unexpected url '+path);
 };
 const result=await runAutomation(env,execute,{manual:true});
 assert.equal(result.ok,true, result.reason);
 assert.equal(result.kind,'pr');
 assert.equal(posts.size,1);
 const post=[...posts.values()][0];assert.match(post,/【PR】/);assert.match(post,/\/articles\//);
 assert.ok(events.includes('/api/picks/ranking'));
 assert.ok(events.includes('/api/articles/generate'));
 assert.ok(events.some(x=>x.includes('/publish')));
 assert.equal(events.filter(x=>x==='/api/search').length,1);
});
