import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runAutomation} from '../automation.js';
import worker from '../worker.js';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
test('v22 scheduled trigger exists and runs every 30 minutes',()=>{
  assert.deepEqual(config.triggers.crons,['*/30 * * * *','0 21 * * *']);
  assert.equal(typeof worker.scheduled,'function');
});
test('v22 management endpoint requires authentication even for reads',async()=>{
  const res=await worker.fetch(new Request('https://shop.example/api/automation'),{});
  assert.equal(res.status,401);
});
test('disabled mode blocks execution before making requests',async()=>{
  const statements=[];
  const env={DB:{prepare(sql){statements.push(sql);return {bind(){return this;},async run(){return {meta:{changes:1}};},async first(){return {enabled:0,daily_target:20};}}}}};
  const result=await runAutomation(env,()=>{throw Error('must not call network')});
  assert.deepEqual(result,{ok:false,reason:'DISABLED'});
  assert(statements.some(x=>x.includes('yodan_auto_settings')));
});
