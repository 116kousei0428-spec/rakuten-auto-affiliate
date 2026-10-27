# 楽天アフィリエイト v13 — D1記事保存

GitHub → Cloudflare Workers（デプロイコマンド `npx wrangler deploy`）対応。v12の商品検索・AI記事生成を残し、D1の記事保存・一覧・編集・削除を追加。**記事公開とSNS投稿は実装しません**。

## 設定済みのD1

- DB名: `rakuten-affiliate-db`
- Binding: `DB` (`env.DB`)
- DB ID: `81926891-4dd8-4cc2-b966-e530d2912452`
- `wrangler.jsonc` に設定済み。パスワードではありません。

## GitHubへの反映

ZIPを解凍し、**フォルダを1階層増やさず**GitHubの既存リポジトリ直下へアップロード。
以前の同名ファイルを上書きする。GitHub側に残る旧 `src/worker.js` を参照しないよう、`wrangler.jsonc` はこの版に置き換える。

変更不要：`RAKUTEN_APP_ID`, `RAKUTEN_ACCESS_KEY`, `RAKUTEN_AFFILIATE_ID`, `AI_ADMIN_TOKEN` (Cloudflare Secret)
デプロイコマンドは `npx wrangler deploy` のまま。

**D1の初期テーブルは、管理者が初めて「D1一覧を読み込む」か「D1に保存・更新」を実行した時点で自動作成します。** 追加のCLI操作は不要です。オプションで `migrations/0001_article_drafts.sql` を使って手動作成もできます。ただし、自動作成と両方行う必要はありません。

## 使い方

1. デプロイ後に `/api/health` の `release: v13` と `dbConfigured: true` を確認。
2. サイトで管理者キーを入力し、「D1一覧を読み込む」を押す。初回は空の一覧が表示され、テーブルが作成される。
3. 検索→AI記事生成→内容確認→「D1に保存・更新」を押す。
4. 他端末からも同じ管理者キーでD1一覧を開いて編集できる。
5. 旧版のブラウザ保存記事は下部から開いてD1に手動移行できる（自動では移行しない）。

## 注意事項

- **AI生成とD1の一覧・編集・保存・削除のすべてが管理者キー必須**。未認証の訪問者は閲覧できない。
- 旧ブラウザ保存分は消さない。D1を作っただけでは自動同期されない。
- D1に保存してもサイト公開・SNS投稿は行わない。
- 手動削除はDB側で削除し、古いブラウザ保存分には影響しない。
- Cloudflareの本番環境接続は未検証。ローカルモックでAPI試験。
- `migrations/0001_article_drafts.sql` は将来の移行管理用に同梱。

公式: https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases
