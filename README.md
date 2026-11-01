# 余談商店 v21 — 猫ロゴ修正・管理者専用の作業台

**元のCloudflareアカウントにある既存Worker `rakuten-auto-affiliate` 向け**です。新しいCloudflareアカウント／`yodan-shoten` リポジトリにはアップロードしないでください。

## 変更内容

- `/`：余談商店の一般向けトップ。商品検索、楽天ランキング、商店おすすめが使えます。記事作成、下書き編集、Threads投稿は含まれません。
- `/shop` と `/articles`：公開された読みものを誰でも閲覧できます。
- ページの**一番下に小さな「管理者」**が表示されます。押すとパスワード入力欄が開きます。
- ログインに成功した場合にだけ `/admin` へ移動し、記事作成・編集・D1保存・Threads投稿が可能になります。URLの直打ちでは作業台を開けません。
- 未認証の `/api/articles/generate`、`/api/drafts/*`、`/api/social/threads/*` はサーバー側で拒否します。旧 `AI_ADMIN_TOKEN` を使ったプログラム連携は互換性のため残していますが、Web画面では使用しません。
- ログインセッションは Secure / HttpOnly / SameSite=Strict Cookieで約4時間有効。5回のログイン失敗でそのアクセス元を15分間ロックします（D1を利用）。
- 猫のロゴは静的アセットのアップロードに依存せず、Workerが `/yodan-logo.webp` から直接返します。faviconにも設定しました。
- D1のバインディングは旧環境のまま。既存のAI・楽天API・Threads用Secretも維持します。

## アップロードする前に【必須の1回だけの設定】

Cloudflareの**旧アカウント** → Workers & Pages → `rakuten-auto-affiliate` → **設定 → 変数とシークレット → 追加**。

- 種類：`Secret`
- 変数名：`ADMIN_PANEL_PASSWORD`
- 値：今回指定された管理者パスワード

**値はこのZIP・GitHubリポジトリに一切含めていません。** 管理者パスワードをソースコードや `wrangler.jsonc` に貼り付けないでください。Secretを保存・デプロイしてからコードを反映してください。Secret未設定時は管理画面にログインできない安全側の動作になります。

*指定されたパスワードは推測されやすい日付パターンを含むため、公開運用時は、CloudflareのSecret値だけを長くランダムな文字列に変更することを推奨します。*

## デプロイ

1. このZIPを解凍する。
2. **元の**GitHub「楽天自動アフィリエイト」リポジトリに、ZIPの中身をディレクトリ構造そのまま上書き。
3. Cloudflareの旧Workerのデプロイが成功したことを確認。
4. 公開トップで猫ロゴと最下部「管理者」を確認し、ログインして `/admin` を開く。
5. 商品検索、記事保存、公開記事、Threads接続を確認する。

**旧D1を削除しないでください。** 既存の記事データはD1に保存されています。

## 技術情報

- Worker: `worker.js`、Cloudflare設定: `wrangler.jsonc`、管理者UI: `public/index.html`、公開UI: `public/visitor.html`。
- ロゴのWebPは `public/yodan-logo.webp` にも残し、Worker内にも埋め込んでいます。
- テスト：`npm run check`（Node.jsが必要）。
- このパッケージはローカルテスト済み。本番CloudflareのSecret登録、デプロイ、実際のログイン・Threads送信は未実施です。
