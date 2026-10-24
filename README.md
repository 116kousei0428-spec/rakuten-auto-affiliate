# Rakuten GitHub Worker v7

GitHub repository **root** に `worker.js`, `wrangler.jsonc`, `public/`, `package.json` を配置してください。Cloudflare の deploy command は `npx wrangler deploy` です。

Cloudflare の Secret: `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`, `RAKUTEN_AFFILIATE_ID`。GitHub に秘密情報をコミットしないでください。

変更点: 同一検索の成功結果を Cloudflare Cache API に最大10分キャッシュ。楽天APIで429を受けた場合、各エッジ拠点で最大2分の再呼び出し抑制。実際の429解除時間は楽天側が決めるため、2分後に成功する保証はありません。キャッシュはエッジごと・ベストエフォートです。実際の楽天API接続とCloudflareデプロイは未検証。

`npm run check` でテストします。
