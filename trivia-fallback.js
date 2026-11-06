// Universal, evidence-safe editorial fallback for product titles outside the reviewed fact bank.
// These are shopping observations, not product-specific historical/scientific facts.
// Do not infer product performance, ingredients, compatibility or popularity from the title.
export const productNameFromTitle = (title) => String(title ?? '')
  .split(/｜(?:特徴と購入前|余談商店の読みもの)/)[0]
  .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, 160);

const shoppingInsights = [
  '同じような商品名でも、単品とセット品では届く内容が異なることがあります。画像だけでなく、商品ページの「内容物」や「個数」を読み比べると、意外な違いが見えてきます。',
  '「サイズ」は必ずしも商品の外側の寸法だけを指すわけではありません。設置場所や持ち運ぶ場面を考えるなら、どこを測った数字なのかまで確認すると選びやすくなります。',
  '商品名が似ていても、対応する機器や使える場所まで同じとは限りません。購入前に対応条件と注意書きを読むだけでも、思い込みを減らせます。',
  '「素材」が同じと書かれていても、加工方法やお手入れの条件が違う場合があります。見た目だけで決めず、素材表示と使用上の注意を比べるのも買い物の楽しみです。',
  '価格を比べるときは、本体価格だけでなく送料や入数、付属品にも目を向けたいもの。同じ金額に見えても、実際に届く内容で選び方は変わります。',
  '商品の説明には、販売者が示す特徴と購入前に自分で確認したい条件が混在しています。用途・サイズ・セット内容を分けて読むと、どこが決め手か整理しやすくなります。'
];

// Prefer a more relevant observation if the title explicitly signals a theme.
// Mention a product name only as the merchant-supplied title; never claim it has unverified features.
export function shoppingTrivia(title, index = 0) {
  const raw = productNameFromTitle(title);
  const displayName = [...raw].slice(0, 32).join('') || 'この商品';
  const normalizedIndex = Number.isFinite(index) ? Math.abs(Math.trunc(index)) : 0;
  let insight;
  if (/(?:セット|詰め合わせ|まとめ買い|福袋|\d+[個枚本袋点]入り)/i.test(raw)) {
    insight = shoppingInsights[normalizedIndex % 2 === 0 ? 0 : 4];
  } else if (/(?:対応|互換|専用|USB|スマートフォン|iPhone|Android)/i.test(raw)) {
    insight = shoppingInsights[normalizedIndex % 2 === 0 ? 2 : 5];
  } else if (/(?:\d+(?:\.\d+)?\s*(?:cm|mm|インチ|kg|g|ml|mL|L)\b|サイズ|寸法)/i.test(raw)) {
    insight = shoppingInsights[normalizedIndex % 2 === 0 ? 1 : 3];
  } else {
    insight = shoppingInsights[normalizedIndex % shoppingInsights.length];
  }
  return `「${displayName}」をきっかけに、買い物の小ネタをひとつ。${insight}`;
}
