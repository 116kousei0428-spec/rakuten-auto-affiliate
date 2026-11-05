from pathlib import Path
from playwright.sync_api import sync_playwright
from base64 import b64encode
static_root=Path(__file__).resolve().parent.parent / 'public'
fetch_mock = '''<script>
window.fetch=async (url)=>{
 const u=String(url);
 const body = u.includes('/api/search')?{items:[{name:'テスト商品',price:'3,280',shop:'テスト店舗',url:'https://example.org/product',image:''}],count:1,affiliateConfigured:true}:
 u.includes('/api/picks/ranking')?{items:[],updatedAt:''}:
 u.includes('/api/health')?{apiConfigured:true,aiConfigured:true,aiAdminConfigured:true}:
 u.includes('/api/daily/latest')?{item:null}:{};
 return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
};
</script>'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for page_name in ('visitor','index'):
        page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        html=(static_root/f'{page_name}.html').read_text()
        html=html.replace('<script>',fetch_mock+'<script>',1)
        if page_name=='visitor':
            b64=b64encode((static_root/'hero-blackboard-scene.webp').read_bytes()).decode('ascii')
            html=html.replace('src="/hero-blackboard-scene.webp"',f'src="data:image/webp;base64,{b64}"')
        page.set_content(html,wait_until='domcontentloaded')
        page.locator('#show-editor-picks').click()
        seen=[]
        shelves=[]
        for i in range(10):
            labels=page.locator('#editor-picks .pick-topic strong').all_text_contents()
            assert len(labels)==4,(page_name,i,labels)
            shelves.append(labels)
            seen.extend(labels)
            if i<9:page.locator('#refresh-editor-picks').click()
        assert len(set(seen))==40,(page_name,'duplicates found')
        page.locator('#shelf-back').click()
        assert page.locator('#editor-picks .pick-topic strong').all_text_contents()==shelves[8], page_name
        page.locator('#refresh-editor-picks').click()
        assert page.locator('#editor-picks .pick-topic strong').all_text_contents()==shelves[9], page_name
        page.locator('#refresh-editor-picks').click()
        assert page.locator('#editor-picks .pick-topic strong').all_text_contents()==shelves[0], page_name
        page.locator('#editor-picks .pick-topic').first.click()
        page.locator('#pick-results .price').first.wait_for(timeout=4000)
        assert page.locator('#pick-results .price').first.text_content()=='3,280円',page_name
        if page_name=='visitor':
            assert page.locator('.hero-scene').evaluate('(img)=>img.complete && img.naturalWidth > 0'), 'blackboard image failed to load'
        assert errors==[],(page_name,errors)
        print(f'PASS {page_name}: 10 shelves, previous/wrap, price, no JS errors')
        page.close()
    browser.close()
