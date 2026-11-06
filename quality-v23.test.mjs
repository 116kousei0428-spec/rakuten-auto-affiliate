import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync('worker.js','utf8');
const ui=readFileSync('public/index.html','utf8');
const automation=readFileSync('automation.js','utf8');
test('reviewed category facts remain locked and unreviewed items get safe notes',()=>{
  assert.match(worker,/const verifiedFact=factCategory/);
  assert.match(worker,/const editorialNote=verifiedFact \|\| shoppingTrivia/);
  assert.match(worker,/const factSection = `/);
  assert.match(worker,/AI_QUALITY_REJECTED/);
  assert.match(worker,/編集済み雑学/);
});
test('shopkeeper narrative and variable Threads hooks are in place',()=>{
  assert.match(worker,/店主から、ひとつ余談を/);
  assert.match(worker,/const openers=\[/);
  assert.match(worker,/const endings=\[/);
  assert.match(worker,/const category=categoryFor\(title\)/);
});
test('editor picks rotate every 3 hours and can be refreshed manually',()=>{
  assert.match(ui,/PICK_ROTATION_MS=3\*60\*60\*1000/);
  assert.match(ui,/refresh-editor-picks/);
  assert.match(ui,/rotatingPickTopics/);
});
test('scheduled posts do not filter unfamiliar categories and retain safe editor notes',()=>{
  assert.doesNotMatch(automation,/triviaCompatible|NO_VERIFIED_TRIVIA/);
  assert.match(automation,/candidates\.filter\(p=>!blocked/);
  assert.match(automation,/lockedFact/);
  assert.match(automation,/shoppingTrivia\(p\.name\)/);
  assert.match(automation,/【PR】/);
});
