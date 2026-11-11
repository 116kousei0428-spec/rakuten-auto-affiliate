# 余談商店 v39.2 — ジャンル別おすすめAPIの400対策

## 観測された問題（本番診断データ）

- `failureCode = RAKUTEN_GENRE_RANKING_HTTP_400`
- `failureStage = GENRE_RANKING`
- `providerErrorCode = wrong_parameter`
- `parameterHint = null`（エラー本文に不正パラメータ名がない）
- `affectedGenreId = 100000`

ジャンルID `100000` は「百貨店・総合通販・ギフト」。ジャンル一覧にあることと、そのジャンルのランキングがAPIで取得できることは同義ではない。取得できないランキングカテゴリが混じると以前の処理は棚全体を `failed` にしていた。

## 変更した処理

- 楽天ランキングAPIで取得できないと報告されている大分類ID `100000`・`101114`・`111427` はおすすめ棚の「ランキング取得候補」から外す。既存ランキングAPI・商品検索APIの除外処理ではない。
- ランキングAPIがジャンルごとに `400/wrong_parameter`（パラメータ名不明・または `genreId` と判定）や `404/not_found` を返した場合、そのジャンルを飛ばして別ジャンルの取得を継続する。
- 1日につき原則12ジャンルの商品を集め、必要なら最大18ジャンルを順次試す。並列アクセスは行わない。取得できた実商品だけで棚を作る。
- 認証情報の不正が判明する400、429、403、その他の予期しないAPIエラーは従来どおり停止して診断情報を残す。全ジャンルが失敗し商品を生成できない場合も、成功したようには見せない。
- 既存のPR・雑学・Threads自動投稿、楽天総合ランキング1〜40位、Google Trends連携、D1設定、Cron、UIは一切変更しない。

## テストと制約

- `npm run check`：150件すべて通過（v39.1の148件＋今回の2件）。
- 模擬HTTP 400/404が混じっても12ジャンル・48実商品を生成できることを確認。
- 認証設定の誤りをジャンル固有のエラーとして握りつぶさないことを確認。
- 実際の楽天APIへの認証付き呼び出し、およびCloudflare本番へのデプロイは未実施。現時点で本番復旧は未確認。

## 導入後

1. 新ZIPをGitHub/Cloudflareへデプロイ。
2. 既存の失敗行の再試行待ち（約5分）が終わると、次回おすすめ棚アクセスで再生成を試みる。既存のD1データやテーブルを削除しない。
3. `/api/picks/recommended` で `status` / `current` / `items` を確認する。成功時は `current:true` かつ実商品の配列が返る。失敗時は新しい `failureCode`, `failureStage`, `affectedGenreId` を確認する。

**参考**：楽天公式ランキングAPI仕様 `https://webservice.rakuten.co.jp/documentation/ichiba-item-ranking`、楽天暮らしナビ（ランキング取得不可の大分類について） `https://kurashi-kaimawari.com/rakuten-ranking/`
