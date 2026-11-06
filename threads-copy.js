// Shared Threads story layout for manual drafts, regenerations and scheduled posts.
// Only supplied editorial facts or explicitly labelled shopping notes are used;
// composing this text never asks AI to invent an unverified product claim.
const GREETINGS = [
  'こんにちは、余談商店です。今日も少し寄り道を。',
  'いらっしゃいませ。余談商店から、今日の小話です。',
  'どうも、余談商店です。一杯のお供に、こんなお話。',
  'お立ち寄りありがとうございます。余談商店です。'
];
const ONE_LINERS = [
  '知ってから眺めると、身近なものもちょっと面白く見えますね。',
  '何気ないものにも、寄り道して初めて気づく面白さがあります。',
  'こういう小さな発見が、日々の楽しみを増やしてくれる気がします。',
  '物の向こう側にある話を知るのも、買い物の楽しみですね。'
];
const GOODBYES = [
  'それでは、また次の余談で。',
  'では、また店先でお会いしましょう。',
  '今日の寄り道はここまで。またお待ちしています。',
  'それでは、またふらっと覗きに来てください。'
];
const size = text => [...text].length;
export function composeThreadsStory({trivia, intro, articleUrl, isPromotion=false, variant=0}={}) {
  const fact=String(trivia||'').trim().replace(/\r/g,'').replace(/\n+/g,' ');
  const link=String(articleUrl||'').trim();
  if(!fact || !/^https:\/\/[^\s]+$/.test(link)) return null;
  const v=Number.isSafeInteger(variant)?Math.abs(variant)%GREETINGS.length:0;
  const prefix=isPromotion?'【PR】\n\n':'';
  // Preserve the factual text and required four-part structure when reducing length.
  const intros=[String(intro||'').replace(/\s+/g,' ').trim(), '今日の棚の品も、記事で紹介しています。', ''];
  const notes=[ONE_LINERS[v], '知ると、ちょっと見方が変わりますね。'];
  for(const summary of [...new Set(intros)]){
    for(const note of notes){
      const connection=[summary,note].filter(Boolean).join(' ');
      const result=`${prefix}${GREETINGS[v]}\n\n${fact}\n\n${connection}\n\n記事はこちら：\n${link}\n\n${GOODBYES[v]}`;
      if(size(result)<=500)return result;
    }
  }
  // Never silently cut a verified fact halfway through a sentence.
  return null;
}
