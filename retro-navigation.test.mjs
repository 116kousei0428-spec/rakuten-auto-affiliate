import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const admin=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const visitor=readFileSync(new URL('../public/visitor.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
test('both interfaces have next shelf and return controls',()=>{
 for(const html of [admin,visitor]){
  assert.match(html,/id="refresh-editor-picks"/);
  assert.match(html,/id="shelf-back"/);
  assert.match(html,/shelfTrail\.pop\(\)/);
  assert.match(html,/rotatingPickTopics/);
 }
});
test('fantasy decorations replaced with nostalgic wooden shop',()=>{
 for(const html of [admin,visitor]){
  assert.match(html,/昔なつかし、ちいさな商店/);
  assert.match(html,/repeating-linear-gradient/);
  assert.doesNotMatch(html,/ふしぎな品々の棚/);
 }
});
test('article return and trivia boundaries',()=>{
 assert.match(worker,/読みもの一覧へ戻る/);
 assert.match(worker,/function curatedTrivia/);
 assert.match(worker,/length>=100&&\[\.\.\.paragraph\]\.length<=400/);
 assert.match(admin,/id="back-from-editor"/);
});
