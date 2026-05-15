# 動画圧縮 PWA を実装してください

iOS 26 専用の、サーバーレスで動く動画圧縮 PWA を実装してください。すべての処理はクライアント（iPhone Safari）上で完結し、サーバーへのアップロードは一切発生しません。

> **本書は `/plan-eng-review` (2026-05-14) の決定 17 件 + 外部視点の追加発見を反映済み。** 主な変更点: HEVC コーデック文字列を動的選択、`'custom'` プリセット削除、HDR 色域変換を追加、Worker メッセージプロトコル拡張、Phase 0.5 (mediabunny spike) を追加、テスト戦略を策定。MVP から外した項目は `TODOS.md` 参照。

## 制約と方針

このプロジェクトでは以下を厳守してください。

- **対象端末は iOS 26 以降の Safari のみ**。それ以前のバージョンや他ブラウザは「非対応」として明示的に閉じる。iOS 17〜18.7 は AudioEncoder/AudioDecoder 未実装で音声再エンコード不可のため、iOS 26 必須は技術的必然
- **WebCodecs API を唯一の動画処理エンジンとする**。ffmpeg.wasm や類似の WASM 動画ライブラリは導入しない
- **すべての処理はクライアント完結**。バックエンド API、ストレージ、認証は作らない
- **デプロイ先は Cloudflare Pages**（HTTPS、`base: '/'`、PWA secure context 必須のため）
- **依存パッケージは最小限**。本書で指定したもの以外を追加する場合は、追加前に必ず提案して理由を説明すること
- **TypeScript の strict モードを有効化**。`any` の使用は禁止（やむを得ない場合はコメントで理由を明記）
- **自動テストを各フェーズに織り込む**。Vitest（unit）+ Playwright（E2E）。Phase 完了時はテスト緑必須
- **判明している失敗ケースのエラーハンドリングを各フェーズで含める**。Phase 7 にまとめて先送りしない
- **各フェーズの完了時にコミット**。フェーズをまたいだ大きなコミットは作らない
- **各フェーズ完了後、私に動作確認方法を示し、確認が取れてから次のフェーズに進む**

---

## 機能要件

1. iPhone で撮影した動画（HEVC/H.264 in MOV/MP4、HDR/HLG 含む）を選択して圧縮できる
2. 複数の動画を一度に投入できる。処理はキューに入り、順次（またはハイエンド端末では最大 2 並列）実行される
3. 圧縮プリセットを 6 個の固定プリセット（最高画質/高画質/標準/軽量/互換優先/最小）から選択できる。カスタムプリセットは V2 (TODOS.md)
4. 進捗バーと残り時間の予測を表示する
5. 完了した動画は Web Share API で写真ライブラリや他アプリに直接共有できる
6. PWA としてホーム画面に追加でき、スタンドアロン起動できる
7. 処理中はスクリーンロックされても処理が継続する
8. アプリを再起動してもキュー状態は復元される（処理中だったものは `queued` にリセットして再処理）

---

## 技術スタック

| 領域 | パッケージ |
|------|-----------|
| ビルド | Vite 5+ |
| UI | React 18 + TypeScript (strict) |
| スタイル | Tailwind CSS |
| 状態管理 | Zustand |
| 永続化 | OPFS (Origin Private File System) + IndexedDB (idb) |
| 動画処理 | WebCodecs API（ネイティブ） |
| Demux/Mux | mediabunny |
| PWA | vite-plugin-pwa (Workbox) |
| テスト | Vitest（unit） + Playwright（E2E） |

初期化コマンド:

```bash
npm create vite@latest video-compressor -- --template react-ts
cd video-compressor
npm i zustand idb mediabunny lucide-react
npm i -D vite-plugin-pwa workbox-window
npm i -D tailwindcss postcss autoprefixer
npm i -D vitest @vitest/ui jsdom
npm i -D @playwright/test
npx tailwindcss init -p
npx playwright install webkit
```

---

## デプロイ・ホスティング

- **Cloudflare Pages**: GitHub 連携でゼロコンフィグ、`xxx.pages.dev` の HTTPS、`base: '/'`、Preview Deployments で Phase ごとに iPhone 実機確認
  - 本番 (v0.9.0 時点): https://ivc.mymt.casa (カスタムドメイン) / https://iphone-video-compressor.pages.dev (Cloudflare default)
  - GitHub: https://github.com/kimymt/iphone-video-compressor
- 必要なら `public/_headers` に COOP/COEP を設定（mediabunny が SharedArrayBuffer を使う場合のみ）:
  ```
  /*
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: require-corp
  ```
- iOS 実機テストには HTTPS が必須（Service Worker / OPFS persist / WebCodecs secure context 要件のため localhost 以外は HTTPS 必須）

---

## デザインシステム

iOS 26 ネイティブ感を目標としつつ、Web 制約内で実現できる範囲のトークン群。Apple HIG の iOS 26 Liquid Glass design をベース、Tailwind の上に CSS 変数で表現。

### タイポグラフィ

| 用途 | スタイル | サイズ / ウェイト | iOS HIG 名称 |
|---|---|---|---|
| Large Title | SF Pro Display | 34pt / Bold | Large Title |
| Title | SF Pro Display | 28pt / Bold | Title 1 |
| Subheadline | SF Pro Text | 17pt / Semibold | Headline |
| Body | SF Pro Text | 15pt / Regular | Body |
| Caption | SF Pro Text | 13pt / Regular | Caption |
| Tabular (ファイルサイズなど) | SF Compact / ui-monospace | 13pt / Regular Mono | — |

```css
:root {
  --font-display: 'SF Pro Display', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-text: 'SF Pro Text', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-mono: 'SF Compact', ui-monospace, 'SF Mono', Menlo, monospace;
}
```

iOS は SF Pro / SF Compact をシステムフォントとしてホスト、`-apple-system` でフォールバック。Dynamic Type 連携には全テキストを **rem 単位**で記述（`html { font-size: 100% }`、Tailwind のスケールも rem-based に）。

### カラーパレット（CSS 変数）

ダークモードがデフォルト（仕様書の `background_color: #0a0a0a`）。`prefers-color-scheme: light` で切替:

```css
:root {
  /* Dark mode（デフォルト） */
  --bg: #0a0a0a;
  --surface: #1c1c1e;
  --surface-elevated: #2c2c2e;
  --label: #ffffff;
  --label-secondary: rgba(235, 235, 245, 0.6);
  --label-tertiary: rgba(235, 235, 245, 0.3);
  --accent: #0a84ff;          /* iOS systemBlue (dark) */
  --success: #30d158;
  --error: #ff3b30;
  --warning: #ff9f0a;
  --separator: rgba(84, 84, 88, 0.65);
  --glass-tint: rgba(28, 28, 30, 0.7);
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f2f2f7;
    --surface: #ffffff;
    --surface-elevated: #ffffff;
    --label: #000000;
    --label-secondary: rgba(60, 60, 67, 0.6);
    --label-tertiary: rgba(60, 60, 67, 0.3);
    --accent: #007aff;
    --success: #34c759;
    --error: #ff3b30;
    --warning: #ff9500;
    --separator: rgba(60, 60, 67, 0.36);
    --glass-tint: rgba(255, 255, 255, 0.7);
  }
}
```

