# SELLECT — 楽天アフィリエイト運用サイト / v1

Cloudflare Pages Functions + D1 + GitHub Actions. 公開側はライブラリ不要のHTML/CSS/JS。価格・レビュー・紹介報酬は架空データを使わない。

## v1に実装したもの

- 商品一覧 / ジャンル / キーワード検索 / 並び替え / 商品詳細・販売店比較
- 楽天市場の商品検索API **2026-07-01** からの取り込み（1回10件×3ページ＝1ジャンル最大30件、8ジャンル）
- 商品と販売店舗の分離保存。同一製品の自動誤統合を避け、型番確認後に管理画面から手動統合
- 価格・レビュー件数・報酬率に基づく **独自ルールスコア**。AI学習モデルではない
- 新規商品は下書き状態で保存し、承認するまでは公開サイトへ出さない
- Cloudflare Access JWTをAPI側でも検証する管理画面。個人メールの許可リスト
- 商品掲載/非公開、下書き生成（Workers AI未設定時は事実だけのテンプレ）、編集/承認
- 承認済みThreads原稿を **管理者の操作で** 投稿するAPIアダプタ（API資格情報が必要）。note原稿は手動で投稿
- 外部リンクのクリック計測、実行ログ、同期失敗時は前回のデータを保持
- GitHub Actionsによる1日1回の楽天同期。設定なしなら安全にスキップ
- `npm test` による基本テスト

## ⚠️ 未実装・未接続のもの

- 実アカウントの楽天・Threads・Cloudflare Access・D1・Workers AI連携（資格情報未提供）
- 動画生成とTikTok/Instagram投稿、日次のThreads完全自動投稿
- 収益CSVインポート・学習最適化・多重バックアップ・復元テスト・本番7日間監視
- 商品紹介記事の本格的SEO生成と自動品質検証。AIを繋いでも必ず下書きとして承認が必要
- 商品ごとの自動同一型番判定。現在は**確認できたもののみ手動統合**

## GitHub → Cloudflare Pages のビルド設定

- Framework preset: **None**
- Root directory: `/`（リポジトリのルート）
- Build command: **空欄**（空にできなければ `exit 0`）
- Build output directory: **`public`**
- APIは `/functions/api/[[path]].js` をCloudflare Pagesが自動検出する。

## 先に公開してしまわないための設定

1. **Pages** のプロジェクトをCloudflare **Access** のセルフホストアプリに追加し、検証期間は自分のメールのみ Allow。APIはJWT検証で二重防御。
2. Cloudflare D1 で `affiliate-ai-db` というDBを作成し、Pages > Settings > Bindings で **`DB`** という名前で接続（**preview と production の両方**を確認）。
3. `migrations/0001_init.sql` をD1コンソールで実行するか、Wrangler CLIで適用する。例（DB作成後）:

   ```bash
   npx wrangler d1 execute affiliate-ai-db --remote --file=migrations/0001_init.sql
   ```

4. Pages > Settings > Variables and Secrets（production、preview は別設定）に以下を設定。**秘密値はGitHubに書かない**。

   | Name | 用途 | 必須条件 |
   |---|---|---|
   | `RAKUTEN_APP_ID` | 楽天のアプリID | 商品同期時に必要 |
   | `RAKUTEN_ACCESS_KEY` | 楽天のAccess Key | **Secret**で保存 |
   | `RAKUTEN_AFFILIATE_ID` | 楽天アフィリエイトID | リンク生成に必要 |
   | `ACCESS_TEAM_DOMAIN` | 例 `https://your-team.cloudflareaccess.com` | 管理画面に必要 |
   | `ACCESS_AUD` | Accessで作ったアプリのAudience Tag | 管理画面に必要 |
   | `ADMIN_EMAIL` | 管理者本人のメールアドレス | 管理画面に必要 |
   | `SYNC_JOB_SECRET` | 24文字以上のランダムな秘密値 | GitHub Actions同期用、**Secret** |
   | `THREADS_ACCESS_TOKEN` | Threads OAuth Token | Threads投稿時だけ、**Secret** |
   | `AI_MODEL` | Cloudflare Workers AIの利用可能なモデル名 | AI文章生成を使う場合のみ |

5. Workers AIを使う場合、Pages Functionsから **`AI`** Bindingとして利用可能な構成にする（Cloudflare側の提供状況に依存）。指定がない場合はデータテンプレートへフォールバック。
6. GitHubリポジトリの **Variables** へ `PUBLIC_BASE_URL=https://...pages.dev`、**Secrets** に Pages側と同じ `SYNC_JOB_SECRET`。一致したときだけ定期同期が動く。
7. 設定後に再デプロイ。 `/api/status` でD1・楽天API・Threads・AIの設定有無を確認する（秘密値そのものは返さない）。
8. `/admin/` からジャンルを同期し、内容を確認して公開承認する。

**重要:** Cloudflare Accessポリシーで `/admin/*` と `/api/admin/*` を制限すること。JWTはAPIでも検証するが、管理画面のHTMLへの入口にもAccessが必要。本番接続前に認証とアクセス制御を必ず確認する。

## データ更新と掲載品質

- 8ジャンル×30件は取得上限の**目標**。D1無料枠の1実行あたりのクエリ数上限に合わせ、10件ずつ3ページで分割同期する。楽天APIで条件を満たす商品が少ない場合、掲載数も少なくなる。
- 商品名・価格・レビューは販売店発の情報。実売ランキングではない。
- 同一性不明の商品は自動統合しないため、初期状態では同じ型番が別商品で並ぶ場合がある。管理画面で型番確認後に統合できる。
- 投稿素材として楽天画像を動画に転用しない。許可条件を確認しない限り商品画像は紹介サイトの掲載に限定する。
- API失敗では既存の正常データを消さない。ただし、古くなった在庫・価格は保証しない。
- 楽天APIの仕様は[公式](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)で確認。リンク報酬の確定には楽天の正規成果データが必要。

## 開発とテスト

```bash
npm install
npm test
npx wrangler pages dev public --d1 DB=<D1_DATABASE_ID>
```

上記 `--d1` はローカル検証用。別途ローカルDBの初期化が必要。Cloudflare Pages公開状態の動作は資格情報と実環境が揃ってから確認する。

## 外部バックアップ（Cloudflare以外へ、多重保護）

- `.github/workflows/weekly-backup.yml` を搭載。暗号化したD1のSQLダンプをGitHubの非公開Actions Artifactへ最大30日保存する設計。
- GitHub Secrets: `CLOUDFLARE_ACCOUNT_ID`、D1の読み取り権限を持つ `CLOUDFLARE_API_TOKEN`、20文字以上の `BACKUP_PASSPHRASE` が**全て設定されるまで実行しない**。
- `BACKUP_PASSPHRASE` はGitHubと別の安全な場所にも保存する。失うと暗号化バックアップを復元できない。
- バックアップは AES-256-GCM で暗号化し、暗号化後に復号検証する。**本番DBへの自動上書きはしない**。
- ダウンロードしたバックアップの復号（復元前、管理者による承認が必要）：

  ```bash
  # BACKUP_PASSPHRASE を設定してから
  node scripts/backup-crypto.mjs decrypt affiliate-d1-backup.enc restored.sql
  ```

- **現時点で本番のバックアップ実行・復元テストを行ったわけではない。** GitHub Actionsの無料容量と実行頻度の制限、保持期間に注意する。
