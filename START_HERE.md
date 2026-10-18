# 最初にやること（最短手順）

**現状：コードと画面は作成済み。公開アカウントへの接続は未実施。架空商品や架空報酬は表示しない。**

1. ZIPを解凍し、中身をすべて GitHub の連携済みリポジトリ直下へアップロードする。ZIPそのものや外側のフォルダだけを入れない。
2. Cloudflare Pagesのビルド設定：Framework **None**、Build command **空欄**、Output directory **`public`**。GitHub連携で自動デプロイされる。
3. D1で **`affiliate-ai-db`** を作り、Pages Functionsに **`DB`** という変数名でバインド。`migrations/0001_init.sql` をD1コンソールで実行する。
4. Cloudflare Accessで管理画面を本人限定にして、Pagesの Variables/Secrets に楽天APIの認証情報・Access JWT検証用設定を登録する。項目名は `README.md` を参照。未設定だと管理画面は操作できない（安全な初期状態）。
5. `/admin/` から楽天データを取得（8ジャンル×3ページ）→実在商品を確認→公開承認。
6. GitHub Secrets・Variablesを設定すると、毎日の商品自動同期が有効になる。外部暗号化バックアップは別途Secretsを設定するまで起動しない。

**注：** 日付・価格・報酬の正確性は楽天公式の実データと成果レポートに依存。Threads、Workers AI、バックアップの本番連携は各認証情報が必要。TikTok・Instagramの自動化は今後の段階。
