import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker.js';

// Deliberately omit ASSETS. The screenshot showed broken img even though the image file existed
// in the ZIP; this test verifies that the Worker actually serves the image at the exact URL.
const origin='https://store.test';
const file=readFileSync(new URL('../public/hero-blackboard-scene.webp',import.meta.url));

test('v30 image GET serves a complete WebP with no ASSETS binding',async()=>{
  const response=await worker.fetch(new Request(origin+'/hero-blackboard-scene.webp'),{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.equal(response.headers.get('content-length'),String(file.length));
  const received=Buffer.from(await response.arrayBuffer());
  assert.ok(received.equals(file),'Worker image bytes must equal included WebP');
  assert.equal(received.toString('ascii',0,4),'RIFF');
  assert.equal(received.toString('ascii',8,12),'WEBP');
});

test('v30 image HEAD and unsupported method are handled',async()=>{
  const head=await worker.fetch(new Request(origin+'/hero-blackboard-scene.webp',{method:'HEAD'}),{});
  assert.equal(head.status,200);
  assert.equal(head.headers.get('content-type'),'image/webp');
  assert.equal(head.headers.get('content-length'),String(file.length));
  assert.equal((await head.arrayBuffer()).byteLength,0);
  const post=await worker.fetch(new Request(origin+'/hero-blackboard-scene.webp',{method:'POST'}),{});
  assert.equal(post.status,405);
});

test('v30 storefront image resolves directly to successful worker route',async()=>{
  const page=await worker.fetch(new Request(origin+'/'),{});
  const html=await page.text();
  assert.equal(page.status,200);
  const src=html.match(/<img class="hero-scene" src="([^"]+)"/);
  assert.ok(src,'hero image exists in public page');
  const imageResponse=await worker.fetch(new Request(origin+src[1]),{});
  assert.equal(imageResponse.status,200);
  assert.equal(imageResponse.headers.get('content-type'),'image/webp');
  assert.ok((await imageResponse.arrayBuffer()).byteLength>100000);
});
