import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const admin = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
test('manual Threads generation shows state alongside initiating button', () => {
  assert.match(admin, /createSocial\(entry\.id, socialBtn, socialProgress\)/);
  assert.match(admin, /socialProgress\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(admin, /button\.textContent = '処理中…'/);
  assert.match(admin, /if\(progress\)progress\.textContent=message/);
  assert.match(admin, /const message='生成失敗：'/);
});
test('manual regeneration displays pending, success and errors without enabling automation', () => {
  assert.match(admin, /button\.textContent='雑学を再生成中…'/);
  assert.match(admin, /socialStatus\.textContent='再生成完了：/);
  assert.match(admin, /socialStatus\.textContent='再生成失敗：'/);
  assert.match(admin, /id="auto-enabled"/);
  assert.doesNotMatch(admin, /#\('auto-enabled'\)\.checked\s*=\s*true/);
});
test('embedded administrator UI matches static HTML and script syntax is valid', () => {
  assert.ok(worker.includes(JSON.stringify(admin)));
  const inline = [...admin.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(const source of inline) new vm.Script(source);
});
