# 楽天アフィリエイト v15 — 雑学から始まるThreads投稿

GitHub → Cloudflare Workers のプロジェクトルートにZIPの**中身だけ**をアップロードする。

## 追加機能

公開済み記事の「雑学→Threads投稿文」から、以下の順序でThreads投稿文を作成する。

1. 【ちょっとした雑学】（事前に用意した分野別の一般的な説明。根拠のない商品効果は付けない）
2. 【商品紹介】（D1の公開記事タイトルから作成）
3. 公開記事へのリンク
4. 「※PR・アフィリエイト広告を含みます」

**投稿文は自動送信されない。** 編集・コピー・D1保存はMeta連携なしで使える。Threadsへの直接送信にはMeta Threads APIの認証が別途必要。

### デプロイ方法

- GitHubのルートにZIP解凍後のファイルを配置（ZIPや親フォルダのままアップロードしない）。
- Cloudflare Deploy command: `npx wrangler deploy`
- `wrangler.jsonc`の`name`は`rakuten-auto-affiliate`、エントリポイントは`./worker.js`。DBのIDは既存のものを継承。
- 登録済みのSecret：`RAKUTEN_APP_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID`、`AI_ADMIN_TOKEN` はそのまま。D1の既存`article_drafts`と`article_publications`を削除・変更しない。
- `GET /api/health`の`release: "v15"`を確認。UI上部にも`UI v15`。

### 雑学投稿を作る

1. 管理者キーを入力し「D1一覧を読み込む」。
2. 公開済み記事の横にある「雑学→Threads投稿文」を押す。
3. 投稿文を確認し、必要なら編集して「投稿文をD1に保存」。
4. Threads連携前は「投稿文をコピー」で手動投稿できる。

初回操作で`threads_posts`テーブルを自動作成。記事テーブルとは分離している。Meta側へは公開済みの投稿を重複送信しない設計だが、通信が途中で切れた場合は投稿結果が不明になるため、再送信は自動実行せず停止する。

### Threads APIを接続したい場合

Meta DevelopersでThreads用アプリとOAuth認証を設定し、投稿先のThreadsアカウントから権限（少なくとも`threads_basic`、`threads_content_publish`）を付与されたThreads User Access Tokenを取得する。

Cloudflareの**生産環境**に次のSecretを追加（GitHubに書かない）。

- `THREADS_ACCESS_TOKEN` — Threadsユーザーのアクセストークン（秘密情報）

登録後に再デプロイして`/api/health`の`threadsConfigured: true`を確認。UIの「Threadsへ投稿（承認後）」ボタンは投稿文をD1に保存し、ユーザーが確認ダイアログで承認した時だけMeta APIに送信する。

Meta公式APIは `/me/threads` にテキストのコンテナー作成、`/me/threads_publish` にそのIDを使って公開する方式。https://www.postman.com/meta/threads/collection/dht3nzz/threads-api

**注意:** 投稿先のMetaアプリの権限、審査・開発モード、アクセストークンの有効期限の条件がある。これらはまだ本番接続テストしていない。v15はOAuth接続画面・自動トークン更新・予約/定期自動投稿を含まない。接続まではコピーで手動投稿する。

### 説明・制約

- 雑学文は**現状、検証可能な一般知識に限定した固定テンプレート**から選択する。AIが毎回新しい雑学を発明するわけではない。事実関係を確認してから投稿すること。
- 500文字以内、記事リンクとPR明記を必須とする。楽天の記事そのものは従来通りAI作成とD1公開が可能。
- 公開記事がないと投稿文を作れない。1つの公開記事につき投稿下書きは1件。
- 外部投稿が成功してD1更新に失敗した場合など、送信状態が不明なケースでは管理者によるMeta上の確認が必要。
- 今回の検証はNodeのローカルテストおよびビルドチェック。Cloudflare/Meta本番通信は未検証。

## 開発者向け検証

```bash
npm run build
npm run check
```
