# 楽天アフィリエイト GitHub → Cloudflare Workers（v4）

このZIPはGitHub連携で `npx wrangler deploy` を実行する最小構成です。元の楽天全機能は復元していません。現在のサイトはデモ表示です。

## GitHubへの置き方（重要）
ZIPを**解凍**し、以下の**中身**をリポジトリ最上位にアップロードします。ZIPそのものや親フォルダ `rakuten_github_worker_v4/` をアップロードしないでください。

```
repo/
  wrangler.jsonc
  package.json
  src/worker.js
  public/index.html
  public/app.js
  public/style.css
  scripts/verify.mjs
```

古い `wrangler.toml`、`wrangler.json`、`dist/`、別の `package.json` 等が残っていると衝突・誤参照する場合があります。**空の新規リポジトリ**への配置が確実です。既存リポジトリに上書きする場合は古いファイルが残らないことを確認してください。

## Cloudflare Workers GitHub連携設定
- Root directory: `/`（リポジトリルート）
- Build command: `npm run build`（任意：実際には構成検証のみ）
- Deploy command: `npx wrangler deploy`

※Cloudflare Pagesの `dist` 出力指定を使う構成ではありません。Cloudflare Workersのリポジトリ連携を使用します。

## ローカル検証
`npm run check` と `npm run build`。実クラウドへのデプロイ成否は認証・Cloudflare設定・GitHub配置に依存します。
