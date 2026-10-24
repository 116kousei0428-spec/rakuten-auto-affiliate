const $ = id => document.getElementById(id);
fetch('/api/health').then(async r => { if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(v=>{if(!v.ok)throw Error('unhealthy');$('health').textContent='正常';$('status').textContent='公開構成 OK';$('status').classList.add('ok');}).catch(()=>{$('health').textContent='要確認';$('status').textContent='API接続不可';});
$('make').addEventListener('click',()=>{
 const name=$('name').value.trim(),url=$('url').value.trim(),features=$('features').value.trim(),platform=$('platform').value;
 if(!name||!url){$('message').textContent='商品名とURLを入力してください。';return;}
 let u;try{u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw Error();}catch{$('message').textContent='有効なURLを入力してください。';return;}
 const draft=`【PR / 広告】\n${name}\n\n${features || '商品の詳細はリンク先をご確認ください。'}\n\n商品ページ：${u.href}\n\n#楽天アフィリエイト #${platform}`;
 $('output').value=draft;$('copy').disabled=false;$('message').textContent='下書きを生成しました（投稿はされません）。';
});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('output').value);$('message').textContent='コピーしました。';}catch{$('output').focus();$('output').select();$('message').textContent='選択しました。手動でコピーしてください。';}});
