import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const admin=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const visitor=readFileSync(new URL('../public/visitor.html',import.meta.url),'utf8');
test('private UI never persists the administrator credential in browser storage',()=>{
 assert.doesNotMatch(admin,/ADMIN_KEY_STORAGE|remember-admin-token|localStorage\.setItem\(ADMIN_KEY_STORAGE/);
 assert.doesNotMatch(admin,/id="admin-token"/);
});
test('visitor page has only a password form, not the private editor',()=>{
 assert.match(visitor,/name="password"/);
 assert.match(visitor,/action="\/admin\/login"/);
 assert.doesNotMatch(visitor,/id="draft-text"|id="social-text"|id="admin-token"/);
});
test('private UI uses same-origin authenticated session, never sends an admin key from JavaScript',()=>{
 assert.match(admin,/const adminHeaders = \(\) => \(\{\}\)/);
 assert.doesNotMatch(admin,/X-Admin-Token/);
 assert.match(admin,/action="\/admin\/logout"/);
});
