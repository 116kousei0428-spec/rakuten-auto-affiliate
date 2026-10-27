# 楽天アフィリエイト v12 — UIの反映不一致を修正

## 発生していた問題

`/api/health` は v11 だったのに、公開トップページは古い「楽天商品検索」だけの画面で、AI記事ボタンが表示されませんでした。
元のZIP内には機能がありましたが、本番に公開された静的アセットが古い状態でした（正確な原因はGitHub側のアップロード状態を未確認）。

## 今回の対策

- `wrangler.jsonc` の `assets.run_worker_first` を **true** に設定。
- トップ `/` と `/index.html` は Worker 本体から v12の画面（HTML/JS/CSS込み）を返す。
- トップHTMLは `Cache-Control: no-store`、`X-Rakuten-UI-Version: v12`。
- `public/index.html` にも同じ機能を入れ、静的ファイルの見た目を揃える。
- 楽天商品検索、生成API `/api/articles/generate`、AI認証はv11を維持。
- `/api/health` の `release` を `v12` に変更。

## GitHub更新方法

ZIPを解凍し、**リポジトリのルートに中身をアップロード**する。特に `worker.js` と `wrangler.jsonc` を必ず上書き。ファイル構造：

```
worker.js
wrangler.jsonc
package.json
public/index.html
public/app.js
public/style.css
scripts/check.mjs
tests/worker.test.mjs
README.md
```

**Cloudflareのデプロイコマンドは `npx wrangler deploy` から変更しない。**
既存の `RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`, `RAKUTEN_AFFILIATE_ID`, `AI_ADMIN_TOKEN` のSecretは再登録不要。

## 公開確認

1. `https://rakuten-auto-affiliate.116kousei0428.workers.dev/api/health` で `release: v12` を確認。
2. サイトのトップで `UI v12 / AI記事機能` と `② AI記事の下書きを作る` が表示される。
3. 商品検索後、各商品に `AI記事を作成` ボタンが表示される。
4. キーを入力して押す。記事生成の成否は Workers AI の実通信で確認が必要。

## 確認済み範囲

`npm run check` で構成とモックテストを確認。Cloudflare実環境へのデプロイおよび本番AI推論は未実施。

公式仕様: https://developers.cloudflare.com/workers/static-assets/binding/
