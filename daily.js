// Independent daily trivia publication; no affiliate claims and no Threads posting.
// Topics are editorial anchors: AI may add a literary bridge, not new factual claims.
const topics = [
  ['猫が高いところを好む理由','猫は周囲を見渡せる高い場所を好むことがあり、そこで安心して休む個体もいます。高所での移動には身体能力が役立ちます。'],
  ['コーヒー豆は「豆」ではない','コーヒー豆と呼ばれるものは、コーヒーノキの果実の中にある種子です。焙煎を経て、私たちが知る香りや色が生まれます。'],
  ['本の「栞」はいつ使う？','栞は読みかけのページを示すための道具です。厚いものを長く挟むと、本の傷みにつながることもあります。'],
  ['温度計がなくても湯気は見える','水蒸気そのものは目に見えません。お湯の上で見える白い湯気は、冷えた空気中で水蒸気が小さな水滴になったものです。'],
  ['レコードの音が生まれる仕組み','アナログレコードの溝には音に対応する細かな変化が刻まれています。針が溝をなぞる動きを信号に変え、音として再生します。'],
  ['時計が針を使うわけ','針時計は、文字盤上の針の位置で時刻を表します。長針と短針を組み合わせることで、時間と分を読み取れます。'],
  ['紙の本に独特の香りがある理由','紙やインク、接着剤などの素材は、時間とともにさまざまな揮発性成分を放つことがあります。そのため本の匂いは素材や保管状態で変わります。'],
  ['ホーローはどうして光る？','ホーローは金属の表面にガラス質の釉薬を焼き付けた素材です。独特のつやと色合いがあり、食器や道具に使われています。'],
  ['植物が窓辺に向くことがある理由','植物には光の方向に成長が偏る「光屈性」が見られます。すべての植物が同じように反応するわけではありません。'],
  ['マグカップの取っ手は何のため？','マグカップの取っ手は、器の熱が手に伝わるのを避けたり、持ちやすくしたりするための形です。素材や形によって使い心地は変わります。'],
  ['木の年輪が伝えること','樹木の年輪は、成長の周期に応じて木材に現れる模様です。年輪の幅は気候だけでなく樹種や生育環境など多くの要因に左右されます。'],
  ['ランプの光はなぜあたたかく見える？','光の色味によって人が受ける印象は変わります。色温度が低めの黄みを帯びた光は、一般にあたたかい印象を与えます。'],
  ['紅茶の色はなぜ変わる？','紅茶にレモンを加えると、色が明るく見えることがあります。これは茶葉由来の色素の状態が酸性度によって変わるためです。'],
  ['革製品はなぜ手触りが違う？','革は動物の皮をなめして作る素材で、もとの部位や加工方法によって質感が変わります。同じ革でも仕上げ方によって手触りは異なります。'],
  ['陶器と磁器は何が違う？','陶器と磁器は、原料や焼成温度、焼き上がりの性質などが異なります。器の厚みや光の透け方にも違いが見られることがあります。'],
  ['鉛筆に鉛は入っている？','一般的な鉛筆の芯は黒鉛と粘土などから作られています。「鉛筆」という名前ですが、芯の主成分として金属の鉛を使うわけではありません。'],
  ['万年筆のインクはどう流れる？','万年筆のペン先にはインクを導くための細い溝があり、毛細管現象などを利用してインクを先端へ運びます。'],
  ['ガラスはなぜ透けて見える？','一般的な窓ガラスは可視光の多くを通す性質があるため、向こう側の景色が見えます。色や厚み、表面加工によって透け方は変わります。'],
  ['木の器はなぜ手になじむ？','木材は種類や加工の仕方によって重さや手触りが違います。金属や陶磁器と比べ、触れたときに温かみを感じることがあります。'],
  ['風鈴の音が違う理由','風鈴の音色は材質や形、厚さ、当たる部分などによって変わります。ガラス製と金属製では響き方にも違いがあります。'],
  ['鏡はどうして姿を映す？','鏡の表面では光が規則的に反射します。光がさまざまな方向へ散らばりにくいため、物の形を映し出せます。'],
  ['ろうそくの炎が揺れる理由','ろうそくの炎は周囲の空気の流れや、温度による空気の動きの影響を受けます。風のない室内でも揺れることがあります。'],
  ['石けんで汚れが落ちる理由','石けんの成分には水となじみやすい部分と油となじみやすい部分があり、油性の汚れを水と一緒に洗い流しやすくします。'],
  ['雨のあとに土の匂いがするのは？','雨のあとに感じる土のような匂いには、地中の微生物が作る成分などが関係することがあります。匂いの感じ方は環境によって変わります。'],
  ['雪の結晶はどうできる？','雪の結晶は大気中の水蒸気が氷の結晶として成長することでできます。温度や湿度などの条件によって形が変わります。'],
  ['傘の骨が放射状なのは？','傘は中心から広がる骨で布を支える構造が一般的です。骨の配置によって布を広げたり畳んだりできるようになっています。'],
  ['音が小さく聞こえる素材','柔らかい布や多孔質の素材は、音の一部を吸収することがあります。音の響きは素材だけでなく、部屋の形や配置にも左右されます。'],
  ['地球儀は何を表している？','地球儀は地球の表面を球体に表した模型です。平面の地図と違い、地球の曲面をそのままの形で表現できます。'],
  ['色鉛筆はなぜ色がつく？','色鉛筆の芯には顔料や結合材などが使われています。紙にこすりつけると芯の成分が紙の表面に残り、色として見えます。'],
  ['時計の秒針は何を数える？','時計の秒針は時間を秒単位で示すための針です。機械式やクオーツ式など時計の仕組みによって動き方が異なります。'],
  ['急須の茶こしは何のため？','急須の茶こしは、注ぐときに茶葉が湯飲みに入りにくくするための部分です。形や網目の細かさは急須によって異なります。'],
  ['木の家具は季節で変わる？','木材は周囲の湿度に応じて水分を吸収したり放出したりします。そのため家具や建具の寸法がわずかに変化することがあります。'],
];
const dateJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clean=s=>String(s||'').trim();
export async function ensureDailyTable(env){
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS daily_trivia (day TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
}
export async function getDaily(env,day){
  await ensureDailyTable(env);
  return env.DB.prepare("SELECT day,title,body,updated_at FROM daily_trivia WHERE day=? AND status='published'").bind(day).first();
}
export async function generateDaily(env,{date=dateJst()}={}){
  if(!env.DB?.prepare || !env.AI?.run) return {ok:false,reason:'DB_OR_AI_UNAVAILABLE'};
  await ensureDailyTable(env);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return {ok:false,reason:'INVALID_DATE'};
  const existing=await env.DB.prepare('SELECT status,updated_at FROM daily_trivia WHERE day=?').bind(date).first();
  if(existing?.status==='published') return {ok:true,alreadyExists:true};
  // Avoid concurrent generation during scheduled and manual retries.
  if(existing?.status==='generating' && Date.now()-Date.parse(existing.updated_at)<30*60*1000) return {ok:false,reason:'BUSY'};
  if(existing?.status==='failed' && Date.now()-Date.parse(existing.updated_at)<60*60*1000) return {ok:false,reason:'RETRY_COOLDOWN'};
  const now=new Date().toISOString();
  const write=await env.DB.prepare("INSERT INTO daily_trivia(day,title,body,status,created_at,updated_at) VALUES(?,?,'','generating',?,?) ON CONFLICT(day) DO UPDATE SET status='generating', updated_at=excluded.updated_at WHERE status!='published' AND (status!='generating' OR updated_at<?)")
    .bind(date,'準備中',now,now,new Date(Date.now()-30*60*1000).toISOString()).run();
  if(!write.meta?.changes) return {ok:false,reason:'BUSY'};
  const index=(Math.floor(Date.parse(date+'T00:00:00Z')/86400000)%topics.length+topics.length)%topics.length;
  const [title,anchor]=topics[index];
  try{
    const result=await env.AI.run('@cf/google/gemma-4-26b-a4b-it',{
      messages:[
        {role:'system',content:'あなたは昭和レトロな余談商店の上品な白髪の店主。コーヒーを片手に、温かく軽妙な「一日ひとつの雑学」を書く。ユーザーが提供した編集済み事実だけが事実の根拠。固有名詞、研究、数字、歴史、効果、逸話を新たに創作しない。追加するのは情景描写、疑問、比喩、読者への問いかけのみ。本文は日本語で100〜400文字。見出し、URL、絵文字、PR、広告、商品紹介は不要。'},
        {role:'user',content:`タイトル: ${title}\n採用してよい事実: ${anchor}\nこの事実を一字一句変えずに含め、前後を少し豊かにして100〜400文字の読み物本文だけを書いてください。`}
      ],max_completion_tokens:500,temperature:0.45,chat_template_kwargs:{enable_thinking:false}
    });
    const raw=typeof result?.response==='string'?result.response:typeof result?.result?.response==='string'?result.result.response:'';
    let body=raw.replace(/^```[^\n]*\n|\n```$/g,'').trim();
    // No unverifiable invented statements enter the published daily note:
    // Use a curated copy when the model fails to preserve the factual anchor exactly.
    if(!body.includes(anchor) || [...body].length<100 || [...body].length>400 || /https?:\/\//.test(body)){
      body=`いらっしゃいませ。今日は店先で、${title}というお話をひとつ。\n\n${anchor}\n\nいつもの景色も、少し角度を変えて眺めると、違って見えるものです。コーヒーをひと口飲みながら、身近な道具や生き物に思いを巡らせるのも悪くありませんな。あなたの暮らしには、どんな小さな発見がありますか。`;
    }
    await env.DB.prepare("UPDATE daily_trivia SET title=?,body=?,status='published',updated_at=? WHERE day=? AND status='generating'").bind(title,body,new Date().toISOString(),date).run();
    return {ok:true,title,date};
  }catch(error){
    await env.DB.prepare("UPDATE daily_trivia SET status='failed',updated_at=? WHERE day=? AND status='generating'").bind(new Date().toISOString(),date).run();
    console.error('Daily trivia generation failed',{type:error instanceof Error?error.name:'Unknown'});
    return {ok:false,reason:'GENERATION_FAILED'};
  }
}
export const currentJstDay=dateJst;
