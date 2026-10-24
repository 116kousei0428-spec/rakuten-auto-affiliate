# 楽天アフィリエイト — GitHub → Cloudflare Pages 対応版（再構築スターター）

**重要:** 以前の楽天計画の元ソースは復元できていません。この配布物は「GitHubに置いてCloudflare Pagesでビルド・公開できる最小構成」です。楽天API、D1、AI生成、SNS自動投稿など元計画の中核機能は含みません。

## GitHubへのアップロード
ZIPを展開して、中の**ファイル・フォルダすべて**をGitHubリポジトリのルートへアップロードします。ZIP自体をリポジトリにアップするだけでは動きません。

## Cloudflare Pages: GitHub連携設定
- Workers & Pages → Create → Pages → Connect to Git → 対象リポジトリを選択
- Framework preset: None
- Production branch: main （GitHub側のブランチ名が違う場合は合わせる）
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`（リポジトリ直下なら）
- Environment variables: 現段階では不要

`npm run build` が `public` の内容を `dist` にコピーします。`functions/api/health.js` はCloudflare Pages Functionsとして公開されます。`node_modules`をアップロードしません。

## ローカル検証
`npm run check` → `npm run build`

## 現段階の注意
本番サイト上で `/api/health` は応答しますが、楽天API・DB接続確認にはなりません。機密情報をGitHubにアップしないでください。