Tailwind は `bg-[var(--bg)]` のように `[]` 構文で CSS 変数を呼び出す。

WCAG AA (4.5:1) を全テキストで確保。`--label-secondary` on dark `--bg` は ~7:1 ✓、`--accent` on `--bg` は ~9:1 ✓。

### スペーシング

Tailwind のデフォルト（4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px）を採用。コンポーネント間は最低 16px、密集セクションは 8px。

### Liquid Glass の使用範囲

Glass 効果を**乱用しない**。以下の 2 箇所に限定:

1. **SettingsSheet**（gear タップで下から sheet として登場）
2. **完了動画シェアシート**（共有確認の中間オーバーレイ、もしあれば）

それ以外（QueueItem、FilePicker、メイン背景）は `--surface` の不透明色。

```css
.glass-panel {
  background: var(--glass-tint);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
}
```

### モーション

- **Default**: 0.25s `cubic-bezier(0.0, 0.0, 0.58, 1.0)`（iOS easeOut）
- **Spring（シート登場）**: `cubic-bezier(0.32, 0.72, 0, 1)` 0.35s
- **完了アニメ**: CheckCircle2 を 0.5s ease-out で scale 0 → 1 + opacity 0 → 1
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` でアニメ全停止、scale は即時切替

### アイコンライブラリ

**lucide-react** を採用（SF Symbols 風 SVG、Tree-shaking、MIT）。「依存パッケージは最小限」ルールの例外として承認済み（V1 デザインレビュー P7-1）。

| 用途 | lucide アイコン |
|---|---|
| status: queued | `Clock` |
| status: starting | `Loader` (回転アニメ) |
| status: processing | (ProgressBar に代替) |
| status: done | `CheckCircle2` (`--success`) |
| status: failed | `AlertTriangle` (`--error`) |
| status: cancelled | `XCircle` (`--label-secondary`) |
| Share | `Share` |
| Settings | `Settings` |
| Cancel | `X` |
| Retry | `RefreshCw` |
| Remove | `Trash2` |
| Storage | `HardDrive` |
| WakeLock active | `Sun` |
| FilePicker | `Plus` |
| Camera tip | `Camera` |
| EmptyState | `Video` |

---

## ディレクトリ構造

```
video-compressor/
├── public/
│   ├── _headers              # Cloudflare Pages COOP/COEP（必要な場合）
│   ├── icons/                # 192/512/maskable + apple-touch-icon 180×180
│   └── sounds/
│       └── done.m4a          # 完了 SE（仮の無音 200ms で OK、後で差し替え）
├── spike/                    # Phase 0.5 mediabunny 検証（完了後に削除）
│   ├── index.html
│   └── mediabunny-check.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── FilePicker.tsx
│   │   ├── QueueList.tsx
│   │   ├── QueueItem.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── ShareButton.tsx
│   │   └── UnsupportedScreen.tsx
│   ├── workers/
│   │   └── compressor.worker.ts
│   ├── pipeline/
│   │   ├── demux.ts
│   │   ├── transcode.ts
│   │   ├── mux.ts
│   │   ├── rotate.ts
│   │   └── colorConvert.ts   # HDR (BT.2020) → SDR (BT.709) トーンマッピング
│   ├── stores/
│   │   ├── queueStore.ts
│   │   └── settingsStore.ts
│   ├── db/
│   │   ├── opfs.ts
│   │   └── indexeddb.ts
│   ├── platform/
│   │   ├── capability.ts
│   │   ├── wakeLock.ts
│   │   ├── share.ts
│   │   └── storage.ts
│   ├── lib/
│   │   ├── presets.ts
│   │   ├── format.ts
│   │   └── types.ts
│   └── pwa/
│       └── register-sw.ts
├── tests/
│   ├── fixtures/             # 圧縮済み 1〜3MB 代替動画（README 内に生成コマンド）
│   │   ├── portrait-rotation-1s.mov
│   │   ├── landscape-1080p-baseline-h264-1s.mp4
│   │   ├── landscape-hevc-hdr-1s.mov
│   │   └── corrupt-truncated.mp4
│   └── e2e/                  # Playwright E2E
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── package.json
├── README.md
└── TODOS.md
```

`ComparePreview.tsx` は MVP から除外（TODOS.md）。

---

## 主要モジュール仕様

### `src/lib/types.ts`

```ts
export type PresetKey =
  | 'best-hevc'
  | 'high-hevc'
  | 'standard-hevc'
  | 'light-hevc'
  | 'compat-h264'
  | 'min-h264';
// 'custom' は MVP から除外（TODOS.md）

export type CodecChoice = 'hevc' | 'h264-high' | 'h264-baseline';

export type Preset = {
  key: PresetKey;
  label: string;
  description: string;
  codec: CodecChoice;
  maxLongEdge: number | null;       // null = オリジナル維持
  videoBitrate: number;              // bps
  audioBitrate: number;              // bps
  // codecString は presets.ts の buildCodecString(preset, longEdge, fps) で動的に算出
};

// status ごとに保持するフィールドを discriminated union で表現
type QueueItemBase = {
  id: string;                        // UUID
  fileName: string;
  inputSize: number;
  inputOpfsPath: string;             // status='done' 遷移時に削除（その後は空文字）
  outputOpfsPath?: string;
  outputSize?: number;
  durationSec?: number;
  progress: number;                  // 0-100
  preset: PresetKey;
  addedAt: number;
  startedAt?: number;
  finishedAt?: number;
};

export type QueueItem =
  | (QueueItemBase & { status: 'queued' | 'starting' | 'processing' | 'done' | 'cancelled' })
  | (QueueItemBase & { status: 'failed'; error: string });

