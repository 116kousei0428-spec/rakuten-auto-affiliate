"""Offline browser regression: server-delivered daily shelf snapshots in both UIs."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from base64 import b64encode
import json
static_root=Path(__file__).resolve().parent.parent / 'public'
topics=[{'name':f'注目商品カテゴリー {i:02d}', 'keyword':f'カテゴリー {i:02d}', 'basis':'楽天ランキング','reason':f'楽天総合ランキング{i+1}位の商品から選定'} for i in range(40)]
daily={'topics':topics,'day':'2026-11-06','current':True,'updatedAt':'2026-11-06T00:00:00.000Z'}
fetch_mock = '''<script>
window.fetch=async (url)=>{
 const u=String(url);
 const body=u.includes('/api/picks/daily')?__DAILY__:
 u.includes('/api/search')?{items:[{name:'動作確認商品',price:2500,url:'https://item.rakuten.co.jp/test/item',shop:'試験用商店',image:''}],count:1,affiliateConfigured:true}:
 u.includes('/api/picks/ranking')?{items:[],updatedAt:''}:
 u.includes('/api/health')?{apiConfigured:true}:{item:null};
 return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
};</script>'''.replace('__DAILY__',json.dumps(daily,ensure_ascii=False))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for name in ['visitor','index']:
  page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
  errors=[]
  page.on('pageerror',lambda err:errors.append(str(err)))
  html=(static_root/f'{name}.html').read_text()
  html=html.replace('<script>',fetch_mock+'<script>',1)
  if name=='visitor':
   b64=b64encode((static_root/'hero-blackboard-scene.webp').read_bytes()).decode('ascii')
   html=html.replace('src="/hero-blackboard-scene.webp"',f'src="data:image/webp;base64,{b64}"')
  page.set_content(html,wait_until='domcontentloaded')
  page.locator('#show-editor-picks').click()
  page.get_by_text('注目商品カテゴリー',exact=False).first.wait_for(timeout=5000)
  labels=[]
  for i in range(10):
   names=page.locator('#editor-picks .pick-topic strong').all_text_contents()
   assert len(names)==4,(name,i,names)
   labels.extend(names)
   if i<9:page.locator('#refresh-editor-picks').click()
  assert len(set(labels))==40,(name,'duplicates')
  assert any('注目商品カテゴリー 39' in t for t in labels),name
  page.locator('#shelf-back').click()
  assert page.locator('#editor-picks .pick-topic').count()==4
  assert '2026-11-06' in page.locator('#daily-picks-meta').inner_text(),name
  assert errors==[],(name,errors)
  print(f'PASS {name}: 40 remotely generated topics, 10 shelves, back button, no JS errors')
  page.close()
 browser.close()
