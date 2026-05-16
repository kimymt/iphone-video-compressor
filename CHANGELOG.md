# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added — V2: 完了動画のバルク保存

- **「完了をすべて保存 ({N})」ボタン** in QueueList — 圧縮完了動画を 1 タップで Share Sheet に渡し、「写真に保存」を 1 回タップで全件一括保存。従来は N 件保存に 2N タップ (個別「共有」→「写真に保存」) だったのが、**2 タップ固定** (バルク保存ボタン → 写真に保存) に短縮。
  - **`src/platform/share.ts`** に `shareFiles(blobs[], fileNames[])` 追加 — 合計サイズ 1GB ガード、`canShare({files})` 検証、AbortError = cancelled、それ以外 = `failed-multi` で個別保存に誘導
  - **`queueStore.shareAllDone()`** action — `status === 'done'` 全件の OPFS 出力を並列 read → shareFiles。1 件でも read 成功すれば残りで share、全件失敗のみ `failed-multi`
  - **`deriveShareFileName`** を ShareButton.tsx から share.ts に移動 (バルクでも使うため、ShareButton では re-export で後方互換維持)
  - **QueueList UI** — 既存「完了をすべて削除」の左に並ぶ `Share` icon ボタン、done 件数 > 0 のときのみ表示、実行中 disable
  - **文言は「保存」で統一** (ユーザのメンタルモデルが Share Sheet ではなく Photos への保存のため):
    - ボタン: `完了をすべて保存 ({N})`
    - cancelled: `保存がキャンセルされました`
    - failed-multi: `保存に失敗しました、個別に保存してください`
    - no-done: `保存できる動画がありません`
- **i18n 5 言語** に `queueList.saveAllAria`/`saveAllCta` + `share.saveAllCancelled`/`saveAllFailedMulti`/`saveAllNoneAvailable` を追加

### Added — V2: HEVC 並列ベンチマーク

- **HEVC parallel encode bench** — VideoToolbox の単一 HW エンコーダ制約 (CLAUDE.md ハマりどころ 17) を実測で検出して、`queueStore.effectiveParallelism()` が HEVC プリセットの並列度を 1 に動的降格できるようにした。
  - **`src/pipeline/hevcBench.ts`** — 合成 720p フレーム 60 枚 (~2 秒) を Canvas で生成し、1 並列 vs 2 並列で encode して `speedup = (2 * serialMs) / parallelMs` を計測 (`< 1.3` で slowdown 判定)。先頭フレームに `{ keyFrame: true }` 強制 (ハマりどころ 33)、HEVC encodeQueueSize 上限 4 で backpressure、AbortSignal 対応、VideoFrame leak ゼロ
  - **`src/pipeline/hevcBenchOrchestrator.ts`** — `shouldRunBench` (90 日経過判定) + `runAndPersistHevcBench` (bench → 両 store 伝搬) + `maybeAutoRunHevcBench` (in-flight ロック付き自動実行)
  - **`settingsStore.hevcBench: HevcBenchResult | null`** — localStorage に rich record を永続化、UI で `speedup ×1.85 — 並列 2` `最終実行: 5 分前` を表示
  - **`queueStore.setHevcBenchSlowdown()`** — bench 結果で operational boolean を更新 + IndexedDB 永続化、値変更時に `processNext()` を再評価
  - **SettingsSheet UI** — HEVC 対応端末のみ表示される bench セクション (`Cpu` icon)、実行ボタン + 再実行ボタン (`RefreshCw`)、実行中スピナー (`Loader2`)、完了/失敗トースト
  - **App.tsx 自動実行** — `envCheck.hevcEncode === true` + `shouldRunBench(record) === true` のとき init 完了後 background で 1 回実行、失敗は console.warn のみで握り潰す
  - **i18n 5 言語** に `settings.hevcBench.*` の 11 キー (intro / summary / lastRun / running / runButton / rerunButton / neverRun / parallelism1 / parallelism2 / failed / done) と `settings.section.hevcBench` を追加
- **`formatRelativeTime(ms, locale)`** in `src/lib/format.ts` — `Intl.RelativeTimeFormat` ベースの「N 分前」「N 日前」表示ヘルパー。iOS Safari 14+ で利用可、未対応環境は英語フォールバック

