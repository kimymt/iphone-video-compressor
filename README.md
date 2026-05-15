# 動画圧縮 — iPhone Video Compressor

iPhone で撮影した動画を、サーバーへ送らずに iPhone の中だけで圧縮するアプリ。

🔗 **https://ivc.mymt.casa**

---

## こんな悩みありませんか

- 動画ファイルが大きすぎてメールや LINE で送れない
- AirDrop でも転送に時間がかかる
- iPhone のストレージを動画が食いつぶしている
- 他人に動画を渡したいけれど、クラウドにアップロードするのは抵抗がある

このアプリで圧縮すると、見た目の画質をほぼ維持したままファイルサイズを **1/3〜1/10** にできます。動画データは一切外に送信されません。

---

## 対応端末

- **iOS 26 以降の iPhone**（Safari）
- iOS 25 以前は技術的に動作しません（起動時に専用画面でお知らせします）

> なぜ iOS 26 限定？
> 動画の音声を iPhone 上で再エンコードするのに必要な `AudioEncoder` API が iOS 26 で初めて使えるようになったためです。

## 対応言語

- 日本語 / English / 简体中文 / 繁體中文 / 한국어 の 5 言語
- iPhone の言語設定から自動切替（設定 → 一般 → 言語と地域）
- 設定画面（右上の歯車）から手動で言語を選ぶこともできます

---

## 使い方

### 1. ホーム画面に追加（最初の 1 回だけ）

1. iPhone の **Safari** で https://ivc.mymt.casa を開く
2. 画面下の共有ボタン（□↑）をタップ
3. メニューから **「ホーム画面に追加」** を選択
4. ホーム画面のアイコンから起動

> Safari のタブから直接使うこともできますが、ホーム画面から起動するとフルスクリーンで動作し、処理中の挙動も安定します。

### 2. 動画を圧縮する

1. **「動画を選択」** ボタンをタップして写真ライブラリから動画を選ぶ
   - 複数選択も可能。まとめてキューに入って順に処理されます。
2. 自動的に圧縮が始まります
   - 進捗バーと残り時間の予測が表示されます。
3. 完了したら **「共有」** をタップ
   - 写真ライブラリへの保存、AirDrop、LINE / メール送信、ファイルアプリへの保存などが選べます。

### 3. プリセット（画質と圧縮率のバランス）

ヘッダ右上の **歯車アイコン** から設定シートを開いてプリセットを切り替えられます。既定は **「標準 (HEVC)」**。

| プリセット | こんなときに |
|---|---|
| 最高画質 (HEVC) | 編集元素材として保管したい |
| 高画質 (HEVC) | テレビや PC でしっかり見せたい |
| **標準 (HEVC)** ★既定 | 普段使い、ストレージ節約 |
| 軽量 (HEVC) | LINE / Slack に貼り付ける |
| 互換優先 (H.264) | Android や古い PC へ渡す |
| 最小 (H.264) | メールに添付する |

> HEVC エンコードに非対応の端末では H.264 系のプリセットだけが表示されます。

---

## よくあるトラブル

### 完了音（チャイム）が鳴らない

iPhone 本体側面のスイッチと音量を確認してください。

1. **Ring/Silent スイッチを「Ring」側に倒す**（オレンジ色が見える状態を解除）
2. 音量を上げる
3. **「動画を選択」ボタンを 1 度はタップしてから処理を開始する**

> iOS の仕様で、Silent モード時は Web アプリから音を出すことはできません（アプリ側で迂回不可）。また、音声再生のためにはユーザーが画面を 1 度タップしている必要があります（最初のタップが「音を鳴らしていい」という許可になります）。

### 処理中に画面が暗くなる

ヘッダ右上のバッジを確認してください。

- **「画面 ON」**（太陽アイコン、オレンジ色）→ 画面ロック防止が有効です。問題ありません。
- **「画面 ON 失敗」**（警告アイコン、赤色）→ 画面ロック防止の取得に失敗しています。エラー名が表示されているのでスクリーンショットをいただけると改善の参考になります。

> 3〜5 分かかる長い動画でも「画面 ON」バッジが消えなければ最後まで処理できます。

### 「容量が足りません」と表示される

圧縮処理には **入力動画サイズの 2.5 倍以上** の空きストレージが必要です。

- **設定 → 一般 → iPhone ストレージ** から不要なアプリ・写真・動画を削除してください。
- アプリ内で完了済みの動画は、「共有」で写真ライブラリへ保存した後に「削除」ボタンで内部ストレージから消せます。

### 「この動画は処理できません」と表示される

動画ファイルが破損しているか、未対応のコーデックの可能性があります。

