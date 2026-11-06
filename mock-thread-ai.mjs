// A deterministic inference stub for integration tests; never calls the network.
export function mockThreadAI(){
  let calls=0;
  return {async run(model,args){
    calls++;
    const request=args.messages?.[1]?.content||'';
    const payload=request.match(/商品と記事の情報：(\{[^\n]+\})\n以前の投稿文/);
    if(!payload)throw new Error('unexpected AI prompt');
    const data=JSON.parse(payload[1]);
    const previous=!!data.以前の投稿文 && data.以前の投稿文!=='なし';
    const product=data.商品名;
    const known=data.検証済み雑学.startsWith('なし')?'':data.検証済み雑学;
    const trivia=known
      ? `${known}${previous?'この違いは、品選びの視点を少し変えてくれそうです。':'何となく知っていた言葉も、こうして見比べると印象が違いますね。'}`
      : `${product}という名前から、どんな場面に似合うのか想像してみました。普段は気にも留めない身近なものほど、使い方を考える時間にちょっとした楽しみがありそうです。`;
    const doc={greeting:previous?'おかえりなさい。余談商店です。':'いらっしゃいませ。余談商店です。',
      trivia,bridge:previous?`今回は${product}を別の角度から眺めてみました。詳しくは今日の記事に書いています。`:`そんな話の流れで、${product}をご紹介します。詳しくは今日の記事で、お好きなときにどうぞ。`,
      goodbye:previous?'それでは、また次のお話でお会いしましょう。':'それでは、また次の余談でお会いしましょう。'};
    return {response:JSON.stringify(doc)};
  },get calls(){return calls;}};
}
