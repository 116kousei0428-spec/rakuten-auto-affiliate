# 楽天アフィリエイト GitHub → Cloudflare Workers v8

## 機能

楽天商品検索（2026-07-01 API）、商品画像・価格・リンク表示、既存Secret利用、成功検索のCloudflareエッジキャッシュ（600秒）、429のエッジごとの一時抑制（120秒）、403等のエラーコード表示。AI記事作成、SNS自動投稿、DB連携は未実装です。

## 修正点

1. `wrangler.jsonc` のWorker名を現在のCloudflareに一致する **`rakuten-auto-affiliate`** に変更。
2. 公開URLと同じ構成で、実ファイル **リポジトリ直下の `worker.js`** を参照。存在しない `src/worker.js` を参照しません。
3. Rakuten公式テストフォームと同様に、楽天APIへのサーバー側リクエストで **`applicationId` と `accessKey` をクエリパラメータとして**渡すよう変更。公式仕様ではヘッダーでも利用可能です。URLはブラウザへ返却しません。キーはサーバー側の通信先・関連ログに露出し得るため、絶対にブラウザやGitHubに貼らないでください。
4. 403/429について楽天側のHTTPステータスと安全なエラーコードを表示。認証情報やレスポンス本文は公開しません。

## GitHubへの配置

このZIPは **ファイルをリポジトリ直下に入れる形式** です。展開後の `worker.js`, `wrangler.jsonc`, `public/`, `package.json`, `scripts/`, `tests/` を直接リポジトリにアップロードしてください。`worker.js` がGitHubのトップページで見えること。古い `wrangler.jsonc` は必ず更新してください。

Cloudflareデプロイコマンド: `npx wrangler deploy`

Cloudflare **生産** 環境のSecrets（以前登録したものをそのまま利用）:
- `RAKUTEN_APP_ID`
- `RAKUTEN_ACCESS_KEY`
- `RAKUTEN_AFFILIATE_ID`

GitHubの設定ファイルにID・アクセスキー・アフィリエイトIDを書かないでください。

## 重要：403の原因候補

以前案内した登録ドメインが `rakuten-affiliate.116kousei0428.workers.dev` だった場合、現在の本番サイトとは異なります。楽天のアプリ設定を確認し、**許可されたウェブサイト** に本番のドメイン：

`rakuten-auto-affiliate.116kousei0428.workers.dev`

を登録してください（`https://`なし）。アプリケーションURLも `https://rakuten-auto-affiliate.116kousei0428.workers.dev` に一致させてください。楽天の設定変更が必要かどうか、403の根本原因はまだ未確認です。

また、公式テストフォームでは成功していても、Cloudflareの生産環境のSecretsに**同じアプリに属するアプリIDとアクセスキー**を設定したかどうかは別途確認が必要です。

## テスト

`npm run check` → 設定検査・構文/モックAPIテスト。実際の楽天APIの応答やCloudflare本番の成功はこれだけでは保証されません。

デプロイ後：
1. `/api/health` → `apiConfigured:true`（登録有無の確認のみ）
2. `/api/search?keyword=イヤホン` → `items` が返るか確認。
3. `upstreamStatus:403`なら楽天の許可ドメイン・鍵の対応関係などを確認。

## 資料

- https://webservice.rakuten.co.jp/documentation/ichiba-item-search
- https://webservice.rakuten.co.jp/guide