- **iPhone の設定 → カメラ → フォーマット を「高効率」** にして撮影した動画が最もスムーズに処理されます。
- 「互換性優先」設定で撮影した動画も処理可能ですが、ファイルサイズが大きくなりがちです。

---

## プライバシー

- **動画はあなたの iPhone から外に出ません。**
- すべての処理は iPhone の Safari 内で完結します。
- サーバーへのアップロード、ログ記録、認証、ユーザー追跡は一切ありません。
- 出力動画には EXIF や **位置情報も含まれません**（プライバシー保護のため自動削除）。

サービス自体は静的ファイル（HTML / JavaScript）が Cloudflare Pages から配信されているだけで、動画データを受け取る API は存在しません。

---

## アップデート

ホーム画面から起動すると、最新版がある場合は自動的に更新されます。

新機能が反映されない場合は、ホーム画面のアイコンを長押し →「削除」→ もう一度 Safari で開いてホーム画面に追加し直してください（古いキャッシュが残っているケースの確実な対処法）。

---

## 既知の制限

- **iPad 横画面 / 大画面レイアウト**: 現状未対応（今後のアップデートで予定）
- **1GB を超える出力**: iOS の共有メニューで失敗しやすいため、自動的にダウンロード形式へ切替
- **編集機能 / ComparePreview**: なし（圧縮に特化）
- **中断地点からの再開**: 処理中にアプリが落ちると最初からやり直しになります（中断レジューム機能は将来のアップデートで検討中）

---

## フィードバック

不具合報告や要望は GitHub Issues へ:

🐛 https://github.com/kimymt/iphone-video-compressor/issues

実機での問題報告には、エラー画面のスクリーンショットと、iOS のバージョン（設定 → 一般 → 情報）を添えていただけると助かります。

---

<details>
<summary>開発者向け情報</summary>

ソースコード: https://github.com/kimymt/iphone-video-compressor

技術的な仕様や実装フェーズの詳細は [CLAUDE.md](./CLAUDE.md)、未着手項目は [TODOS.md](./TODOS.md) を参照してください。

### 技術スタック

Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS + Zustand + WebCodecs API + mediabunny + OPFS + IndexedDB + vite-plugin-pwa。

### ローカル開発

```bash
npm install
npm run dev           # http://localhost:5173 (Service Worker は dev でも有効)
npm run build         # tsc -b + vite build
npm run preview       # vite preview → http://localhost:4173
```

### テスト

```bash
npm test                    # Vitest (unit)
npm run test:e2e            # Playwright (dev サーバー)
npm run test:e2e:offline    # build + preview のオフライン検証
```

### iPhone 実機での動作確認

Cloudflare Tunnel で HTTPS URL を発行して iPhone Safari で開きます。

```bash
# Terminal A
npm run dev
# Terminal B
cloudflared tunnel --url http://localhost:5173
# → 出力された xxx.trycloudflare.com を iPhone Safari で開く
```

Vite 5.4.12+ のホスト制限により、`vite.config.ts` の `server.allowedHosts` に `.trycloudflare.com` を含めています。

### デプロイ

`main` への push で Cloudflare Pages が自動ビルド・デプロイします。

- 本番: https://ivc.mymt.casa
- 別 URL（同じビルド）: https://iphone-video-compressor.pages.dev
- Build command: `npm run build` / Build output: `dist` / Framework preset: None
- Pull Request ごとに Preview Deployment が自動生成されます

### テストフィクスチャ再生成

`tests/fixtures/` の動画は commit 済みです。再生成が必要な場合は ffmpeg と素材を用意して下記コマンドで作成できます（詳細は `tests/fixtures/README.md`）。

```bash
ffmpeg -i source-portrait.mov -t 1 -b:v 500k -c:v hevc_videotoolbox -tag:v hvc1 \
  tests/fixtures/portrait-rotation-1s.mov

ffmpeg -i source.mov -t 1 -vf scale=1920:1080 -c:v libx264 -profile:v baseline \
  -b:v 800k tests/fixtures/landscape-1080p-baseline-h264-1s.mp4

ffmpeg -i source-hdr.mov -t 1 -c:v hevc_videotoolbox -tag:v hvc1 \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  tests/fixtures/landscape-hevc-hdr-1s.mov

head -c 30000 tests/fixtures/landscape-1080p-baseline-h264-1s.mp4 \
  > tests/fixtures/corrupt-truncated.mp4
```

### アイコン

`public/icons/` の 4 PNG（192 / 512 / maskable / apple-touch-icon 180）は現状 ffmpeg で生成したダミー（`#0a0a0a` 背景 + `#0a84ff` の中央ブロック）です。リリース前にデザイナーが作成した素材で差し替えてください。

</details>

---

## ライセンス

このリポジトリは個人プロジェクトであり、現時点でライセンスは未定です。
