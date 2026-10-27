# 楽天アフィリエイト GitHub → Cloudflare Workers v10

楽天公式テスト成功・Worker経由でHTTP 403 (`upstreamErrorCode:null`) の診断対応。

## v9からの変更
- 楽天へのHTTPリクエストで、現在の公開サイトに一致する `Origin` と `Referer` の両方を送信。
- 2026年楽天ゲートウェイの `{ "errors": {"errorCode":403, "errorMessage":"..." } }` 形式を解釈。
- 403の詳細コードと診断ヒントを返す。HTMLや認証秘密情報は返さない。
- 以前のWorker名 `rakuten-auto-affiliate`、GitHub直下 `worker.js` の構成を維持。

## 運用上の確認（必須）
楽天の「許可されたウェブサイト」に **`rakuten-auto-affiliate.116kousei0428.workers.dev`** を登録する。
Cloudflareでは `RAKUTEN_APP_ID` と `RAKUTEN_ACCESS_KEY` を同一楽天アプリから登録済みであること。`RAKUTEN_AFFILIATE_ID` も登録済みでよい。
資格情報をZIPやGitHubに書かない。

## GitHub展開
ZIPを解凍し、内側の `worker.js`、`wrangler.jsonc`、`public`、`scripts`、`tests`、`package.json` をGitHubリポジトリの**直下**に配置。既存の同名ファイルを上書き。
CloudflareのDeploy command: `npx wrangler deploy`。

## テスト
ローカルで `npm run check`。
デプロイ後 `/api/search?keyword=イヤホン` を開き、`upstreamStatus` / `upstreamErrorCode` / `diagnosticHint` を見る。
テストはモック。**楽天API本番の200応答は未確認。**

根拠: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