export type EnvCheck = {
  videoEncoder: boolean;
  audioEncoder: boolean;
  webShareFiles: boolean;
  wakeLock: boolean;
  opfs: boolean;
  persistentStorage: boolean;
  hevcEncode: boolean;
  h264Encode: boolean;
  canRun: boolean;
};
```

ステータスの意味:
- `queued`: キュー入りしたが Worker 未起動
- `starting`: Worker に `transcode` を post、`started` 応答待ち（cold-start 中）
- `processing`: 進捗が動いている
- `done`: 完了、output が読める
- `failed`: 失敗、`error` メッセージあり
- `cancelled`: 中止

### `src/platform/capability.ts`

iOS 26 環境チェック。`canRun === false` なら `UnsupportedScreen` を表示。

```ts
export async function verifyEnvironment(): Promise<EnvCheck>;
```

判定内容:
- `VideoEncoder`, `AudioEncoder`, `navigator.canShare`, `navigator.wakeLock`, `navigator.storage.getDirectory`, `navigator.storage.persist` の存在確認
- `VideoEncoder.isConfigSupported({ codec: buildHevcCodecString(1080, 30), width: 1920, height: 1080, bitrate: 5_000_000, framerate: 30 })` で HEVC エンコード可否
- 同じく `'avc1.640028'` で H.264 High エンコード可否
- `canRun = videoEncoder && audioEncoder && h264Encode`（HEVC は必須ではない、フォールバック可）
- dev override: `?dev=1` クエリで全 true を強制（macOS Safari での開発確認用）

### `src/platform/storage.ts`

```ts
export async function ensurePersistent(): Promise<boolean>;
export async function getStorageInfo(): Promise<{ usage: number; quota: number; available: number }>;
export async function hasEnoughQuota(inputSize: number): Promise<boolean>;  // 入力 × 2.5 < available
```

起動時に `ensurePersistent()` を呼び、`navigator.storage.persist()` を要求。UI 上に使用量/上限を表示。`add()` 前に `hasEnoughQuota()` をチェックし、足りなければ「容量が不足しています」エラー。

### `src/platform/wakeLock.ts`

```ts
export class WakeLockManager {
  acquire(): Promise<void>;
  release(): Promise<void>;
  // visibilitychange で自動再取得
}
```

処理開始時に `acquire()`、全キュー完了時に `release()`。

### `src/platform/share.ts`

```ts
export async function shareFile(blob: Blob, fileName: string): Promise<boolean>;
```

挙動:
1. `fileName` から `:` `/` `\` を `_` に置換（iOS の Share シートで失敗を避ける）
2. `blob.size > 1024 * 1024 * 1024`（1GB 超）なら即座に download フォールバック（iOS の Share API 制約）
3. `navigator.canShare({ files: [...] })` が true なら `navigator.share()`
4. それ以外は一時 `<a download>` フォールバック（PWA standalone でも fallback として動く）

### `src/lib/presets.ts`

固定 6 プリセット:

| key | label | codec | maxLongEdge | videoBitrate | audioBitrate |
|-----|-------|-------|-------------|--------------|--------------|
| `best-hevc` | 最高画質 (HEVC) | hevc | null | 12_000_000 | 192_000 |
| `high-hevc` | 高画質 (HEVC) | hevc | 1080 | 5_000_000 | 128_000 |
| `standard-hevc` | 標準 (HEVC) ★既定 | hevc | 1080 | 3_000_000 | 128_000 |
| `light-hevc` | 軽量 (HEVC) | hevc | 720 | 1_500_000 | 96_000 |
| `compat-h264` | 互換優先 (H.264) | h264-high | 1080 | 5_000_000 | 128_000 |
| `min-h264` | 最小 (H.264) | h264-baseline | 480 | 800_000 | 64_000 |

コーデック文字列は解像度ごとに動的に算出する:

```ts
// HEVC Main Profile, level_idc は解像度+fps で決まる
// <= 720p    → L93  (Level 3.1, MaxLumaPS  921,600)
// <= 1080p30 → L120 (Level 4.0, MaxLumaPS 2,228,224)
// <= 1080p60 → L123 (Level 4.1, MaxLumaPS 2,228,224, 高フレームレート)
// <= 4K30    → L153 (Level 5.1, MaxLumaPS 8,912,896)
// <= 4K60    → L156 (Level 5.2)
export function buildHevcCodecString(longEdge: number, fps: number = 30): string {
  if (longEdge <= 1280) return 'hvc1.1.6.L93.B0';
  if (longEdge <= 1920) return fps <= 30 ? 'hvc1.1.6.L120.B0' : 'hvc1.1.6.L123.B0';
  if (longEdge <= 3840) return fps <= 30 ? 'hvc1.1.6.L153.B0' : 'hvc1.1.6.L156.B0';
  return 'hvc1.1.6.L156.B0';
}

export function buildCodecString(preset: Preset, longEdge: number, fps: number = 30): string {
  switch (preset.codec) {
    case 'hevc': return buildHevcCodecString(longEdge, fps);
    case 'h264-high': return 'avc1.640028';     // High Profile Level 4.0
    case 'h264-baseline': return 'avc1.42E01F'; // Baseline Profile Level 3.1
  }
}

// 音声は常に AAC-LC: 'mp4a.40.2'

export function getAvailablePresets(envCheck: EnvCheck): Preset[] {
  return PRESETS.filter(p => p.codec !== 'hevc' || envCheck.hevcEncode);
}

// in-flight フレーム上限（バックプレッシャー）
export const MAX_INFLIGHT_FRAMES: Record<CodecChoice, number> = {
  'hevc': 4,
  'h264-high': 8,
  'h264-baseline': 8,
};
```

`SettingsPanel` の選択肢は `getAvailablePresets(envCheck)` から取得。HEVC 非対応端末では H.264 プリセット 2 個のみが表示される。デフォルトは `standard-hevc`、不可なら `compat-h264`。

### `src/db/opfs.ts`

```ts
export async function writeInputToOpfs(file: File, id: string): Promise<string>;  // inputs/{id}.{ext}（原拡張子を保持）
export async function readFromOpfs(path: string): Promise<File>;
export async function deleteFromOpfs(path: string): Promise<void>;
export async function getOpfsWritable(path: string): Promise<FileSystemWritableFileStream>;
```

入力ファイルは元の拡張子（`.mov` / `.mp4`）を保持。出力は常に `outputs/{id}.mp4`。

**入力ファイルライフサイクル**: `status: 'done'` への遷移時に `inputs/{id}.{ext}` を削除（ストレージ節約）。done 後は input が無いので retry はグレーアウト（UI 側で disable）。

### `src/db/indexeddb.ts`

`idb` ライブラリを使い、`queue` ストアに `QueueItem` のメタ情報のみ保存。動画本体は OPFS。

### `src/pipeline/demux.ts`

mediabunny を使って入力 File から以下を取り出す:

```ts
export type DemuxResult = {
  videoTrack: VideoTrack;
  audioTrack: AudioTrack | null;     // 無音録画なら null
  durationSec: number;
  rotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  colorSpace: VideoColorSpace;       // HDR 検出用（primaries: 'bt2020' なら HDR）
  fps: number;                       // VFR の場合は average fps
};
```

### `src/pipeline/rotate.ts`

```ts
export function applyRotation(
  frame: VideoFrame,
  rotation: 0 | 90 | 180 | 270,
  ctx: OffscreenCanvasRenderingContext2D,
): VideoFrame;
```

セマンティクス:
- 関数は `frame` の所有権を受け取る
- `rotation === 0` のとき: 同じ `frame` をそのまま返し、close しない（呼び出し側が close する）
- それ以外: `ctx` 上で正しい向きに描画 → 新 `VideoFrame` を作って返し、入力 `frame.close()` を呼ぶ
- 呼び出し側は `const out = applyRotation(in, rot, ctx); use(out); out.close();` だけでリークなし
- `ctx` の canvas は `transcode()` スコープで 1 個だけ作って使い回す（rotation 角度に応じて `width` / `height` をスワップして resize）

### `src/pipeline/colorConvert.ts`

```ts
export function convertToBt709(
  frame: VideoFrame,
  inputColorSpace: VideoColorSpace,
  ctx: OffscreenCanvasRenderingContext2D,
): VideoFrame;
```

HDR (BT.2020 + PQ もしくは HLG) → SDR (BT.709 + sRGB transfer) トーンマッピング。

セマンティクス:
- `inputColorSpace.primaries === 'bt2020'` のときに変換適用、それ以外は同じ `frame` をパススルー（close しない）
- 関数は `frame` の所有権を受け取る、`rotate.ts` と同じセマンティクス
- `ctx` は `OffscreenCanvas.getContext('2d', { colorSpace: 'srgb' })`
- iPhone 12 以降の HEVC HDR 動画でこの変換なしだと、出力に緑かぶり or 露出破綻が出る

### `src/pipeline/transcode.ts`

```ts
export type TranscodeOptions = {
  preset: Preset;
  onProgress: (percent: number, currentSec: number, totalSec: number) => void;
  signal: AbortSignal;
};