### Internal

- **`HevcBenchAbortError`** を export — `name === 'AbortError'` (DOM 慣習に合わせる)
- **`MAX_BENCH_AGE_MS = 90 * 24 * 60 * 60 * 1000`** — 自動再ベンチの閾値、`shouldRunBench` で使用 (iOS バージョンアップ後の VideoToolbox 挙動変化に対応)

### テスト

- Vitest: **562 / 562** (v1.1.0 出荷時 483 → +79 件)
  - `hevcBench.test.ts` 20 件 — speedup 数式 / slowdown 境界 / encoder lifecycle / AbortSignal / 環境不在
  - `hevcBenchOrchestrator.test.ts` 17 件 — shouldRunBench / runAndPersistHevcBench / maybeAutoRunHevcBench
  - `settingsStore.test.ts` +5 件 — setHevcBench / localStorage 復元 / 壊れた record 正規化
  - `queueStore.test.ts` +11 件 — setHevcBenchSlowdown / IndexedDB 永続化 / shareAllDone (空 / 混在 / OPFS 失敗 / canShare=false / cancelled)
  - `SettingsSheet.test.tsx` +5 件 — bench セクション表示分岐 / 実行クリック
  - `format.test.ts` +7 件 — `formatRelativeTime` (ja / en で出力検証)
  - `share.test.ts` +9 件 — shareFiles (空 / 長さ不一致 / 1GB 超 / canShare 未実装 / canShare=false / 成功 / AbortError / 他 error / sanitize)
  - `QueueList.test.tsx` +5 件 — save-all-done 表示分岐 / 件数 / shareAllDone 呼び出し / DOM 順
- Playwright: 既存 42/42 を維持 (本機能は手動 E2E 検証、ベンチ実行は実機 VideoEncoder を要するため)
- `tsc -b`: clean

---

## [1.1.0] - 2026-05-15 — V1.1 Feature Batch

