# 楽天アフィリエイト v16 — ジャンル別雑学・短い商品紹介・管理者キー保存・Threads接続確認

## GitHubにアップロードする前に

**これは既存v15に上書きする更新版です。** ZIPを解凍し、`worker.js`と`wrangler.jsonc`が**リポジトリ直下**に見えるように、ZIPの中身だけをGitHubへアップロードします。POSのリポジトリには上げないでください。

Cloudflareの既存Workerは `rakuten-auto-affiliate`、GitHub連携のデプロイコマンドは `npx wrangler deploy` を維持します。

- `wrangler.jsonc`: エントリポイント `./worker.js`、静的ファイル `./public`、AI `AI`、D1 `DB` を維持。
- D1: 既存の `rakuten-affiliate-db` とIDを維持。既存の `article_drafts`、`article_publications`、`threads_posts` のデータは削除しません。
- 既存Secret: `RAKUTEN_APP_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID`、`AI_ADMIN_TOKEN` は再登録不要。
- ZIPにキー・トークンの実値は入っていません。GitHubに認証情報をアップロードしないでください。
- デプロイ後 `https://rakuten-auto-affiliate.116kousei0428.workers.dev/api/health` で `release: "v16"` を確認。

## v16の変更点

### 1. 雑学を商品ジャンルから自動選択

日本酒、お茶、コーヒー、イヤホン、充電器、水筒、靴、照明、美容・ケア、掃除機に、事実確認可能な短い雑学テンプレートを用意しました。**現時点ではAIが無制限に雑学を創作するものではありません。** カテゴリ未判定時のみ汎用の注意事項を使用します。誤情報を自動投稿しないため、公開前の確認は引き続き必要です。

日本酒の例: 「一升は約1,800mL、一合は約180mL」。出典: https://www.sawanotsuru.co.jp/site/nihonshu-columm/knowledge/180cc-of-sake-cal/

### 2. 短い商品紹介

検索用の長い商品名を丸写しせず、カテゴリ別の自然で短い紹介文を作ります。構成は「雑学 → 商品紹介 → 公開記事リンク → PR表記」、500文字以内。既存Threads下書きは勝手に変更しません。

**既存の日本酒の下書きを改善する場合:** 楽天サイトでThreads下書き一覧を読み込み、その下書きを「開く」→「雑学・紹介文を再生成」→確認ダイアログで承認。D1に新しい文面が保存されます。**手動編集済みの旧文面は上書きされる**ため注意してください。送信済み・送信中の文面は再生成できません。

### 3. 管理者キーを任意で端末保存

管理者キー入力欄の下に「この端末に管理者キーを保存する」を追加しました。初期OFF。ONにすると同じブラウザ・同じサイトで自動入力し、OFFまたは「保存したキーを削除」で削除できます。キーは `localStorage` に保存され、平文で端末に残るため、**共有端末ではONにしないでください。** ブラウザデータ削除でも消えます。GitHubやD1には保存しません。

### 4. Threads接続設定の案内と診断

サイトの「Threads連携設定」に「Threads接続を確認」ボタンを追加。管理者キーによる認証後、Metaの `/me?fields=id,username` に問い合わせ、トークンが有効ならアカウント名を表示します。トークン本体は返しません。

直接投稿には、MetaのThreadsアプリと OAuth のユーザー認証、`threads_basic` と `threads_content_publish` の権限を持つThreads User Access Tokenが必要です。取得したトークンをCloudflareの**生産環境**のSecret `THREADS_ACCESS_TOKEN` に登録してください。Meta公式のThreads API資料: https://www.postman.com/meta/threads/collection/dht3nzz/threads-api

この版は**接続診断と既存の承認後投稿処理**まで。Metaでのアプリ登録・OAuth自動連携・トークンの自動更新・定期自動投稿は未実装です。トークンがまだなければ下書き作成・D1保存・コピーを使えます。Metaへの実投稿は公開前に確認ダイアログを表示します。

## 検証

- `npm run build` — 公開用のソース構成・エントリポイント・D1バインディング・UIの一致を確認
- `npm run check` — Nodeのローカルテスト45件
- D1の保存・既存記事の保持、雑学投稿、再生成、投稿重複防止、管理者キーの端末保存/削除をモックで確認
- **未検証:** 実際のCloudflareデプロイ、Metaへの接続・投稿（認証情報がないため）。本番成功を保証しません。

### 重要

投稿文や紹介記事は、掲載前に商品仕様・価格・根拠を確認してください。誤情報や重複投稿を避けるため、外部送信が不明な場合は自動再送を停止します。
