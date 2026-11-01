import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../worker.js';
import { FakeD1 } from './fake-d1.mjs';
const base='https://site.test';
const samplePassword='local-test-password-not-real';
function withRateLimit(baseD1) {
  const records=new Map();
  return {prepare(sql){
    if (!sql.includes('yodan_admin_login_limits')) return baseD1.prepare(sql);
    let args=[];
    return {
      bind(...a){args=a;return this;},
      async run(){
        if(sql.startsWith('DELETE')) records.delete(args[0]);
        if(sql.startsWith('INSERT')) records.set(args[0],{attempts:args[1],updated_at:args[2],locked_until:args[3]});
        return {success:true};
      },
      async first(){return records.get(args[0])??null;}
    };
  }};
}
const e=()=>({ASSETS:{fetch:()=>new Response('asset-ok')},DB:withRateLimit(new FakeD1()),AI_ADMIN_TOKEN:'private-legacy-secret',ADMIN_PANEL_PASSWORD:samplePassword});
const request=(path,options={},env=e())=>worker.fetch(new Request(base+path,options),env);
const login=async(env,password)=>request('/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded','CF-Connecting-IP':'203.0.113.4'},body:new URLSearchParams({password})},env);

test('public top has product search, picks, tiny login at bottom, no editor or Threads JavaScript',async()=>{
 const response=await request('/');
 assert.equal(response.status,200);
 const page=await response.text();
 for(const term of ['id="search-form"','id="load-ranking"','id="show-editor-picks"','id="admin-entry"','action="/admin/login"']) assert(page.includes(term),term);
 for(const term of ['id="draft-text"','id="social-text"','id="admin-token"','/api/articles/generate','const generateArticle']) assert(!page.includes(term),term);
 assert(page.indexOf('id="admin-entry"')>page.indexOf('id="results"'));
 assert(!page.includes(samplePassword));
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 const {Script}=await import('node:vm');
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Script(scripts[0][1]));
});
test('unknown visitor cannot access the editor or protected API',async()=>{
 const env=e();
 const page=await request('/admin',{},env);
 assert.equal(page.status,303);assert.match(page.headers.get('Location'),/\/#admin-entry$/);
 for(const path of ['/api/drafts','/api/social/threads','/api/social/threads/connection']) {
   assert.equal((await request(path,{},env)).status,401,path);
 }
 assert.equal((await request('/api/articles/generate',{method:'POST',headers:{Origin:base}},env)).status,401);
});
test('incorrect login cannot create a cookie; attempts are limited',async()=>{
 const env=e();
 for (let i=0;i<4;i++) {
   const response=await login(env,'wrong-password');
   assert.equal(response.status,303);assert.match(response.headers.get('Location'),/login=failed/);
   assert.equal(response.headers.get('Set-Cookie'),null);
 }
 const fifth=await login(env,'wrong-password');
 assert.match(fifth.headers.get('Location'),/login=limited/);
 const evenCorrect=await login(env,samplePassword);
 assert.match(evenCorrect.headers.get('Location'),/login=limited/);
});
test('correct login enables editor through secure cookie; logout invalidates cookie in browser',async()=>{
 const env=e();
 const response=await login(env,samplePassword);
 assert.equal(response.status,303);assert.match(response.headers.get('Location'),/\/admin$/);
 const setCookie=response.headers.get('Set-Cookie');
 assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Strict/);
 const cookie=setCookie.split(';')[0];
 let admin=await request('/admin',{headers:{Cookie:cookie}},env);
 assert.equal(admin.status,200);const markup=await admin.text();
 for(const term of ['id="article-settings"','id="social-image-rights"','id="publish-current"']) assert(markup.includes(term),term);
 assert(!markup.includes('id="admin-token"'));
 assert(!markup.includes(samplePassword));
 assert.equal((await request('/api/drafts',{headers:{Cookie:cookie}},env)).status,200);
 const rejected=await request('/api/drafts',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'},env);
 assert.equal(rejected.status,403);
 const logout=await request('/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:base}},env);
 assert.equal(logout.status,303);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});
test('logo is served independently by worker and matches original WebP bytes',async()=>{
 const response=await request('/yodan-logo.webp');
 assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/webp');
 const actual=Buffer.from(await response.arrayBuffer());
 const expected=readFileSync(new URL('../public/yodan-logo.webp',import.meta.url));
 assert.deepEqual(actual,expected);
});
test('shop and article pages show owner login only at bottom',async()=>{
 const html=await (await request('/shop',{},e())).text();
 assert.match(html,/余談商店/);assert.match(html,/id="admin-entry"/);assert.match(html,/action="\/admin\/login"/);
 assert(!html.includes('id="draft-text"'));
 assert.match((await request('/shop',{},e())).headers.get('Content-Security-Policy'),/form-action 'self'/);
});
