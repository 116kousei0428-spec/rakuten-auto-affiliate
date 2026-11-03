import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for (const name of ['index.html','visitor.html']) {
  test(`${name} fantasy shelf with readable commerce controls`,()=>{
    const html=readFileSync(`public/${name}`,'utf8');
    assert.match(html,/id="pick-results" class="grid shelf-grid"/);
    assert.match(html,/id="results" class="grid shelf-grid"/);
    assert.match(html,/class="shelf-sign"/);
    assert.match(html,/\.shelf-grid \.item a\{/);
    assert.match(html,/@media\(max-width:620px\)/);
    assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
  });
}
