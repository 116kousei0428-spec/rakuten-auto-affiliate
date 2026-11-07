import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker.js';

const ENV={RAKUTEN_APP_ID:'app',RAKUTEN_ACCESS_KEY:'secret',RAKUTEN_AFFILIATE_ID:'affiliate',ASSETS:{fetch:async()=>new Response('asset')}};
const withFetch=async(mock,body)=>{
  const original=globalThis.fetch;globalThis.fetch=mock;
  try {await body();} finally {globalThis.fetch=original;}
};

test('ranking returns all valid real places through rank 30, ordered and never invented',async()=>{
  await withFetch(async(url,options)=>{
    const requestUrl=new URL(url);
    assert.equal(requestUrl.pathname,'/ichibaranking/api/IchibaItem/Ranking/20220601');
    assert.equal(requestUrl.searchParams.get('page'),'1');
    assert.equal(options.headers.accessKey,'secret');
    const items=Array.from({length:32},(_,i)=>({
      rank:i+1,itemName:`商品 ${i+1}`,itemPrice:1000+i,itemUrl:`https://example.com/product/${i+1}`,
      shopName:'店舗',mediumImageUrls:[{imageUrl:'https://example.com/p.webp'}]
    }));
    items.splice(3,1); // Rakuten may omit deleted items, never fabricate missing rank 4.
    items.reverse();
    return Response.json({Items:items});
  },async()=>{
    const response=await worker.fetch(new Request('https://site.test/api/picks/ranking'),ENV);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.items.length,29);
    assert.equal(data.items[0].rank,1);
    assert.equal(data.items.at(-1).rank,30);
    assert.equal(data.items.some(item=>item.rank===4),false);
    assert.equal(data.items.some(item=>item.rank>30),false);
    assert.equal(data.count,29);
    assert.deepEqual(data.items.map(item=>item.rank),[...data.items.map(item=>item.rank)].sort((a,b)=>a-b));
  });
});

test('recommended shelves display real product cards; ranking has independent 10-rank pagination on both pages',()=>{
  for(const path of ['public/index.html','public/visitor.html']){
    const html=readFileSync(path,'utf8');
    assert.match(html,/id="ranking-pagination"/);
    assert.match(html,/id="ranking-prev"/);
    assert.match(html,/id="ranking-next"/);
    assert.match(html,/renderRankingPage/);
    assert.match(html,/firstRank = rankingPage \* 10 \+ 1/);
    assert.match(html,/lastRank = Math\.min\(30, firstRank \+ 9\)/);
    assert.match(html,/const fetchOneRecommendedProduct = async topic =>/);
    assert.match(html,/const showEditorPickTopics = async \(\) =>/);
    assert.match(html,/Promise\.all\(topics\.slice\(i, i \+ 2\)\.map\(fetchOneRecommendedProduct\)\)/);
    assert.match(html,/renderProductCards\(pickResults, collected\)/);
    assert.match(html,/recommendationTopic/);
    assert.doesNotMatch(html,/className='pick-topic'/);
    assert.match(html,/const requestId = \+\+picksViewRequest/);
  }
});
