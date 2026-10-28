# 楽天アフィリエイト v14 — D1記事公開

GitHub → Cloudflare Workers 用。商品検索・Workers AI記事生成・既存D1記事データを維持。

## 公開設定
- 既存の `wrangler.jsonc` にDB設定済み：`rakuten-affiliate-db`。変更不要。
- Cloudflare Secret（`RAKUTEN_APP_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID`、`AI_ADMIN_TOKEN`）も変更不要。
- GitHubのリポジトリ **直下** に解凍したファイルの中身を上書き。ZIPファイル自体や親フォルダごとアップロードしない。
- デプロイコマンドは `npx wrangler deploy`。ビルド不要。
- デプロイ後 `/api/health` の `release: v14` と `dbConfigured: true` を確認。

## 記事を公開する
1. サイトで管理者キーを入力し「D1一覧を読み込む」。
2. 保存済み記事の「公開」を押す、または記事を開き「保存して公開・更新」。
3. `/articles` に公開記事だけが表示される。公開URLは `/articles/<記事ID>`。
4. 「公開停止」で一般の訪問者から非表示にする。D1下書きは残る。
5. AI生成の自動保存・即時公開はチェックボックスで明示的にONにできる（初期OFF）。

## データの扱い・安全性
- **既存の `article_drafts` テーブルは変更しません**。新規 `article_publications` テーブルに公開時のスナップショットを保存します。初回に管理者がD1操作すると自動作成。
- D1下書きは管理者キー必須。公開記事の閲覧は鍵不要。管理者の編集は公開URLに反映されず、「保存して公開・更新」するまで以前の公開内容が維持されます。
- 下書きを削除する場合、D1のトランザクションで公開スナップショットも削除します。
- 公開記事のMarkdownはエスケープして安全なHTMLへ変換します。外部リンクはHTTPSだけを許可します。
- AIが作る内容は誤り得るため、通常は公開前の内容確認が必要です。広告注記は公開ページにも表示します。
- SNS自動投稿は **未実装**。
- 本番でのCloudflareデプロイは未検証。Nodeのローカルモックテストとビルドチェックを実施。

参考：https://developers.cloudflare.com/d1/worker-api/