v1.0.0 出荷後の機能拡充とバグ修正を集約した MINOR リリース。**設定シート (歯車)** でプリセット切替・言語選択・ストレージ管理を可能に、**i18n** で 5 言語対応（日本語 / English / 简体中文 / 繁體中文 / 한국어）、**View Transitions API** でキュー操作を smooth に、**サムネイル真っ白問題** を keyframe 強制で修正。累積 7 PR (#9–#15) をマージ済。

### Added

- **SettingsSheet (歯車アイコン)** — ヘッダ右上の歯車から開く bottom sheet。プリセット切替 / ストレージ使用量バー / 言語ピッカー / PWA インストール案内を 1 箇所に集約。`glass-panel` クラスを使った Liquid Glass の主要適用箇所のひとつ ([#9](https://github.com/kimymt/iphone-video-compressor/pull/9))
- **アイコン差し替え (production assets)** — Play + 下向きシェブロンの本番アイコンを `public/icons/` に投入 (192 / 512 / maskable / apple-touch-icon 180) ([#9](https://github.com/kimymt/iphone-video-compressor/pull/9))
- **View Transitions API** — `document.startViewTransition` でキュー追加・削除・retry を per-item morph + slide-in/out アニメに。`withViewTransition()` ラッパーで未対応ブラウザ + Reduced Motion で自動フォールバック。`QueueItem` ごとに `viewTransitionName: queue-item-${id}` を付けて per-item morph を有効化 ([#11](https://github.com/kimymt/iphone-video-compressor/pull/11))
- **i18n 基盤 + 英語 UI** — react-i18next 等の重量級ライブラリは採用せず、~80 行の独自 tiny 実装。`ja.ts` が型推論の元 (`Messages = typeof ja`)、`en.ts` は satisfies でキー整合性を build 時保証。`LocalePreference` (`'auto' | Locale` の union) と `Locale` を分離、auto は `detectLocale()` で iOS の `navigator.language` から解決。`<html lang>` を locale に追従、`tForLocale` で React 外（SW toast 等）からも翻訳取得可能 ([#12](https://github.com/kimymt/iphone-video-compressor/pull/12))
- **iOS 26+ 専用シグナル + OGP** — サービス名 / manifest は変更せず、ヘッダ `<h1>` の下に小さなサブタイトル「iOS 26+ 専用 / iOS 26+ only」を追加。`<title>` を「動画圧縮 — iOS 26+ 専用」 / "Video Compressor — iOS 26+ only" に。`index.html` に og:title / description / image / type / url + Twitter Card を追加（静的 HTML、日本語固定）。`I18nProvider` で `document.title` を locale に追従 ([#13](https://github.com/kimymt/iphone-video-compressor/pull/13))
- **i18n 拡張: 簡体中文 / 繁體中文 / 한국어** — 既存 auto / ja / en に 3 言語追加（計 5 言語対応）。`detectLocale` を BCP-47 / Unicode CLDR 準拠で分類（zh-HK は Apple HIG / Unicode 推奨に従い繁体扱い）。翻訳は手書き、技術用語（HEVC, H.264, WebCodecs, Wake Lock, OPFS, PWA）はそのまま。言語ピッカーは native script で表示 ([#14](https://github.com/kimymt/iphone-video-compressor/pull/14))

### Fixed

- **メインコンテナに max-width: 393px を適用 (ISSUE-001)** — レスポンシブ仕様未実装で iPhone Pro Max (430px) では左右に余白が広がりすぎる QA 報告に対処 ([#10](https://github.com/kimymt/iphone-video-compressor/pull/10))
- **出力 MP4 のサムネイル真っ白問題** — WebKit (iOS Safari) の `VideoEncoder` は最初のフレームに `{ keyFrame: true }` を渡さないと自動 IDR を挿入しない実装。動画は再生可能だが、サムネ抽出器が「先頭フレーム = timestamp 0」を独立デコード試行 → 差分情報しか無くデコード失敗 → 真っ白という症状になっていた。`shouldForceKeyframe(frameIndex, currentTimestampUs, lastKeyframeUs, intervalUs)` 純粋関数で最初のフレーム + 2 秒ごとに IDR を強制。副次効果として iOS Photos スクラブが滑らかに、Files / AirDrop / macOS Quick Look でもサムネ正常表示、動画編集アプリ取り込み時 preview 正常に。ビットレートコストは HEVC で 2-3% 増（品質より優先）([#15](https://github.com/kimymt/iphone-video-compressor/pull/15))

### Documentation

- **CLAUDE.md「ハマりどころ事前共有」に #33 を追記** — `VideoEncoder` の最初のフレームに `keyFrame: true` を渡さないとサムネが真っ白になる症状・原因・対処を記録。判定ロジックを純粋関数として切り出し、8 件の unit test で境界条件を完全カバー
- **TODOS.md を整理** — v1.1.0 で完了した 4 項目（SettingsSheet / アイコン差し替え / View Transitions / i18n）を「v1.1.0 で完了済み」セクションに集約、本体から削除。V2.1 セクションに「ドキュメント / メタデータの多言語化」候補を新規追加

### テスト

- Vitest: **473 / 473** (v1.0.0 出荷時 394 → +79 件)
- Playwright (dev、WebKit iPhone): **42 / 42** (v1.0.0 時 23 → +19 件)
- Playwright (preview、オフライン): **2 / 2**
- `tsc -b`: clean (strict + `any` ゼロ厳守を継続)

### 累積 PR (v1.0.0 以降)

| # | 区分 | 概要 |
|---|---|---|
| [#9](https://github.com/kimymt/iphone-video-compressor/pull/9) | feat | V1.1 polish (SettingsSheet + アイコン差し替え) |
| [#10](https://github.com/kimymt/iphone-video-compressor/pull/10) | fix(qa) | max-width 393px (レスポンシブ仕様) |
| [#11](https://github.com/kimymt/iphone-video-compressor/pull/11) | feat | View Transitions API |
| [#12](https://github.com/kimymt/iphone-video-compressor/pull/12) | feat | i18n 基盤 + 英語 UI |
| [#13](https://github.com/kimymt/iphone-video-compressor/pull/13) | feat | iOS 26+ 専用シグナル + OGP |
| [#14](https://github.com/kimymt/iphone-video-compressor/pull/14) | feat | i18n 拡張 (簡体/繁體/한국어) |
| [#15](https://github.com/kimymt/iphone-video-compressor/pull/15) | fix | サムネイル真っ白問題 (keyframe 強制) |

---

## [1.0.0] - 2026-05-15 — MVP Release

🎉 **MVP 出荷。** iPhone (iOS 26+) で動画をローカル圧縮するサーバーレス PWA としての最初の安定版。
本番: <https://ivc.mymt.casa>

このリリースは v0.9.0 のプレリリースに、実機検証で判明した 3 件の修正と、出荷品質のドキュメント整備を加えたもの。Phase 0〜7 の全実装が iPhone Air (iOS 26 PWA standalone) で動作確認済み。

### v0.9.x からの主な改善

#### Fixed (実機検証で判明した致命的問題、v0.9.0 → v0.9.1 で対処)
- **共有 AudioContext モデルへの移行** — 旧実装では `unlockAudio()` 用と `playDoneSound()` 用に別々の `AudioContext` を生成し、後発の ctx が `resume()` しても `suspended` のまま無音だった。モジュールスコープの `sharedCtx` を 1 個だけ持って unlock + chime で共有 ([#2](https://github.com/kimymt/iphone-video-compressor/pull/2))
- **Wake Lock 失敗時の診断 UI を追加** — 「画面 ON 失敗」だけだと `NotAllowedError` か `NotSupportedError` か区別不能で原因究明できなかった。`WakeLockManager.lastError` を公開し、Indicator にエラー名を inline 表示 ([#3](https://github.com/kimymt/iphone-video-compressor/pull/3))
- **Wake Lock acquire を click handler に移動** — iOS Safari の `change` イベントは transient user activation を持たず `NotAllowedError`。`click` ハンドラ冒頭で同期 `void wakeLockManager.acquire()` を呼ぶことで解消 ([#4](https://github.com/kimymt/iphone-video-compressor/pull/4))
- **File picker キャンセル時の Wake Lock leak** — `click` で acquire 後にキャンセルすると `change` が飛ばず leak していたのを、60 秒タイマー fallback で release ([#4](https://github.com/kimymt/iphone-video-compressor/pull/4))

#### Documentation (v1.0.0 出荷直前の整備、[#6](https://github.com/kimymt/iphone-video-compressor/pull/6))
- **README をエンドユーザー向けに全面書き直し** — 「こんな悩み / 使い方 / よくあるトラブル / プライバシー / 既知の制限 / フィードバック」を本文に、技術スタックや開発手順は末尾の `<details>` に集約
- **CLAUDE.md「ハマりどころ事前共有」に 28〜32 を追記** — v0.9.0→0.9.1 で学んだ AudioContext per-instance unlock / `change` イベント user activation / WakeLock 診断 UI / picker キャンセル leak / Ring/Silent スイッチ無音 を記録

### MVP 機能サマリ (v0.9.x からの累積)

#### 圧縮機能
- iPhone 撮影動画 (HEVC/H.264, MOV/MP4, HDR/HLG) のローカル圧縮
- 6 種類の固定プリセット (最高画質 / 高画質 / 標準 / 軽量 / 互換優先 / 最小)
- 複数動画の同時投入 + 順次処理 (端末性能に応じて最大 2 並列)
- HDR (BT.2020 PQ/HLG) → SDR (BT.709) トーンマッピング
- HEVC コーデック文字列の動的選択 (解像度 + fps ベース、L93/L120/L123/L153/L156)
- iOS Photos 互換の `hvc1` box 強制出力
- VFR (スロモ / タイムラプス) 対応 — decoder timestamp 維持
- 無音録画動画への対応 (audio track なしブランチ)
- EXIF / 位置情報の自動削除 (プライバシー保護)

#### UI
- 進捗バーと残り時間予測 (10 秒間の処理速度から線形外挿)
- 6 種類のステータスアイコン (queued / starting / processing / done / failed / cancelled)
- 完了動画の Web Share API 共有 (写真ライブラリ / AirDrop / 他アプリ)
- 1GB 超出力のダウンロードフォールバック (iOS Share API 制約対策)
- ファイル名サニタイズ (`:` `/` `\` → `_`)
- エラートースト (容量不足 / 未対応コーデック / Share 拒否)
- 完了時の audio chime (A5 + E6, 450ms)
- 完了時の `CheckCircle2` scale-in アニメ
- ダークモード / ライトモード自動切替

#### iOS 26 対応
- `AudioEncoder` / `VideoEncoder` ケーパビリティ判定
- 非対応端末向け `UnsupportedScreen` (iOS 25 以下を明示的に閉じる)
- Screen Wake Lock (処理中の画面ロック防止) + visibilitychange 自動再取得
- WakeLock 状態の視覚インジケータ (取得成功 / 失敗 + エラー名表示)
- iOS audio unlock (FilePicker タップで `AudioContext.resume()`)

#### 永続化
- OPFS (Origin Private File System) で動画ファイル本体を保存
- IndexedDB (idb) でキューメタ情報を保存
- 再起動後のキュー復元 (processing → queued リセット、中途出力削除)
- Persistent Storage 要求 (`navigator.storage.persist()`)
- 容量チェック (入力 × 2.5 < available)
- Done 遷移時の入力ファイル削除 (ストレージ節約)

#### PWA
- Service Worker (Workbox autoUpdate)
- ホーム画面追加 → standalone 起動
- オフライン起動 (precache 14 entries, ~660 KiB)
- apple-touch-icon + apple-mobile-web-app-* meta tags
- manifest.webmanifest (portrait orientation, dark theme)

### 対応端末
- **iOS 26 以降の Safari のみ**
- iOS 17〜18.x は `AudioEncoder` 未実装のため非対応 (起動時に専用画面)

### テスト
- Vitest: 394/394 unit + 統合
- Playwright (dev): 23/23 smoke + capability + queue + phase4c + phase5 + phase6
- Playwright (preview): 2/2 オフライン検証

### デプロイ
- Cloudflare Pages 自動デプロイ
- 本番: <https://ivc.mymt.casa> (custom domain)
- 別 URL: <https://iphone-video-compressor.pages.dev>

---

## [0.9.1] - 2026-05-15

実機検証で見つかった完了チャイムと Wake Lock の問題を 3 PR で修正。

### Fixed
- 共有 AudioContext モデル: 完了チャイムが鳴らない問題を修正 ([#2](https://github.com/kimymt/iphone-video-compressor/pull/2))
- WakeLockIndicator 追加 + 診断 info を UI に表示 ([#3](https://github.com/kimymt/iphone-video-compressor/pull/3))
- Wake Lock acquire を click handler に移動: `NotAllowedError` を解消 ([#4](https://github.com/kimymt/iphone-video-compressor/pull/4))
- File picker キャンセル時の Wake Lock leak を 60 秒タイマーで release ([#4](https://github.com/kimymt/iphone-video-compressor/pull/4))

---

## [0.9.0] - 2026-05-15 — Pre-release

MVP Phase 0〜7 完了。GitHub + Cloudflare Pages にデプロイ。

### Added (by phase)
- **Phase 0**: プロジェクト初期化 (Vite + React + TypeScript strict + Tailwind + Vitest + Playwright)
- **Phase 0.5**: mediabunny の iOS Safari + HEVC mux 互換性検証 spike
- **Phase 1**: iOS 26 capability check + UnsupportedScreen
- **Phase 2**: OPFS + IndexedDB によるキュー永続化 (processing → queued リセット含む)
- **Phase 3**: WebCodecs 動画圧縮パイプライン (presets + demux + transcode + rotate + colorConvert + mux + Worker)
- **Phase 4**: キュー処理ループ (worker integration + QueueItem/QueueList UI + retry + clearCompleted + effectiveParallelism)
- **Phase 5**: Web Share API + Screen Wake Lock + 完了チャイム
- **Phase 6**: PWA 化 (Service Worker + apple-touch-icon + manifest + offline)
- **Phase 7**: エラー UX 統一 + console.log 削除 + テスト整備

[1.1.0]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v1.1.0
[1.0.0]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v1.0.0
[0.9.1]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v0.9.1
[0.9.0]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v0.9.0
