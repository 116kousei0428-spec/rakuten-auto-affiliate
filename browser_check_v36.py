"""Local UI behavior check with mocked Rakuten responses; never contacts live APIs."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
TOPICS=[{'name':f'注目候補 {i:02d}', 'keyword':f'商品 {i:02d}', 'reason':'編集テーマ', 'basis':'編集注目'} for i in range(40)]
RANKING={'count':30,'items':[{'rank':i,'name':f'ランキング商品{i:02d}','url':f'https://example.com/rank/{i}','price':3000+i,'image':'https://example.com/a.webp','shop':'楽天の店'} for i in range(1,31)],'updatedAt':'2026-11-07 10:00'}
# Network navigation is restricted in this environment; render HTML directly and mock fetch.
MOCK_FETCH = """<script>
const __topics = __TOPICS__;
const __ranking = __RANKING__;
window.fetch = async (input) => {
  const u=new URL(String(input),'https://test.invalid');
  const reply=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
  if(u.pathname==='/api/picks/daily')return reply({topics:__topics,day:'2026-11-07',current:true});
  if(u.pathname==='/api/picks/ranking')return reply(__ranking);
  if(u.pathname==='/api/search'){
     const keyword=u.searchParams.get('keyword')||'';
     return reply({count:1,affiliateConfigured:true,items:[{name:'検索された実商品：'+keyword,url:'https://example.com/ranked/product',price:'1,980',image:'',shop:'検索ショップ'}]});
  }
  if(u.pathname==='/api/health')return reply({apiConfigured:true});
  if(u.pathname==='/api/daily/latest')return reply({item:null});
  return reply({});
};
</script>""".replace('__TOPICS__',json.dumps(TOPICS,ensure_ascii=False)).replace('__RANKING__',json.dumps(RANKING,ensure_ascii=False))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    for path,desktop in [('/',True),('/admin',False),('/',False)]:
        page=browser.new_page(viewport={'width':1280 if desktop else 390,'height':860},device_scale_factor=1)
        errors=[];page.on('pageerror',lambda e: errors.append(str(e)))
        html=(ROOT/'public' / ('index.html' if path=='/admin' else 'visitor.html')).read_text()
        assert '<script>' in html
        html=html.replace('<script>',MOCK_FETCH+'<script>',1)
        page.set_content(html,wait_until='domcontentloaded')
        page.wait_for_timeout(500)
        page.locator('#load-ranking').click()
        page.wait_for_function("document.querySelectorAll('#pick-results .item').length === 10")
        assert page.locator('#pick-results .pick-rank').first.inner_text()=='楽天ランキング 1位'
        assert page.locator('#ranking-page-label').inner_text().startswith('1〜10位')
        page.locator('#ranking-next').click()
        page.wait_for_function("document.querySelector('#ranking-page-label').textContent.startsWith('11〜20位')")
        assert page.locator('#pick-results .item').count()==10
        assert page.locator('#pick-results .pick-rank').first.inner_text()=='楽天ランキング 11位'
        page.locator('#ranking-next').click()
        page.wait_for_function("document.querySelector('#ranking-page-label').textContent.startsWith('21〜30位')")
        assert page.locator('#pick-results .item').count()==10
        assert page.locator('#ranking-next').is_disabled()
        page.locator('#ranking-prev').click()
        assert page.locator('#ranking-page-label').inner_text().startswith('11〜20位')
        page.locator('#show-editor-picks').click()
        page.wait_for_function("document.querySelectorAll('#pick-results .pick-recommendation').length === 4",timeout=20000)
        assert page.locator('#pick-results .item').count()==4
        assert page.locator('#pick-results .item .price').first.inner_text()=='1,980円'
        assert page.locator('#pick-results .pick-rank').count()==0
        first=page.locator('#pick-results .pick-recommendation').first.inner_text()
        page.locator('#refresh-editor-picks').click()
        page.wait_for_function("document.querySelectorAll('#pick-results .pick-recommendation').length === 4 && document.querySelector('#picks-status').textContent.includes('2 / 10棚')",timeout=20000)
        assert page.locator('#pick-results .pick-recommendation').first.inner_text()!=first
        page.locator('#shelf-back').click()
        page.wait_for_function("document.querySelectorAll('#pick-results .pick-recommendation').length === 4 && document.querySelector('#picks-status').textContent.includes('1 / 10棚')",timeout=20000)
        assert page.locator('#pick-results .pick-recommendation').first.inner_text()==first
        assert not errors, (path,errors)
        label='visitor-desktop' if path=='/' and desktop else 'visitor-mobile' if path=='/' else 'admin-mobile'
        page.screenshot(path=f'/mnt/data/v36-{label}.png',full_page=False)
        print('PASS',label,'ranking: 30 via 3 pages, recommendations: 4 actual cards, next and previous, errors: 0')
        page.close()
    browser.close()

