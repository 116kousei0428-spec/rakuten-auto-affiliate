# 楽天アフィリエイト GitHub → Cloudflare Workers v5

GitHub連携のCloudflare **Workers** 用プロジェクトです。`src/worker.js`は使用しません。エントリポイントはリポジトリ直下の`worker.js`です。

## アップロード方法
ZIPを展開して**フォルダ自体ではなく、中身**（`worker.js`, `wrangler.jsonc`, `public/`, `package.json`など）をGitHubリポジトリの最上位に配置してください。既存の`wrangler.toml`, `wrangler.json`, 古い`wrangler.jsonc`や余分なサブディレクトリに注意。

## Cloudflare 設定
- 接続方法: GitHub → Workers Builds
- Root directory: リポジトリ直下（空欄または `/`）
- Build command: `npm run build`（ビルド不要なら空欄でもよい）
- Deploy command: `npx wrangler deploy`
- リポジトリに `worker.js` と `wrangler.jsonc` が並ぶことを確認

## 楽天API設定
CloudflareのWorker設定の Variables and Secrets に以下を登録してください。
- `RAKUTEN_APP_ID`: 楽天アプリID
- `RAKUTEN_ACCESS_KEY`: 楽天APIアクセスキー（secret推奨）
- `RAKUTEN_AFFILIATE_ID`: 楽天アフィリエイトID（任意。成果計測には必要）

楽天市場商品検索API 2026-07-01を利用。ブラウザに認証キーは露出しません。公式仕様: https://webservice.rakuten.co.jp/index.php/documentation/ichiba-item-search

## テスト
`npm run check` で構文/ファイル配置とAPIの基本挙動をテストできます。

## 実装範囲
- 静的サイト表示、商品キーワード検索、API接続状態、楽天商品リンク表示
- **未実装**: AI記事生成、SNS自動投稿、データベース、ランキング自動更新、定期投稿、自動収益保証
- **未検証**: 実際の楽天API認証とCloudflare本番デプロイ（個別アカウント接続が必要）
