// v35: Generate the narrative itself per article, rather than fill generic trivia templates.
// A vetted fact is optional, and only a vetted fact is presented as verified knowledge.
const chars = value => [...String(value)].length;
const trimText = (value, max) => [...String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0,max).join('');
export function readableProductName(title){
  const base=String(title??'').split(/｜(?:特徴と購入前|余談商店の読みもの)/)[0]
    .replace(/【[^】]*】|\[[^\]]*\]|\([^)]*(?:クーポン|ポイント|送料無料|無料|特典)[^)]*\)/g,' ')
    .replace(/(?:送料無料|限定価格|クーポン対象|ポイント\d+倍|レビュー特典|最安値|即納|数量限定|タイムセール|スーパーSALE|もれなく\S*無料)/gi,' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
    .replace(/\s+/g,' ').replace(/(?:入門|特割|送料無料|限定)$/g,'').trim();
  // A long merchant listing is not a readable subject line. Keep the first
  // two descriptive terms, rather than reading the entire coupon/SEO title.
  const short=base.split(/\s+/).slice(0,2).join(' ');
  return [...short].slice(0,34).join('') || '今日の一品';
}
const articleContext = markdown => String(markdown??'')
  .replace(/## 今日の余談[\s\S]*?(?=## |$)/g, section=>section.includes('買い物の小ネタ')?'':section)
  .replace(/\[[^\]]*\]\(https?:\/\/[^)]*\)/g,'')
  .replace(/https?:\/\/\S+/g,'')
  .replace(/^\s*(?:#|\*|>|---|※この記事).*$/gm,' ')
  .replace(/\s+/g,' ').trim().slice(0,1600);
const forbidden = /(買い物の小ネタ|設置場所や持ち運|内容物など、購入前|こちらの品を紹介|店先に置いた一品|商品名をきっかけに|サイズや内容物など、購入前|商品ページで確認してみてください)/;
const aiText = data => {
  const value=data?.response??data?.choices?.[0]?.message?.content??data?.result?.response;
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.filter(v=>v?.type==='text').map(v=>v.text||'').join('\n');
  return '';
};
const parseStory = raw => {
  const text=String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{
    const result=JSON.parse(text);
    if(result && typeof result==='object' && !Array.isArray(result))return result;
  }catch{}
  // Some inference models surround JSON with explanatory text.
  const start=text.indexOf('{'),end=text.lastIndexOf('}');
  if(start>=0&&end>start){try{const found=JSON.parse(text.slice(start,end+1));if(found && typeof found==='object')return found;}catch{}}
  return null;
};
export function composeNarrative({greeting,trivia,bridge,goodbye,articleUrl,isPromotion=false,verifiedFact='',previousBody=''}){
  const parts=[greeting,trivia,bridge,goodbye].map(v=>trimText(v,700));
  if(parts.some(s=>!s || chars(s)<9))return null;
  if(parts.some(s=>forbidden.test(s) || /https?:\/\/|【PR】|#(?:ad|pr)/i.test(s)))return null;
  if(!parts[0].includes('余談商店'))return null;
  if(chars(parts[1])<38||chars(parts[1])>235)return null;
  if(chars(parts[2])<16||chars(parts[2])>145)return null;
  if(!/^https:\/\/[^\s]+$/.test(articleUrl))return null;
  // The complete source-approved fact must survive rewriting unchanged.
  if(verifiedFact && !parts[1].includes(verifiedFact))return null;
  const post=`${isPromotion?'【PR】\n\n':''}${parts[0]}\n\n${parts[1]}\n\n${parts[2]}\n\n${articleUrl}\n\n${parts[3]}`;
  if(chars(post)>500||post===previousBody)return null;
  return post;
}
export async function generateNarrative({env,title,markdown,articleUrl,isPromotion=false,verifiedFact='',previousBody=''}) {
  if(!env?.AI || typeof env.AI.run!=='function') {
    const err=new Error('Workers AIが接続されていません。AIバインディングを確認してください。');
    err.code='THREADS_AI_MISSING';throw err;
  }
  const product=readableProductName(title);
  const grounded=trimText(verifiedFact,300);
  const source=articleContext(markdown);
  const instruction=`あなたは「余談商店」の文章上手な店主。日本語のThreads投稿文を一品ずつ新しく執筆します。
文章の構成は【自然な挨拶→商品に密接に関係する興味深い余談→気の利いた一言と自然な商品紹介→別れの挨拶】。見出し・箇条書き・宣伝口調は禁止。
長い楽天商品名・クーポン・無料特典・SEOの羅列をそのまま読み上げない。商品は短い自然な名称で呼ぶ。
最初の挨拶には「余談商店」を含める。毎回同じ書き出しや結びにしない。商品紹介は2〜3文で、記事へ自然につなげる。読んで「へぇ」となる展開と文章のリズムを優先し、「買い物の小ネタ」「サイズを確認しましょう」といったどの品にも当てはまる一般論、機械的な定型表現を禁止。
商品記事は参考資料だが、事実検証済みとは限らない。広告文や記事中の記述から商品の性能・歴史・医療効果・売れ筋・レビューなどを事実として勝手に作らない。
検証済み雑学が与えられた場合、その全文を一字も変えずにtriviaの中へ組み込む。与えられていなければ、断定的な知識の創作は避け、商品そのものの見方や使う場面への魅力的な問いかけ・着眼点で余談を作る。検証不能な話は書かない。
返すのはJSONのみ。キーは greeting,trivia,bridge,goodbye の四つで、全て文字列。greeting 15〜50文字、trivia 80〜155文字、bridge 35〜85文字、goodbye 15〜38文字。リンクと【PR】はシステムが付けるため絶対に書かない。合計350文字程度に抑える。`;
  const context={商品名:product,記事本文参考:source,検証済み雑学:grounded||'なし（実証済み事実を創作してはいけない）',以前の投稿文:trimText(previousBody,400)||'なし'};
  for(let attempt=0;attempt<2;attempt++){
    let output;
    try {
      output=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{
        messages:[{role:'system',content:instruction},{role:'user',content:`商品と記事の情報：${JSON.stringify(context)}\n以前の投稿文とは表現を変えて、新たな余談を考えてください。${attempt?'前回は書式・長さ・事実の制約を満たしませんでした。必ずJSONの4文字列で、検証済み雑学は一字一句そのまま含めてください。':''}`}],
        max_completion_tokens:900,temperature:attempt?0.75:0.85,chat_template_kwargs:{enable_thinking:false}
      });
    }catch(error){
      console.error('Threads narrative AI request failed',{kind:error instanceof Error?error.name:'Unknown'});
      const err=new Error('Threads投稿文のAI生成に失敗しました。Workers AIの利用状況をご確認ください。');err.code='THREADS_AI_FAILED';throw err;
    }
    const doc=parseStory(aiText(output));
    if(!doc)continue;
    const post=composeNarrative({...doc,articleUrl,isPromotion,verifiedFact:grounded,previousBody});
    if(post)return post;
  }
  const err=new Error('商品に合う投稿文を品質基準内で生成できませんでした。再生成をお試しください。');
  err.code='THREADS_TEXT_QUALITY_REJECTED';throw err;
}
