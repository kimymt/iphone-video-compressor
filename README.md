# 動画圧縮 PWA

iOS 26 専用の、サーバーレスで動く動画圧縮 PWA。すべての処理は iPhone Safari 上で完結し、動画はサーバーへ送信されません。

**本番:** https://ivc.mymt.casa — Cloudflare Pages、main 自動デプロイ
**ソース:** https://github.com/kimymt/iphone-video-compressor

## 何ができる

- iPhone で撮影した動画 (HEVC/H.264、MOV/MP4、HDR/HLG 含む) を選んでローカルで圧縮
- 複数ファイルをまとめて投入、順次 (またはハイエンド端末では 2 並列) で処理
- 6 個の固定プリセットから画質と互換性のバランスを選択
- 進捗バーと残り時間予測を表示
- 完了した動画は Web Share API で写真ライブラリや他アプリへ直接共有
- PWA としてホーム画面に追加してスタンドアロン起動
- 処理中も Wake Lock で画面がスリープしない
- アプリ再起動後もキュー状態を OPFS / IndexedDB から復元

## 対応端末

- **iOS 26 以降の Safari のみ**
- iOS 17〜18.x は `AudioEncoder` 未実装のため音声再エンコードができず非対応
- 非対応端末では起動時に専用画面 (`UnsupportedScreen`) を表示

## 既知の制限

- ファイル本体はデバイス内に留まる (OPFS) ため、別端末との同期はできない
- Wake Lock はタブ非表示で自動解除される (visibilitychange で再取得を試みる)
- 1GB 超の出力は Web Share でほぼ確実に失敗するため、自動でダウンロードフォールバックする
- VideoToolbox の HEVC エンコーダは単一ハードウェアリソース。2 並列で遅くなる端末がありうるが、現状は自動ベンチを無効化している ([TODOS.md](./TODOS.md) の「V2: HEVC 並列ベンチマーク」参照)
- iPhone Air は `navigator.hardwareConcurrency` が 4 に capped されるため、parallelism は常に 1
- カスタムプリセット / ComparePreview / View Transitions / 英語 UI は MVP 外 (V2)
- iPad の横画面 / 大画面レイアウトは MVP 外 (V2)
- アイコンはダミー画像のみ。実機リリース前に [public/icons/](./public/icons/) を差し替えること

## プリセット (6 種固定)

| key | label | codec | maxLongEdge | videoBitrate | audioBitrate |
|---|---|---|---|---|---|
| `best-hevc` | 最高画質 (HEVC) | HEVC | (オリジナル維持) | 12 Mbps | 192 kbps |
| `high-hevc` | 高画質 (HEVC) | HEVC | 1080 | 5 Mbps | 128 kbps |
| `standard-hevc` ★既定 | 標準 (HEVC) | HEVC | 1080 | 3 Mbps | 128 kbps |
| `light-hevc` | 軽量 (HEVC) | HEVC | 720 | 1.5 Mbps | 96 kbps |
| `compat-h264` | 互換優先 (H.264) | H.264 High | 1080 | 5 Mbps | 128 kbps |
| `min-h264` | 最小 (H.264) | H.264 Baseline | 480 | 800 kbps | 64 kbps |

HEVC 未対応端末では `getAvailablePresets(envCheck)` が H.264 系 2 個のみを返します。

## 技術スタック

| 領域 | パッケージ |
|---|---|
| ビルド | Vite 5 |
| UI | React 18 + TypeScript (strict, no `any`) |
| スタイル | Tailwind CSS + CSS 変数 (iOS HIG トークン) |
| 状態管理 | Zustand |
| 永続化 | OPFS + IndexedDB (idb) |
| 動画処理 | WebCodecs API (ネイティブ) |
| Demux / Mux | mediabunny |
| PWA | vite-plugin-pwa (Workbox, autoUpdate) |
| アイコン | lucide-react |
| ユニットテスト | Vitest (jsdom) |
| E2E | Playwright (WebKit + iPhone 15 viewport) |

## ローカル開発

```bash
npm install
npm run dev           # http://localhost:5173 (Service Worker は dev でも有効)
npm run build         # 本番ビルド (tsc -b + vite build)
npm run preview       # dist/ を http://localhost:4173 で serve
```

### iPhone 実機での確認

Cloudflare Tunnel で HTTPS の URL を発行して iPhone 26 Safari で開く:

```bash
# Terminal A
npm run dev
# Terminal B
cloudflared tunnel --url http://localhost:5173
# → 出力された xxx.trycloudflare.com を iPhone Safari で開く
```

Vite 5.4.12+ のホスト制限により、`vite.config.ts` の `server.allowedHosts` に `.trycloudflare.com` を含めています。

### テスト

```bash
npm test                # Vitest (unit)
npm run test:watch      # ウォッチモード
npm run test:e2e        # Playwright (dev サーバー上)
npm run test:e2e:offline  # build + preview + オフラインキャッシュ検証
```

## デプロイ

**Cloudflare Pages** で `main` を自動デプロイしています。

