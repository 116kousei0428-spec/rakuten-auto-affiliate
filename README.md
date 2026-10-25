# 楽天アフィリエイト GitHub → Cloudflare Workers v9

v8で「楽天APIへの通信に失敗」が発生した場合の診断強化版。

## 主な変更
- v8 の `redirect: 'error'` を `redirect: 'follow'` に変更。3xx応答を即時通信エラーにしない。
- APIの `accessKey` をURLからヘッダーに移動。楽天2026-07-01公式ドキュメントで認められた指定方法。
- 本番サイトの `Referer` を付加。登録済み許可ウェブサイトと一致する必要あり。
- 20秒のタイムアウトと、それ以外のfetch例外を別の安全なエラーコードで通知。
- Cloudflareログに例外の種類のみ記録（秘密鍵、URL、生のエラーメッセージは記録しない）。
- Worker名を `rakuten-auto-affiliate` に統一。

## 公開方法
GitHubリポジトリ直下に `worker.js`、`wrangler.jsonc`、`public/`、`package.json`、`scripts/`、`tests/` を配置。Cloudflareデプロイコマンドは `npx wrangler deploy`。

事前にCloudflare本番環境のSecretに次の3変数が登録されている必要あり（コードに値を書かない）：`RAKUTEN_APP_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID`。

## デプロイ後の確認
- `https://rakuten-auto-affiliate.116kousei0428.workers.dev/api/health`
- `https://rakuten-auto-affiliate.116kousei0428.workers.dev/api/search?keyword=イヤホン`
- 応答の `errorCode` が `UPSTREAM_FETCH_REJECTED` なら接続処理・リダイレクト・ネットワーク関連、`UPSTREAM_TIMEOUT` なら20秒超過、`upstreamStatus` 403/429なら楽天側のHTTP応答。

**検証上の制約**: 自動テストはAPIモックによるもの。楽天の実サーバー/Cloudflare本番での成功は未検証。原因の確定にはデプロイ後の診断コードが必要。

API仕様: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
