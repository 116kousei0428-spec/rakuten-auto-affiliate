import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeItem,qualityPass,scoreOffer,safeHttps} from '../lib/shared.js';
import {authenticate} from '../lib/auth.js';
test('rakuten v2 item gets normalized, and quality filter is strict',()=>{
 const input={itemCode:'store:123',itemName:'型番 XYZ',itemPrice:10000,mediumImageUrls:['https://image.rakuten.co.jp/demo.jpg'],
 affiliateUrl:'https://hb.afl.rakuten.co.jp/hgc/test',shopName:'店舗A',shopCode:'store',reviewCount:10,reviewAverage:4.5,affiliateRate:4,availability:1,postageFlag:0};
 const out=normalizeItem(input);assert.equal(out.price,10000);assert.equal(out.image,input.mediumImageUrls[0]);assert.equal(out.rate,4);assert.ok(qualityPass(out));assert.ok(out.score>0&&out.score<=100);
});
test('rejects invalid offer and invalid URLs',()=>{
 assert.equal(safeHttps('javascript:alert(1)'),'');
 assert.equal(safeHttps('http://example.com'),'');
 assert.equal(qualityPass(normalizeItem({itemCode:'x',itemName:'title',itemPrice:300,availability:1})),false);
});
test('higher verified review count increases confidence score',()=>{
 const base={itemPrice:8000,reviewAverage:4.4,affiliateRate:3,postageFlag:0};
 assert.ok(scoreOffer({...base,reviewCount:75})>scoreOffer({...base,reviewCount:2}));
});
test('admin endpoints fail closed without configured Cloudflare Access',async()=>{
 const auth=await authenticate(new Request('https://example.com/api/admin/overview'),{});
 assert.equal(auth,null);
});
