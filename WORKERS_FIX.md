# Cloudflare Workers版：デプロイエラーを修正

## 何が起きたか
GitHub連携先がCloudflare **Workers** であるのに、元のパッケージは **Pages Functions** 向けで、公開先を `public` に絞るWorkers設定が不足していました。結果、ビルドはリポジトリ全体（依存パッケージ等）を静的ファイルとしてアップロードしようとして25MiB上限エラーになりました。

## 対応
- `wrangler.jsonc`: Workerの公開アセットを `./public` に限定します。
- `src/worker.js`: `/api/*` を既存のAPIへ渡し、サイトは静的ファイルで表示します。
- `package.json`: ローカルの起動方法をWorkersに合わせます。

## GitHub側の作業
既存のリポジトリに修正版のファイルを反映します（ZIPをそのままアップロードしません）。今回のエラーだけなら `wrangler.jsonc` と `src/worker.js` の2つが主要な修正です。GitHub上に以前の `wrangler.toml` / `wrangler.json` / `wrangler.jsonc` があれば、設定ファイルは1つに統一してください。

## Cloudflareの設定
既存のWorkersプロジェクトを使えます。GitHubにpush後、Cloudflareのデプロイでコマンドが `npx wrangler deploy` なら `wrangler.jsonc` を参照します。ビルドコマンドは空欄または既存のままで大丈夫です。コンソールの設定がリポジトリ全体を公開する明示的なコマンド（例: `npx wrangler deploy --assets .`）になっている場合は `npx wrangler deploy` に変更します。

## 成功判定
- 静的アセットの対象が `./public` になっている。
- トップページが表示される。
- `/api/status` がJSONを返す。D1未接続なら `ready:false` は正常。

本番運用に進む前にD1のバインディング・認証情報の設定が必要です。管理画面にはCloudflare Accessの認証保護を設定してください。
