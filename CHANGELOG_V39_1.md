# 余談商店 v39.1 — 楽天API HTTP 400の発生箇所特定用

## 現状と目的

v39の商店おすすめが `RAKUTEN_API_HTTP_400` を出した。v39は楽天APIのHTTPステータスのみ記録し、どのAPIへのどのリクエストで400が発生したか、楽天のJSONエラー種別が何かを記録していなかった。そのため、現時点では根本原因は確定していない。

## 今回追加した処理

- HTTP 400に限り楽天のJSON応答の `error` と `error_description` を読み取り、後者から既知のパラメータ名だけを抽出する。
- エラーコードに発生箇所（`GENRE_ROOT`, `GENRE_RANKING`, `TREND_SEARCH`）と、分かる場合はパラメータ名（例：`GENRE_ID`, `APP_ID`）を付ける。
- D1の既存おすすめ棚テーブルの失敗記録に `stage`, `providerErrorCode`, `parameterHint`, `affectedGenreId` を付与する。既存の列追加・削除はなし。`/api/picks/recommended` の応答にも同じ情報を追加する。
- 送信先URL、認証キー、リクエスト・レスポンス本文などは記録・画面表示しない。
- 商品選定、楽天APIリクエストパラメータ、トレンド、Threads投稿、記事生成、ランキング表示、Cron設定、D1のバインディングは一切変更しない。

## ローカル検証

- `npm run check`: 148件成功（既存147件＋診断テスト1件）。
- HTTP 400をジャンル取得とジャンル別ランキングで模擬し、発生箇所とパラメータ名を安全に識別することを確認した。
- 本番楽天APIへのアクセスは未実施。本番でHTTP 400の原因が解消されると保証するものではない。これは**原因特定用**の最小改修である。

## 次の手順

デプロイ後、おすすめ棚を表示し、エラーメッセージの末尾の診断コードを報告してもらう。必要な場合は `https://(自身のWorkersドメイン)/api/picks/recommended` のJSON応答にある `failureStage`, `providerErrorCode`, `parameterHint`, `affectedGenreId` を確認。これらは秘密情報を含まないよう処理している。原因確定後に、その原因だけを修正する。
