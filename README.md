# 楽天アフィリエイト GitHub → Cloudflare Workers v11 / AI記事下書き生成

## 追加した機能

- **既存の楽天商品検索APIは維持**（同じ `worker.js`, 同じ API route, 同じ3つの認証Secret）。
- 商品の「AI記事を作成」→ Cloudflare **Workers AI** で日本語の紹介記事を生成。
- 広告表記、参考価格、アフィリエイト商品URLを記事に含める。AIに未確認スペック・使用経験を捏造させない指示付き。
- 記事をプレビューではなく**編集可能なMarkdown下書き**として表示。コピー、Markdownダウンロード、ブラウザ内の下書き保存（最大15件）。
- 記事作成APIは `AI_ADMIN_TOKEN` による認証付き。鍵がないリクエストではAIを実行しない。
- 自動公開・定期生成・SNS自動投稿・DB同期は未実装。記事は公開前に要確認。

## GitHubへの配置

ZIPを展開し、以下を**GitHubのリポジトリ直下**に上書きします（ZIP全体をフォルダとしてアップロードしない）。

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

CloudflareのDeploy commandは**`npx wrangler deploy`**を維持。`wrangler.jsonc`のエントリポイントは**`./worker.js`**です（`src/worker.js`ではありません）。`"name": "rakuten-auto-affiliate"` と `"ai": {"binding":"AI"}` が含まれています。

## Cloudflareに追加する設定（初回だけ）

Cloudflare → 対象Worker → 設定 → 変数とシークレット → 変数を追加

- 環境：**生産**
- 鍵：**`AI_ADMIN_TOKEN`**
- 価値：**自分で決めた推測されにくい長い文字列（推奨20文字以上）**
- 種類：**Secret（秘密）**
- 「変数を追加してデプロイ」を実行

この値はGitHubやチャットに書かないでください。楽天の既存3つのSecret（`RAKUTEN_APP_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID`）は変更不要です。

Workers AIのbindingは `wrangler.jsonc` で追加済みです。クラウド側の利用権限が必要です。公開後の `/api/health` で `aiConfigured:true`、`aiAdminConfigured:true` を確認できます（鍵自体は表示されません）。

## 操作

1. デプロイ後、サイトを開いて商品検索（例：イヤホン）。
2. 「管理者キー」に登録した `AI_ADMIN_TOKEN` を入力。ブラウザに永続保存されません。
3. 好みの文体を選択し、商品カードの **AI記事を作成** を押す。
4. 下書きの内容・価格・商品ページを確認し、必要に応じて編集。コピー／Markdownを保存。

下書きのブラウザ保存は**localStorageのみ**。別PCとの同期、公開記事データベースはまだありません。ブラウザデータ削除で消えるため、必要ならMarkdownファイルをダウンロードしてください。

## コストと制限

Workers AIはFreeプランに1日10,000 Neuronsの無料枠があります。超過時、Freeでは生成失敗、Paidでは従量課金になり得ます（2026-10-27時点の公式情報）。無制限での連続自動生成は実装していません。詳細：https://developers.cloudflare.com/workers-ai/platform/pricing/

## テスト結果／制約

`npm run check` でGitHubの配置検査と24件のローカルモックテストが成功。**Cloudflare本番への新規デプロイ、実際のWorkers AI推論、楽天APIとの結合確認は未実施**です。ブラウザ自動E2Eテストも未実施です。秘密情報は同梱していません。

公式仕様：
- https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/
- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://webservice.rakuten.co.jp/documentation/ichiba-item-search
