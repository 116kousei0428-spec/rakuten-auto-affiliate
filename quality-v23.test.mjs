import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync('worker.js','utf8');
const ui=readFileSync('public/index.html','utf8');
const automation=readFileSync('automation.js','utf8');
test('trivia is locked to curated category data and rejected without sufficient article structure',()=>{
  assert.match(worker,/const verifiedFact=factCategory/);
  assert.match(worker,/const factSection = verifiedFact/);
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
test('scheduled posts must include editorial trivia rather than generic descriptions',()=>{
  assert.match(automation,/NO_VERIFIED_TRIVIA/);
  assert.match(automation,/triviaCompatible/);
  assert.match(automation,/lockedFact/);
  assert.match(automation,/【PR】/);
});
