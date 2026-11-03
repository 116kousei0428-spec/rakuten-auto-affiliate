import test from 'node:test';
import assert from 'node:assert/strict';
import {generateDaily,getDaily} from '../daily.js';
function fakeEnv(){
  const db=new Map();let calls=0;
  const DB={prepare(sql){let vals=[]; const stmt={bind(...x){vals=x;return stmt},async run(){
      if(sql.startsWith('CREATE TABLE')) return {meta:{changes:0}};
      if(sql.startsWith('INSERT INTO daily_trivia')){
        const [day,title,created,updated]=vals;
        const old=db.get(day);
        if(old?.status==='published'||(old?.status==='generating' && Date.now()-Date.parse(old.updated_at)<1800000))return {meta:{changes:0}};
        db.set(day,{day,title,body:'',status:'generating',created_at:created,updated_at:updated});return {meta:{changes:1}};
      }
      if(sql.startsWith('UPDATE daily_trivia')){
        const ok=sql.includes("status='published'");
        const day=vals.at(-1),old=db.get(day);
        if(!old||old.status!=='generating')return {meta:{changes:0}};
        db.set(day,ok?{...old,title:vals[0],body:vals[1],updated_at:vals[2],status:'published'}:{...old,status:'failed',updated_at:vals[0]});return {meta:{changes:1}};
      }
      throw Error(sql);
    },async first(){
      const row=db.get(vals[0])||null;
      if(sql.includes("status='published'"))return row?.status==='published'?row:null;
      return row;
    }};return stmt;}};
  const AI={async run(){calls++;return {response:'短いので事実を検証できません。'};}};
  return {env:{DB,AI},db,called:()=>calls};
}
test('one generated daily article per date; read-only route gets persisted entry',async()=>{
 const s=fakeEnv();
 assert.equal((await generateDaily(s.env,{date:'2026-11-03'})).ok,true);
 assert.equal(s.called(),1);
 const article=await getDaily(s.env,'2026-11-03');
 assert.equal(article.day,'2026-11-03');
 assert(article.body.length>=100&&article.body.length<=400);
 assert.equal((await generateDaily(s.env,{date:'2026-11-03'})).alreadyExists,true);
 assert.equal(s.called(),1);
 assert.equal(await getDaily(s.env,'2026-11-04'),null);
});
test('AI outage does not publish fabricated trivia',async()=>{
 const s=fakeEnv();s.env.AI.run=async()=>{throw Error('AI offline')};
 const result=await generateDaily(s.env,{date:'2026-11-04'});
 assert.equal(result.ok,false);assert.equal(await getDaily(s.env,'2026-11-04'),null);
});