export async function transcode(
  inputFile: File,
  outputWritable: FileSystemWritableFileStream,
  opts: TranscodeOptions,
): Promise<{ outputSize: number; durationSec: number }>;
```

実装方針:
1. mediabunny で demux、`VideoDecoder` / `AudioDecoder` でデコード
2. 入力の `colorSpace.primaries === 'bt2020'` なら `colorConvert.convertToBt709()` で BT.709 にトーンマッピング
3. 必要なら回転補正（`rotate.applyRotation()`）・リサイズ（長辺が `preset.maxLongEdge` を超える場合のみ Canvas で縮小）
4. `VideoEncoder` で再エンコード。`VideoEncoderConfig`:
   - `codec`: `buildCodecString(preset, longEdge, fps)`（動的）
   - `colorSpace`: `{ primaries: 'bt709', transfer: 'bt709', matrix: 'bt709' }`（明示）
   - `latencyMode`: `'quality'`
   - `bitrateMode`: `'variable'`
5. 音声は `AudioDecoder` → `AudioEncoder`、`AudioEncoderConfig.sampleRate` は入力のものをそのまま渡す（iPhone は 44.1k/48k 混在、リサンプル不要）
6. `audioTrack === null` のときは音声 pipeline をスキップ、mediabunny の mux 設定でも音声トラックなし
7. **VFR 対応**: decoder からの `VideoFrame.timestamp` をそのまま encoder に渡す（fps 固定値で再計算しない）
8. **B-frame DTS/PTS**: mediabunny の mux に EncodedVideoChunk の sample 順序（decode order）で書き込み、PTS は別フィールドで渡す
9. mediabunny で MP4 mux、コンテナボックスは **`hvc1`** を強制（iOS Photos 互換、`hev1` は再生不可）
10. `outputWritable` にストリーミング書き出し
11. **backpressure**: decode ループで `videoEncoder.encodeQueueSize > MAX_INFLIGHT_FRAMES[preset.codec]` の間 `await new Promise(r => setTimeout(r, 16))` で待機。AudioEncoder も同様
12. **EXIF / 位置情報を破棄**: mediabunny の mux 設定で metadata は付けない（プライバシー）
13. 各 `VideoFrame` / `AudioData` は使用後必ず `.close()` を呼ぶ
14. `signal.aborted` を毎ループ確認、true ならクリーンアップして reject
15. 進捗は `currentTimestamp / totalDuration`、200ms スロットル
16. ETA は処理開始から 10 秒経過後、直近 10 秒の処理速度から線形外挿（10 秒未満なら ETA は null）

### `src/pipeline/mux.ts`

mediabunny の mux 出力ラッパ。`hvc1` ボックス強制、metadata なし、音声トラック有無の分岐。

### `src/workers/compressor.worker.ts`

メインスレッドから OPFS の入力パスと出力パス、プリセットを受け取り、`transcode()` を呼ぶ Web Worker。

```ts
type WorkerRequest =
  | { type: 'transcode'; id: string; inputPath: string; outputPath: string; preset: Preset }
  | { type: 'cancel'; id: string };

type WorkerResponse =
  | { type: 'started'; id: string }
  | { type: 'progress'; id: string; percent: number; etaSec: number | null }
  | { type: 'done'; id: string; outputSize: number; durationSec: number }
  | { type: 'failed'; id: string; error: string }
  | { type: 'cancelled'; id: string };
```

挙動:
- `transcode` 受信直後に `started` を post（メイン側で `'starting'` → `'processing'` の切替に使う、cold-start UX 対策）
- 進捗通知は最低 200ms 間隔でスロットル
- **cancel/done レース対策**:
  - Worker 側: `cancel` 受信時にすでに `done` を post 済みなら `cancelled` を送らない
  - メイン側: `cancelled` 受信後に届く `done` / `failed` / `progress` は無視

### `src/stores/queueStore.ts`

Zustand store。

```ts
interface QueueStore {
  items: QueueItem[];
  parallelism: 1 | 2;
  hevcBenchSlowdown: boolean | null;   // Phase 4 ベンチ結果。true なら HEVC は 1 並列に降格
  isProcessing: boolean;