- 本番: https://ivc.mymt.casa (カスタムドメイン)
- Cloudflare 配下のデフォルト URL: `https://iphone-video-compressor.pages.dev` も同じビルド
- Build command: `npm run build` / Build output: `dist` / Framework preset: None
- `main` への push でビルド + 再デプロイ、Pull Request ごとに Preview Deployment が自動生成 (`<pr-id>.iphone-video-compressor.pages.dev`)
- HTTPS は Cloudflare が自動。iOS の Service Worker / OPFS persist / WebCodecs secure context 要件をすべて満たす

mediabunny は現状 SharedArrayBuffer を要求しないため `public/_headers` の COOP/COEP 設定は不要です。

### iPhone 実機で開く

1. iPhone Safari (iOS 26) で https://ivc.mymt.casa を開く
2. 共有 (□↑) → **ホーム画面に追加**
3. ホーム画面のアイコンから起動 → standalone モードで動作

### iPhone 検証時のチェックリスト

- **Wake Lock (画面が暗くならない)**: ヘッダ右上に **「画面 ON」** バッジ (Sun アイコン、warning カラー) が出ていれば取得成功。取得失敗時は **「画面 ON 失敗」** (AlertTriangle、error カラー)。短い動画ではスクリーン idle まで到達しないため、3〜5 分かかる動画で確認するのが確実。
- **完了チャイム**: iPhone 本体側面の **Ring/Silent スイッチが「Silent」(オレンジ)** だと WebAudio は無音になり、アプリ側から override 不可。サウンドが聞こえない場合は (1) Silent スイッチを「Ring」側に倒す (2) 音量を上げる (3) 動画選択ボタンを 1 度タップしてから処理開始 (audio unlock が必要) を確認する。Phase 7 post-v0.9.0 で AudioContext を `unlockAudio` と `playDoneSound` で共有するようにしたため、FilePicker タップが 1 回でもあれば後続のチャイムは鳴るはず。
- **オフライン起動**: 機内モード ON → ホーム画面アイコンから起動 → メイン画面が出ること。SW precache 14 entries (~660 KiB) が iPhone Safari にキャッシュされる。

## ディレクトリ構造

```
iphone-video-compressor/
├── public/
│   └── icons/         # 192 / 512 / maskable / apple-touch-icon (ダミー)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/    # FilePicker / QueueList / QueueItem / ShareButton /
│   │                   # Toast / UnsupportedScreen
│   ├── workers/       # compressor.worker + helper
│   ├── pipeline/      # demux / transcode / mux / rotate / colorConvert
│   ├── stores/        # queueStore / settingsStore / toastStore / sideEffects
│   ├── db/            # opfs / indexeddb
│   ├── platform/      # capability / wakeLock / share / audio / storage
│   ├── pwa/           # register-sw (VitePWA ラッパ)
│   └── lib/           # presets / types / format / color-space
├── tests/
│   ├── fixtures/      # 1〜3MB 圧縮済み動画 (commit 済み、ffmpeg で生成可)
│   ├── unit/          # smoke / pwa-assets
│   ├── e2e/           # dev サーバー上の Playwright spec
│   └── e2e-preview/   # build + preview 上のオフライン spec
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── playwright.preview.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── CLAUDE.md          # 仕様書 (本書より詳しい設計判断と未着手項目あり)
├── TODOS.md           # MVP から外した V2 項目 + 検討項目
└── README.md          # 本書
```

## テストフィクスチャ生成

`tests/fixtures/` の動画は再生成可能。ffmpeg と `tests/fixtures/source-*.mov` (実機素材) があれば下記コマンドで作成できます (`tests/fixtures/README.md` も参照):

```bash
# 縦撮りで rotation=90 メタが付いた 1 秒 MOV
ffmpeg -i source-portrait.mov -t 1 -b:v 500k -c:v hevc_videotoolbox -tag:v hvc1 \
  tests/fixtures/portrait-rotation-1s.mov

# 1080p Baseline H.264 1 秒
ffmpeg -i source.mov -t 1 -vf scale=1920:1080 -c:v libx264 -profile:v baseline \
  -b:v 800k tests/fixtures/landscape-1080p-baseline-h264-1s.mp4

# HEVC HLG (HDR) 1 秒
ffmpeg -i source-hdr.mov -t 1 -c:v hevc_videotoolbox -tag:v hvc1 \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  tests/fixtures/landscape-hevc-hdr-1s.mov

# 破損ファイル (Phase 7 のエラー UX 検証用、上記の先頭 30KB をトリム)
head -c 30000 tests/fixtures/landscape-1080p-baseline-h264-1s.mp4 \
  > tests/fixtures/corrupt-truncated.mp4
```

## アイコン

`public/icons/` の 4 PNG は現状すべて ffmpeg で生成したダミー (#0a0a0a 背景 + #0a84ff の中央ブロック)。実機リリース前にデザイナーが作成した素材で差し替えてください:

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `icon-maskable.png` (512×512、safe area 80% 想定)
- `apple-touch-icon.png` (180×180)

## ライセンス

このリポジトリは個人プロジェクトであり現時点でライセンスは未定です。
