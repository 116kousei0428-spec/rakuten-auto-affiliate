import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const part=js.slice(js.indexOf('const ADMIN_KEY_STORAGE ='),js.indexOf('const adminHeaders ='));
const name='rakuten_admin_token_optional_v16';
const makePage=(store=new Map())=>{
 const controls=new Map();
 for(const id of ['#admin-token','#remember-admin-token','#admin-storage-status','#forget-admin-token']){
   const handlers={};
   controls.set(id,{value:'',checked:false,textContent:'',handlers,
     addEventListener(event,fn){handlers[event]=fn;},focus(){}});
 }
 const $=id=>controls.get(id);
 const localStorage={getItem:key=>store.get(key)||null,setItem:(key,val)=>store.set(key,val),removeItem:key=>store.delete(key)};
 vm.runInNewContext(part,{ $,localStorage });
 return {store,controls,fire:(id,event)=>$(id).handlers[event](),element:$};
};
test('admin key is never stored without explicit opt-in',()=>{
 const page=makePage();page.element('#admin-token').value='secret-key-1';
 page.fire('#admin-token','input');
 assert.equal(page.store.has(name),false);
});
test('opt-in saves and auto restores, changing key updates, opt-out deletes',()=>{
 const store=new Map();const page=makePage(store);
 page.element('#admin-token').value='secret-key-2';
 page.element('#remember-admin-token').checked=true;
 page.fire('#remember-admin-token','change');
 assert.equal(store.get(name),'secret-key-2');
 const reload=makePage(store);
 assert.equal(reload.element('#admin-token').value,'secret-key-2');
 assert.equal(reload.element('#remember-admin-token').checked,true);
 reload.element('#admin-token').value='secret-key-3';reload.fire('#admin-token','input');
 assert.equal(store.get(name),'secret-key-3');
 reload.element('#remember-admin-token').checked=false;reload.fire('#remember-admin-token','change');
 assert.equal(store.has(name),false);
});
test('delete button removes both saved and currently entered key',()=>{
 const store=new Map([[name,'dangerous-placeholder']]);const page=makePage(store);
 page.fire('#forget-admin-token','click');
 assert.equal(store.size,0);
 assert.equal(page.element('#admin-token').value,'');
 assert.equal(page.element('#remember-admin-token').checked,false);
});