  init(): Promise<void>;                                // IndexedDB から復元 + processing → queued リセット + 中途 OPFS 出力削除
  add(files: File[], preset: PresetKey): Promise<void>; // quota チェック → OPFS書き込み → キュー追加 → 処理開始
  cancel(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  clearCompleted(): Promise<void>;                      // done/failed/cancelled を一括削除（output も削除）
  share(id: string): Promise<void>;

  effectiveParallelism(preset: Preset): 1 | 2;
}
```

並列度判定: `navigator.hardwareConcurrency >= 6 ? 2 : 1`（`deviceMemory` チェックは削除、Safari 未実装のため）。

HEVC は VideoToolbox の単一ハードウェアリソース制約があるため、Phase 4 のベンチ結果に応じて 1 並列に降格:

```ts
effectiveParallelism(preset: Preset): 1 | 2 {
  if (this.parallelism === 1) return 1;
  if (preset.codec === 'hevc' && this.hevcBenchSlowdown === true) return 1;
  return 2;
}
```

`init()` の追加処理:
- IndexedDB から `items` 復元
- `status === 'processing' || 'starting'` のアイテムを `'queued'` に戻し、`progress=0`、`startedAt=undefined`
- 該当 `outputOpfsPath` を OPFS から削除
- `localStorage` の `hevcBenchSlowdown` を読み戻す

`add()` の追加処理:
- `storage.hasEnoughQuota(file.size)` を事前チェック、false なら「容量が不足しています」エラー

`done` 遷移時の追加処理:
- `inputs/{id}.{ext}` を OPFS から削除（retry はグレーアウトに）

### `src/stores/settingsStore.ts`

プリセット選択、ダークモード追従、`hevcBenchSlowdown: boolean | null` などの軽量設定。`localStorage` に永続化。

---

## テスト戦略

### フレームワーク

- **Vitest**（unit + 統合）: 純粋関数、ストア、Worker helper、Mock canvas
- **Playwright**（E2E、WebKit）: 実ブラウザでファイル選択 → 圧縮 → 共有まで

### フィクスチャ動画

`tests/fixtures/` に commit、各 1〜3MB に圧縮。`README.md` に ffmpeg 生成コマンドを記録:

```bash
# portrait-rotation-1s.mov (rotation=90 メタデータ)
ffmpeg -i source-portrait.mov -t 1 -b:v 500k -c:v hevc_videotoolbox -tag:v hvc1 \
  tests/fixtures/portrait-rotation-1s.mov

# landscape-1080p-baseline-h264-1s.mp4
ffmpeg -i source.mov -t 1 -vf scale=1920:1080 -c:v libx264 -profile:v baseline \
  -b:v 800k tests/fixtures/landscape-1080p-baseline-h264-1s.mp4

# landscape-hevc-hdr-1s.mov (HLG)
ffmpeg -i source-hdr.mov -t 1 -c:v hevc_videotoolbox -tag:v hvc1 \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  tests/fixtures/landscape-hevc-hdr-1s.mov

# corrupt-truncated.mp4 (上記を頭 30KB だけにトリム)
head -c 30000 tests/fixtures/landscape-1080p-baseline-h264-1s.mp4 \
  > tests/fixtures/corrupt-truncated.mp4
```

### Phase 別テスト要件

| Phase | 追加テスト |
|---|---|
| 0 | tsconfig strict 検証、Vitest 設定の smoke test |
| 0.5 | mediabunny で HEVC mux → iOS 26 Safari 実機で Photos 再生確認、`hvc1` box を `mp4dump` で検証 |
| 1 | `verifyEnvironment` の単体（mock navigator）、`?dev=1` override、UnsupportedScreen レンダリング |
| 2 | `opfs.ts` の write/read/delete/getWritable、`indexeddb.ts` の CRUD、`storage.hasEnoughQuota`、`queueStore.init/add/remove`、★`processing → queued` リセット★（REGRESSION） |
| 3 | `presets.ts`（全プリセット定義、`buildCodecString`、`buildHevcCodecString` の全レンジ、`getAvailablePresets`）、`rotate.applyRotation` の所有権・全角度、`colorConvert.convertToBt709` の BT.2020→BT.709、`transcode` の H.264/HEVC/HDR/回転/cancel/progress/encodeQueueSize backpressure/VFR タイムスタンプ/B-frame DTS/PTS/音声なし |
| 4 | `queueStore.cancel/retry/share/clearCompleted`、Worker メッセージプロトコル（started/progress/done/failed/cancelled）、cancel/done レース、並列度=2 同時実行、HEVC ベンチ判定、`QueueList`/`QueueItem` UI |
| 5 | `share.shareFile` の navigator.canShare 分岐 + 1GB 超フォールバック + ファイル名サニタイズ、`wakeLock` の visibilitychange、`done.m4a` の audio unlock（初回ユーザージェスチャー）|
| 6 | Service Worker 登録、PWA manifest 検証、apple-touch-icon の存在、オフライン起動 E2E |
| 7 | エラー UX の E2E（quota exceeded、非対応コーデック、デコード失敗、HDR 動画の正しい出力）、不要 console.log の grep |

---

## UI 仕様

### Information Architecture

iOS HIG ネイティブパターン（Notes / Reminders 系）のタスク中心レイアウト。設定は上部ではなくナビバー右の歯車から sheet として取り出す（V1 デザインレビュー P1-1 で確定）:

```
┌─────────────────────────────────┐ Safe area top
│ [Status bar]                    │
├─────────────────────────────────┤
│ 動画圧縮            [⚙ Settings]│ Navigation bar
├─────────────────────────────────┤
│                                 │
│ [QueueList | EmptyState]        │ コンテンツエリア
│   QueueItem ...                 │ (スクロール可)
│   QueueItem ...                 │
│                                 │
│                                 │
│                                 │
├─────────────────────────────────┤
│   [+ 動画を選択]                 │ Sticky bottom CTA
├─────────────────────────────────┤ Safe area bottom
└─────────────────────────────────┘ home indicator
```

優先順位:
1. **コンテンツ（QueueList）** — 進捗確認が最重要
2. **CTA（FilePicker）** — 親指が届く位置に固定
3. **設定（gear）** — ナビバー右、シートとして取り出す

### 画面構成

**メイン画面** (`App.tsx`): 上記 IA。`QueueList` が空のとき `EmptyState`。FilePicker は sticky bottom (`position: sticky; bottom: 0`)。

**SettingsSheet** (gear タップで登場、bottom sheet スタイル):
- プリセット選択（`getAvailablePresets(envCheck)` から、選択値は localStorage）
- ストレージ使用量バー (`getStorageInfo()` の結果)
- カメラ設定案内（`localStorage.cameraTipDismissed=true` で再表示しない）
- PWA インストールガイド（standalone でないときのみ表示）
- バージョン情報（footer）

**UnsupportedScreen**: `canRun === false` のときフルスクリーン。「このアプリは iOS 26 以降の Safari でお使いください」 + iOS Settings へのディープリンク (`prefs:root=General&path=Software_Update`、Safari でも開けるか実機検証)

**InitialOnboarding**（初回起動 + canRun=true、3 画面スワイプ）:
1. 「ようこそ動画圧縮へ」+ アプリ価値説明
2. 「動画をローカルだけで圧縮、サーバーには一切送りません」
3. 「カメラ設定とPWAインストール案内」

スキップ可、`localStorage.onboardingShown=true` で次回スキップ。

### コンポーネント仕様

- **TitleBar**: 左に「動画圧縮」（SF Pro Display 28pt Bold）、右に Settings gear（44pt tap target）
- **EmptyState**: 中央 `Video` アイコン（`--label-secondary`、64px）+ 「まだ何もありません」（Subheadline）+ 「下の『動画を選択』から始められます」（Caption）+ 矢印で下の FilePicker を示唆
- **QueueItem**:
  - ファイル名（Body）+ サイズ表記（Caption、Tabular フォント）
  - ステータスアイコン or ProgressBar
  - 完了時は「共有」（lucide `Share`）+ 「削除」（`Trash2`）
  - failed/cancelled 時は「リトライ」（`RefreshCw`、ただし done 後の input 削除で retry がグレーアウトの場合あり）
- **FilePicker**: 全幅 sticky button、`--accent` 背景、`Plus` アイコン + 「動画を選択」（Subheadline）、44pt 最小高さ、Safe area margin。タップ時に無音 `<audio>` を `play().then(p => p.pause())` で iOS audio unlock
- **ShareButton**: 完了 QueueItem に表示、tap で `shareFile()`
- **SettingsSheet**: `glass-panel` 背景、最大高さ画面の 85%、ドラッグハンドル付き
- **ProgressBar**: 高さ 4px、`--accent` の塗り + `--separator` の地、アニメ 60fps（CSS `transform: scaleX`）。Reduced Motion ではステップ更新

### インタラクションステートカバレッジ

| ID | 状態 | アイコン | 主要テキスト | 副次テキスト | 主アクション | 色 |
|---|---|---|---|---|---|---|
| S1 | `queued` | `Clock` | キュー待ち | — | — | `--label-secondary` |
| S2 | `starting` | `Loader` (spin) | 開始中… | — | — | `--accent` |
| S3 | `processing` | ProgressBar | 67% | 124MB → 約 38MB（予測）、残り 28 秒 | Cancel `X` | `--accent` |
| S4 | `done` | `CheckCircle2` (scale-in アニメ) | 完了 | 124MB → 38MB（−69%） | 共有 / 削除 | `--success` |
| S5 | `failed` | `AlertTriangle` | エラー | `{error}` | リトライ / 削除 | `--error` |
| S6 | `cancelled` | `XCircle` | キャンセル済み | — | リトライ / 削除 | `--label-secondary` |
| S7 | empty queue | `Video` (centered) | まだ何もありません | 下の「動画を選択」から始められます | (FilePicker 注意誘導) | `--label-secondary` |
| S8 | `init()` 中 | skeleton shimmer | — | — | — | shimmer |
| S9 | quota 不足（add 失敗） | toast | 容量が足りません | あと {X}MB 必要です | 「ストレージ管理」（Settings シート） | `--error` |
| S10 | decode 失敗 | inline error in QueueItem | この動画は処理できません | 未対応のコーデック or ファイル破損 | リトライ / 削除 | `--error` |
| S11 | Share 拒否 | toast | 共有がキャンセルされました | — | — | `--label-secondary` |

エラートーストは `role="alert"` + `aria-live="assertive"`、3 秒後に自動 dismiss、Reduced Motion なら 5 秒。

### ユーザージャーニーと Emotional Arc

時間軸: 5 秒の visceral → 5 分の behavioral → 5 年の reflective:

| # | ステップ | ユーザーが見るもの | 感情 | 仕様が支える手段 |
|---|---|---|---|---|
| 1 | PWA URL を開く | スプラッシュ → InitialOnboarding（初回）| curious | 3 画面オンボーディング |
| 2 | スワイプ完了 | メイン画面（empty state） | welcome | warmth ある empty state |
| 3 | FilePicker タップ | iPhone Photos が開く | familiar | iOS ネイティブピッカー |
| 4 | 動画選択完了 | QueueItem が `queued` 即追加 → 自動 `starting` | reassuring | < 200ms で UI 反応、Worker 起動中も状態見える |
| 5 | 処理中（10 秒-10 分）| ProgressBar + 「124MB → 約 38MB」+ 残り時間 | informed | 出力予想サイズ即表示、ETA |
| 6 | 並列処理 | QueueItem 2 件が同時 processing | productive | 2 並列許容（端末次第） |
| 7 | 完了 | `CheckCircle2` の scale-in アニメ + `done.m4a` | satisfied | 視覚 + 聴覚フィードバック |
| 8 | 共有タップ | iOS Share Sheet（写真、AirDrop 等）| accomplished | navigator.share |
| 9 | アプリ再起動 | キュー復元、processing → queued リセット済み | trusted | A4 の自動復旧 |

### アクセシビリティ

- **Dynamic Type**: 全テキストを rem 単位で記述（`html { font-size: 100% }`、Tailwind スケールも rem-based）
- **VoiceOver**:
  - QueueItem に `role="listitem"` + `aria-label="{fileName}、{status の日本語}、進捗 {percent}%"`
  - ProgressBar に `role="progressbar"` + `aria-valuenow={percent}` + `aria-valuemin="0"` + `aria-valuemax="100"`
  - QueueList に `role="list"`
  - ステータスアイコンに `aria-hidden="true"`（テキストで読み上げ済みなので）
  - エラートースト: `role="alert"` + `aria-live="assertive"`
  - 進捗トースト: `role="status"` + `aria-live="polite"`
- **タッチターゲット**: 全インタラクティブ要素 44×44pt 最小（Tailwind `min-h-11 min-w-11`）
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` でアニメ全停止、`CheckCircle2` は scale 即時切替、`ProgressBar` はステップ更新
- **カラーコントラスト**: WCAG AA (4.5:1) 全テキストで保証（デザインシステムのトークンで確認済み）
- **キーボードナビ**: 全 button に `:focus-visible` でアウトライン、Tab 順は IA 順（TitleBar → Settings gear → QueueItem 1, 2, ... → FilePicker）

### レスポンシブ

iOS のみだが、画面幅に幅がある。3 ブレークポイントでレイアウト確認:

| デバイス | 幅 | 主な調整 |
|---|---|---|
| iPhone Mini / SE | 375px | QueueItem を 1 行に圧縮、Caption -1pt |
| iPhone 標準 (14/15/16) | 393px | デフォルト |
| iPhone Pro Max | 430px | コンテンツ max-width 393px に制限、左右マージン拡大 |

`max-width: 393px; margin: 0 auto;` でコンテンツを中央寄せ。

iPad / 横画面は MVP 外（TODOS.md V2）。`manifest.orientation: 'portrait'` で強制。

### スタイル基盤

```css
.app {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  background: var(--bg);
  color: var(--label);
  font-family: var(--font-text);
}

.title { font-family: var(--font-display); }
.tabular { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
```

画面遷移は **CSS `transition` + React の `key`** で表現（MVP）。View Transitions API は TODOS.md (V2)。

---

## PWA 設定

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'sounds/*.m4a'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,ico,png,svg,m4a}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      manifest: {
        name: '動画圧縮',
        short_name: '動画圧縮',
        description: 'iPhone の動画をローカルで圧縮',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        lang: 'ja',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: { environment: 'jsdom' },  // Vitest
});
```

### `index.html` の `<head>` に必要な追記

iOS の PWA 動作には以下が必要（VitePWA の manifest だけだと iOS は拾わない）:

```html
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="動画圧縮">
```

### アイコン

`public/icons/` に以下を配置:
- `icon-192.png`（192×192）
- `icon-512.png`（512×512）
- `icon-maskable.png`（512×512、safe area 80%）
- `apple-touch-icon.png`（180×180、iOS の home icon 用）

初期実装ではダミーの単色 PNG で構わない（後で差し替え）。

---

## 実装フェーズ

各フェーズ完了時に動作確認方法を示し、私の確認後に次に進んでください。

**全フェーズ共通のルール**:
- フェーズ末尾で該当範囲のテストが緑であることを確認
- 判明している失敗ケースのエラーハンドリングを含めて完了させる

### Phase 0: プロジェクト初期化

- `npm create vite@latest video-compressor -- --template react-ts`
- `tsconfig.json` の strict: true を確認
- Tailwind の初期設定
- Vitest と Playwright の最小設定（`vitest.config.ts`、`playwright.config.ts`、サンプルテスト 1 件ずつ）
- `src/lib/types.ts` を作成
- 空の `App.tsx` で「Hello」が表示されることを確認
- Vitest が `1+1===2` で緑、Playwright が空ページのスクショで緑
- コミット: `chore: initial project setup`

### Phase 0.5: mediabunny 検証 spike

mediabunny は新興ライブラリで iOS 26 Safari + HEVC mux の実績が乏しい。先に検証してから本実装に進む。

- `spike/index.html` + `spike/mediabunny-check.ts`
- WebCodecs `VideoEncoder` で 720p のサンプル動画を 1 秒生成 → mediabunny で HEVC mux → ダウンロード
- iOS 26 Safari 実機で Photos アプリに保存 → 再生確認
- `mp4dump` or hex dump で **`hvc1` box が出力されていること**を確認
- 失敗時の対応: GitHub issue を起こす、代替（mp4box.js）への pivot を検討
- コミット: `chore: mediabunny ios compatibility spike`

### Phase 1: ケーパビリティ判定と非対応画面

- `src/platform/capability.ts` 実装（動的コーデック文字列を使用）
- `src/components/UnsupportedScreen.tsx` 実装
- `App.tsx` で起動時に `verifyEnvironment()` → `canRun === false` なら `UnsupportedScreen`
- macOS の Safari でも開発確認できるよう、`?dev=1` クエリで強制 true
- テスト: capability の各 API 欠如パターン（mock navigator）、`?dev=1` override、UnsupportedScreen レンダリング
- エラーハンドリング: `isConfigSupported` 例外、API 突然消失
- コミット: `feat: ios26 capability check`

### Phase 2: OPFS と IndexedDB 永続化

- `src/db/opfs.ts`、`src/db/indexeddb.ts` 実装
- `src/platform/storage.ts` 実装（`hasEnoughQuota` を含む）、起動時に Persistent Storage 要求
- `src/stores/queueStore.ts` の `init()`/`add()`/`remove()` のみ先行実装
- `FilePicker.tsx` 実装（audio unlock を含む）
- ファイル選択 → quota チェック → OPFS 書き込み → キューに 1 件追加 → 画面表示
- リロード後にキューが残り、★`processing → queued` リセットが効くこと★を確認
- テスト: OPFS CRUD、quota 計算、`queueStore.init()` の processing リセット（★REGRESSION★）
- エラーハンドリング: quota exceeded、persist 拒否、OPFS write 例外
- コミット: `feat: opfs queue persistence`

### Phase 3: WebCodecs パイプライン

- `src/lib/presets.ts` 実装（`buildCodecString`、`getAvailablePresets`、`MAX_INFLIGHT_FRAMES` を含む）
- `src/pipeline/demux.ts`、`rotate.ts`、`colorConvert.ts`、`transcode.ts`、`mux.ts` 実装
- `src/workers/compressor.worker.ts` 実装（`started` メッセージを含む）
- まず Worker 外で 1 ファイル H.264 出力ができることを確認
- 次に HEVC 出力（動的レベル文字列）に切り替え
- 回転メタデータ付き iPhone 動画で正しい向きで出力されることを確認
- HDR 動画（fixture）で BT.709 出力が正しい色で出ることを確認
- VFR 動画（スロモ fixture）で timestamp が崩れないことを確認
- テスト: 全プリセット定義、buildCodecString の全レンジ、getAvailablePresets、rotate（4 角度 + 所有権）、colorConvert（HDR→SDR）、transcode の H.264/HEVC/HDR/cancel/backpressure/VFR/B-frame/音声なし
- エラーハンドリング: デコード失敗、未対応コーデック、ファイル破損
- コミット: `feat: webcodecs transcode pipeline`

### Phase 4: キュー処理ループ

- `queueStore` を Worker 連携に拡張、`cancel()`/`retry()`/`share()`/`clearCompleted()`、並列度判定、`done` 遷移時の入力ファイル削除
- **HEVC ベンチマーク**: 60 秒の動画 1 本を 2 並列 vs 1 並列で計測 → 2 並列のスループットが 1.3 倍以下なら `hevcBenchSlowdown=true` を `localStorage` に保存
- `QueueList`、`QueueItem` で 6 種類のステータスアイコン、進捗バー、残り時間、cancel/retry ボタン
- 複数ファイル投入 → 順次（または 2 並列）処理完了
- cancel/done レースのテスト（cancel 後の done を無視することを確認）
- テスト: 上記すべて + cancel/done レース unit + 並列度=2 同時実行 + HEVC ベンチ判定
- エラーハンドリング: Worker スリープ、Worker 突然死、メッセージ順序破綻
- コミット: `feat: sequential queue processing`

### Phase 5: 共有・保存

- `src/platform/share.ts` 実装（サニタイズ、1GB フォールバック）
- `src/platform/wakeLock.ts` 実装、処理開始/終了で acquire/release、visibilitychange で再取得
- `ShareButton` 実装
- 完了時に `done.m4a` 再生（Phase 2 の audio unlock のおかげで鳴る）
- 実機で「写真に保存」「AirDrop」が共有シートに出ることを確認
- テスト: shareFile の分岐、wakeLock の状態遷移、ファイル名サニタイズ、audio unlock
- エラーハンドリング: Share 拒否、WakeLock 拒否、Audio 再生失敗
- コミット: `feat: web share api`

### Phase 6: PWA 化と iOS 26 ポリッシュ

- VitePWA 設定、アイコン配置、`index.html` の apple meta タグ、`public/_headers`
- `register-sw.ts` でアップデート通知
- Liquid glass、Safe Area、ダークモード（CSS `transition` で滑らかさを表現、View Transitions は V2）
- ホーム画面追加 → スタンドアロン起動 → オフライン起動 を確認
- テスト: SW 登録、manifest、apple-touch-icon の存在、オフライン起動 E2E
- コミット: `feat: pwa polish`

### Phase 7: 仕上げ

- 各フェーズで漏れたエラー UX の例外ケースを総ざらい
- エラーメッセージの文言を統一（「容量が足りません」「この動画は処理できません」「共有に失敗しました」など）
- README.md に使用方法・対応端末・既知の制限・fixture 生成コマンドを記載
- 不要な console.log の削除（grep でゼロ確認）
- TODOS.md を最終化（着手中のもの、優先度の見直し）
- コミット: `chore: final polish`

---

## ハマりどころ事前共有

1. **iPhone の MOV は回転メタデータ付き**。WebCodecs の `VideoDecoder` は回転を自動適用しないため、`rotate.ts` で Canvas 経由の補正が必要
2. **`VideoFrame` / `AudioData` のリーク**。使い終わったら必ず `.close()`。リークするとすぐにメモリ枯渇する
3. **メインスレッドへの巨大 Blob 転送を避ける**。Worker 内で OPFS に直書きし、メインスレッドにはパスだけ返す
4. **iOS Safari は `navigator.vibrate` 非対応**。完了通知は audio 再生 + 視覚アニメーションのみ
5. **Wake Lock はタブ非表示で自動 release**。`visibilitychange` で復帰時に再取得
6. **`startViewTransition` 未定義の可能性**。MVP では使用しない、CSS `transition` で代用
7. **OPFS の write ハンドルは排他**。同じファイルに同時書き込みすると失敗する
8. **HEVC エンコードはハードウェアアクセラレータ依存**。`isConfigSupported` で必ず事前確認、ダメなら capability check で `hevcEncode=false` を返し `getAvailablePresets()` で H.264 のみに絞る
9. **HEVC コーデック文字列は解像度ごとに動的**（L93=720p、L120=1080p30、L123=1080p60、L153=4K30、L156=4K60）。固定 L93 は 720p しかカバーできず capability check で false になる
10. **iPhone 12 以降は HDR 録画がデフォルト**。BT.2020 PQ/HLG → BT.709 への色域変換が必須。`colorConvert.ts` で対応
11. **iOS の互換性設定**。「設定 > カメラ > フォーマット > 互換性優先」だと picker 経由でも HEVC→H.264 自動変換される。SettingsPanel で「高効率」推奨を案内
12. **VFR（スロモ・タイムラプス）対応**。decoder の `VideoFrame.timestamp` をそのまま encoder に渡す。fps 固定値で再計算しない
13. **B-frame DTS/PTS**。HEVC エンコーダ出力は DTS != PTS。muxer に両方渡す（mediabunny の sample 単位で）
14. **iOS Photos は `hvc1` のみ再生可**、`hev1` 不可。mediabunny の mux 出力を `hvc1` 強制
15. **音声 sample rate**。iPhone は 44.1k/48k 混在。AudioEncoder には入力のサンプルレートをそのまま渡す（リサンプル不要）
16. **iOS Safari の `navigator.deviceMemory` 未実装**。並列度は `hardwareConcurrency` のみで判定
17. **VideoToolbox の HEVC は単一リソース**。2 並列で逆に遅くなる場合があるので Phase 4 でベンチマークし、`hevcBenchSlowdown` で動的に降格
18. **Worker cold-start**。Worker 起動 + mediabunny パースで 500ms〜2 秒。status に `'queued'`/`'starting'` を分けて UI で表示
19. **cancel/done レース**。Worker 側で done post 済みなら cancel を無視、メイン側で cancelled 後の done/failed/progress を無視
20. **OPFS 入力ファイル**。done 遷移時に削除（done 後は retry できないが、Storage コスト優先）
21. **Web Share API のサイズ制限**。1GB 超は iOS で頻繁に失敗 → 事前に download フォールバック
22. **ファイル名のサニタイズ**。共有シートに `:` `/` `\` を含むファイル名を渡すと失敗 → `_` に置換
23. **HDR 動画の colorSpace tag**。`VideoEncoderConfig.colorSpace = { primaries: 'bt709', transfer: 'bt709', matrix: 'bt709' }` を明示
24. **無音録画動画**。`audioTrack === null` の分岐を transcode.ts に
25. **iOS audio unlock**。FilePicker タップ時に無音 `<audio>` を `play().then(p => p.pause())`、`done.m4a` 再生時の制約を回避
26. **EXIF / 位置情報破棄**。プライバシー観点で mediabunny mux 設定で metadata を含めない
27. **apple-touch-icon は `<link>` で明示必要**。VitePWA の自動生成だけだと iOS が拾わない
28. **iOS Safari の `AudioContext` は per-instance で unlock 状態を持つ**。`unlockAudio()` 用と `playDoneSound()` 用に別々の `AudioContext` を生成すると、後発の ctx は `resume()` しても `state === 'suspended'` のまま無音。モジュールスコープの `sharedCtx` を 1 個だけ持って unlock + chime で共有する（v0.9.1 の PR #2、`src/platform/audio.ts`）
29. **iOS Safari の `change` イベントは transient user activation を持たない**。`<input type="file">` の `change` ハンドラで `navigator.wakeLock.request('screen')` を呼ぶと `NotAllowedError`。`click` ハンドラの冒頭（`await` を挟む前）で同期で `void wakeLockManager.acquire()` を発火させる必要がある（v0.9.1 の PR #4、`src/components/FilePicker.tsx`）
30. **Wake Lock 失敗時は診断情報を UI に出すこと**。「画面 ON 失敗」だけだと `NotAllowedError` か `NotSupportedError` か区別不能で原因究明できない。`WakeLockManager.lastError` を公開し、Indicator に inline 表示 + `data-error-name` 属性 + `title` 属性 + `aria-label` で読めるようにする（v0.9.1 の PR #3、`src/components/WakeLockIndicator.tsx`）
31. **file picker キャンセル時に `change` が発火しないので Wake Lock が leak する**。`click` で acquire した後にユーザがキャンセルすると `change` イベントは飛ばず、画面 ON のまま残り続ける。60 秒タイマーで `release()` する fallback を入れる（v0.9.1 の PR #4、`src/components/FilePicker.tsx`）
32. **iPhone 側面の Ring/Silent スイッチが Silent だと WebAudio は完全無音**。`AVAudioSession.category = 'ambient'` の仕様で、Web 側から override する API は存在しない。アプリ側ではトラブルシュート文言（Ring に倒して音量を上げる）を README / UI に出すしかない
33. **`VideoEncoder` の最初のフレームに `{ keyFrame: true }` を渡さないと、動画は再生できるがサムネイルが真っ白になる**。WebKit (iOS Safari) の VideoEncoder は自動で先頭 IDR を挿入しない実装。プレイヤーは最初の keyframe までシークして再生開始するので動画は OK だが、サムネイル抽出器は「先頭フレーム = timestamp 0」をデコードしようとして失敗する。修正: `encoder.encode(frame, frameIndex === 0 ? { keyFrame: true } : undefined)`。さらに 2 秒ごとに IDR を強制すると Photos の scrub やシーク性能も改善（`KEYFRAME_INTERVAL_US = 2_000_000`、`shouldForceKeyframe` 関数を `transcode.ts` に実装）。ビットレートコストは HEVC で 2-3% 程度なので品質より優先

---

## 質問・確認事項（既決）

- アイコンとブランドカラー → 単色ダミー、後で差し替え
- 言語 → 日本語のみで進める（英語併記は V2、TODOS.md 参照）
- プリセット名 → 仕様書のまま
