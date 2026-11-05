# v30 — 黒板画像の配信不具合修正

## 再現と修正

- v29では画像ファイル `public/hero-blackboard-scene.webp` の存在のみをテストし、ブラウザで利用する `/hero-blackboard-scene.webp` への GET を検査していなかった。
- v30ではWebP画像をWorker本体にも埋め込み、静的アセットのアップロード状況に依存せず `/hero-blackboard-scene.webp` を直接返すよう変更。
- GET/HEAD対応、正確なContent-Type・Content-Length、ファイルとのバイト列一致を新テストで確認。
- 既存の黒板サイズ・配置、価格修正、キャッシュ更新などの機能は維持。
- ヘルスチェックとヘッダーのリリース表示を `v30` に更新。

**注意:** このZIPをCloudflareに反映する必要があります。実際の公開サイトでの画像読み込みはデプロイ後に確認してください。

## 検証（追加）
- 画像URLをWorkerに直接GET/HEADして、画像ファイルのバイト一致までテスト（静的ASSETSを設定せずに実行）。
- `node scripts/check.mjs` 合格。
- `node --test tests/*.test.mjs`: 89/89合格。
