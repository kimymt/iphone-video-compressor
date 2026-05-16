# TODOS

`/plan-eng-review` (2026-05-14) と `/plan-design-review` (2026-05-14) で MVP から外して将来のバージョンに退避した項目、および MVP 着手前に推奨される検証ステップ。Phase 7 終了時点 (2026-05-15) に V1.1 候補も追記。v1.1.0 出荷時 (2026-05-15) に完了項目を整理。

---

## ✅ v1.1.0 で完了済み

CHANGELOG.md の `[1.1.0]` セクションに詳細あり:

- **SettingsSheet (歯車アイコン)** — bottom sheet でプリセット切替 / ストレージ使用量バー / 言語ピッカー / PWA インストール案内 ([#9](https://github.com/kimymt/iphone-video-compressor/pull/9))
- **アイコン差し替え (production assets)** — Play + 下向きシェブロンの本番アイコン ([#9](https://github.com/kimymt/iphone-video-compressor/pull/9))
- **View Transitions API** — キュー追加・削除・retry を smooth な per-item morph + slide-in/out アニメに ([#11](https://github.com/kimymt/iphone-video-compressor/pull/11))
- **英語 UI / i18n** — auto / 日本語 / English / 简体中文 / 繁體中文 / 한국어 の 5 言語対応、独自 tiny 実装 (~80 行) ([#12](https://github.com/kimymt/iphone-video-compressor/pull/12), [#14](https://github.com/kimymt/iphone-video-compressor/pull/14))

---

## V1.1: デザインシステムの視覚検証モックアップ

**何:**
Phase 0 もしくは Phase 6 の最初に `gstack design` (OpenAI API 経由) もしくは `/design-shotgun` でメイン画面 / SettingsSheet / EmptyState / Error UX の 4 スクリーンをモックアップ生成して、本レビューで決めたデザインシステム（タイポグラフィ、カラー、Liquid Glass の使用範囲、lucide-react アイコン）が実際の見た目に落ちたときに「iOS 26 ネイティブ感」を出せるかを視覚検証。

**Why:**
本レビューでは OpenAI API キー未設定でモックアップ生成をスキップした。トークンの数値は HIG ベースで筋が通っているが、実装してみるまで「ちゃんと iOS っぽい」かは紙の上では分からない。Phase 6 で完成形を見てからギャップを発見すると、実装やり直しコストが重い。

**Pros:**
- 実装前に「想像と現実のギャップ」を発見できる
- デザインレビューの決定を視覚的に確認、Phase 6 のポリッシュコストを下げる
- API キーを設定する一回限りの作業で済む

**Cons:**
- OpenAI API のコスト ($3-6 程度)
- API キーの管理が増える（OPENAI_API_KEY env var もしくは `~/.gstack/openai.json`）

**スコープ:**
- API キー設定: 5 分
- モックアップ生成 + 検証: 30-60 分

**Context:**
- 本レビュー D2 でこのステップを保留に決定
- `gstack design variants --brief "..." --count 3 --output-dir ...` で生成
- 比較ボードを HTTP で開けるので、見て / コメント / リミックスを 1 回サイクル

**Depends on:** Phase 0 完了後

---

## スコープ除外（2026-05-16 決定）

以下の 2 機能は V2 候補から正式に除外。コア「圧縮して共有」フローへの集中と、外部ツールで代替可能な機能を抱え込まない方針。

### ❌ カスタムプリセット

**理由:** 詳細な圧縮設定（コーデック・解像度・ビットレート個別指定）が必要なユーザーは、既存の専門ツール (HandBrake / FFmpeg / iMovie 等) を使えば足りる。本アプリは「iPhone から数タップで適切に圧縮して共有」を目的とし、固定 6 プリセットでカバーできない領域は守備範囲外と判断。

**含意:**
- `PresetKey` の union に `'custom'` を再導入しない
- `SettingsPanel` にスライダー UI を追加しない
- CLAUDE.md 機能要件 #3 の「カスタムプリセットは V2」記述は事実上「対応しない」に変わる（次回 CLAUDE.md 改訂時に明示）

### ❌ ComparePreview 同期再生 + PiP

**理由:** 圧縮前後の比較は既存の動画プレイヤー (Photos.app の Picture in Picture、QuickTime、VLC 等) で十分実現可能。本アプリ内に同期再生 UI を抱え込むと、2 動画同時デコードのメモリコスト + 同期状態管理 + iOS Safari PiP 制約に対する継続メンテが発生し、コア機能への投資を圧迫する。

**含意:**
- `src/components/ComparePreview.tsx` を作らない
- `QueueItem` 完了時に「比較プレビュー」ボタンを追加しない
- 圧縮前後の画質確認が必要なユーザーには README で外部プレイヤー利用を案内（任意・将来対応）

### ❌ HEVC HDR 出力（旧 V2+1 候補）

**理由:** HDR 維持で圧縮したいプロユーザー (映像制作者、HDR 素材を扱う編集者) は既存の専門ツール (Final Cut Pro / DaVinci Resolve / Compressor / HandBrake nightly 等) を使えば足りる。本アプリは「iPhone から数タップで適切に圧縮して共有」が目的で、Photos / AirDrop / iMessage への共有では受信側が HDR 再生対応とは限らないため、SDR (BT.709) に統一する現状の方がコア機能としては正しい。HDR Main 10 Profile (`hvc1.2.4.L153.B0`) の capability 分岐 + ファイルサイズ増 + 「HDR→SDR が欲しい」要望との競合を考慮し、抱え込まない方針。

**含意:**
- `colorConvert.convertToBt709()` の BT.2020 → BT.709 トーンマッピング方針は永続（HDR→SDR 一方向）
- `buildHevcCodecString()` に Main 10 Profile (`hvc1.2.4.*`) を追加しない
- `capability.ts` に `hevcMain10Encode` フラグを追加しない

### ❌ mid-stream resume（中断地点からの処理再開）

**理由:** 5 分超の 4K 動画を中断耐性のある形で圧縮したいユーザーは、デスクトップの専門ツール (HandBrake / FFmpeg / Compressor 等、いずれもネイティブの中断再開機構を持つ) を使えば足りる。本アプリは「iPhone で短〜中尺動画を数タップで圧縮して共有」が目的で、長尺・高解像度・中断耐性を要求するワークフローはデスクトップ領域。技術的にも WebCodecs の内部状態シリアライズは仕様未定義で、各 codec の reconfigure を自前実装 + IDR フレーム境界管理 + 再現性のある「途中で死ぬ」テストフィクスチャ作成のコストは「mobile での quick compress」ユースケースに釣り合わない。長尺動画はユーザー側で事前にクリップ分割するワークフロー想定。

**含意:**
- A4 決定（`processing → queued` リセット + 中途 OPFS 出力削除）は永続方針
- `transcode.ts` に checkpoint / serialization フックを追加しない
- 「ジョブが失敗した」UI は現状の `failed` / `cancelled` の二択のまま
- README に「長尺動画はデスクトップツールで分割してから処理する」案内を追加（任意・将来対応）

---

## V2: iPad Pro 大画面レイアウト

**何:**
iPad の横向き / 縦向きで FilePicker と QueueList を 2 カラム表示にする。Apple Pencil 操作の検討（ドラッグでファイル追加など）。

**Why:**
iPad での利用体験向上。iPhone と同じ縦長レイアウトだと画面の余白が大きすぎる。

**Pros:**
- iPad ユーザーに対する見栄えが大幅に向上
- 同時に複数動画のキュー進捗を一望できる
- iPad で撮った映像（Cinematic mode 4K HDR）の処理用途にハマる

**Cons:**
- レイアウト分岐が増える（breakpoint の管理）
- Playwright のテスト viewport が iPhone + iPad 両方必要

**スコープ:**
- 2〜3 日（Tailwind の breakpoint 拡張、レイアウト分岐、Playwright iPad viewport テスト）

**Depends on:** Phase 6 完了後

---

## V2: 自動アップデート時の進行中ジョブ復旧

**何:**
Service Worker の `skipWaiting` で処理中ジョブが途切れないよう、進行中なら次の遷移までアップデートを待機する仕組み。

**Why:**
Phase 6 の `registerType: 'autoUpdate'` は処理中のジョブを中断する可能性。WebCodecs のような長時間処理を持つ PWA では、SW アップデートのタイミング制御が重要。

**Pros:**
- 「アップデートで処理が消えた」というクレームを防ぐ
- アップデート通知 UI のチャンスでもある

**Cons:**
- `processQueue` の完了待ちロジックが必要
- アップデートが遅延する分、セキュリティパッチの適用も遅れる

**スコープ:**
- 4〜8 時間

**Depends on:** Phase 6 完了後

---

## ✅ v1.2.0 で完了済み

### HEVC 並列ベンチマーク (hevcBenchSlowdown 自動判定)

CHANGELOG.md の `[1.2.0]` セクションに詳細あり:

- **`src/pipeline/hevcBench.ts`** — 合成 720p フレーム (60 枚) を 1 並列 vs 2 並列で encode し
  speedup を計測。`(2 * serialMs) / parallelMs` の比が threshold (1.3) 未満なら
  `slowdown=true`。AbortSignal 対応、VideoFrame leak ゼロ。
- **`src/pipeline/hevcBenchOrchestrator.ts`** — bench 実行と settingsStore / queueStore への
  伝搬を担当。`shouldRunBench` (90 日経過判定) + `maybeAutoRunHevcBench` (in-flight ロック付き
  自動実行) のグルー。
- **`settingsStore.hevcBench: HevcBenchResult | null`** — localStorage に rich record を永続化。
  SettingsSheet で「speedup ×1.85 — 並列 2」「最終実行: 5 分前」を表示。
- **`queueStore.setHevcBenchSlowdown()`** — bench 結果で operational boolean を更新 + IndexedDB
  永続化。値変更時に `processNext()` を再評価して queued アイテムの並列度を即時反映。
- **SettingsSheet UI** — HEVC 対応端末のみ表示される bench セクション。実行ボタン (`Cpu` icon)
  と再実行ボタン (`RefreshCw` icon)、実行中スピナー (`Loader2`)、完了/失敗トースト。
- **App.tsx 自動実行** — `envCheck.hevcEncode === true` + `shouldRunBench(record) === true` の
  ときに init 完了後 background で 1 回実行。失敗は console.warn のみで握り潰す。
- **i18n 5 言語** に `settings.hevcBench.*` の 11 キー追加 (intro / summary / lastRun / running /
  runButton / rerunButton / neverRun / parallelism1 / parallelism2 / failed / done)。
- **テスト 60+ 件追加** (Vitest 540/540 緑、+57):
  - `hevcBench.test.ts` 20 件 — speedup 数式 / slowdown 境界 / encoder lifecycle / AbortSignal / 環境不在
  - `hevcBenchOrchestrator.test.ts` 17 件 — shouldRunBench / runAndPersistHevcBench / maybeAutoRunHevcBench
  - `settingsStore.test.ts` +5 件 — setHevcBench / localStorage 復元 / 壊れた record 正規化
  - `queueStore.test.ts` +3 件 — setHevcBenchSlowdown / IndexedDB 永続化
  - `SettingsSheet.test.tsx` +5 件 — bench セクション表示分岐 / 実行クリック
  - `format.test.ts` +7 件 — `formatRelativeTime` (Intl.RelativeTimeFormat、5 言語確認)

---

## V2.1: ドキュメント / メタデータの多言語化

**何:**
UI 本体は 5 言語化済 (v1.1.0)。次のステップとして:
- `manifest.webmanifest` の多言語化 (ホーム画面アプリ名、`description`)
- OGP / Twitter Card を locale 別に生成
- `README.md` / `CHANGELOG.md` / `TODOS.md` の多言語化

**Why:**
UI が 5 言語対応していても、ホーム画面追加時のアプリ名や検索エンジンに見える OGP は日本語のままになっている。海外ユーザーに対する一貫性を高めるためのフォローアップ。

**Pros:**
- ホーム画面に表示されるアプリ名が iPhone の言語設定に追従
- SNS 共有時の OGP プレビューが locale 別
- GitHub ページに来た海外ユーザーがすぐに使い方を理解できる

**Cons:**
- manifest の多言語化は Web 標準として未確立 (`localizedAppearance` proposal 段階)
- 静的 HTML の OGP を locale 別に出すには Vite ビルドの分岐が必要
- README / CHANGELOG の英訳メンテコストが新規発生

**スコープ:**
- manifest 多言語化: 2〜4 時間 (現状の Web 仕様で可能な範囲のみ)
- OGP locale 別: 1 日
- README / CHANGELOG / TODOS 多言語化: 各 0.5 日 + 継続メンテ

**Depends on:** なし

---

## ✅ V2.x: Eng Review (2026-05-15) で出た MINOR バックログ — 全 14 件完了

`/cso` + retrospective engineering review (v0.9.1 → main 累積 12 PR レビュー) で見つかった改善余地。すべて 2026-05-15 中に対応完了:

- **i18n 高優先 4 件**: PR #22 で対応 (commit `135ef75`)
- **View Transitions 中優先 4 件**: PR #22 で対応 (commit `0425319`)
- **SettingsSheet UX 中優先 4 件**: PR #23 で対応 (commit `24ab2a8`)
- **Icons / Build 低優先 2 件**: PR #23 で対応 (commit `7f7f4c0`)

各項目の元仕様は git history に残置 (本ファイルでは履歴のためそのまま記載)。

### i18n (高優先度) ✅ 完了 (PR #22)

1. **drift テストに placeholder set 比較を追加** ([src/i18n/index.test.tsx:285-296](src/i18n/index.test.tsx))
   現状: キー集合のみ runtime 一致を検証。`ja` で `'残り {duration}'` が翻訳ミスで他 locale で `'剩餘 {time}'` になっても TS も runtime test も通る。
   対処: `it.each` 内で `extractPlaceholders(jaValue)` と各 locale 同キーの set を比較 (10 行)。

2. **`detectLocale()` で `navigator.languages[]` を見る** ([src/i18n/index.tsx:64-65](src/i18n/index.tsx))
   現状: `navigator.language` (1 個) のみ。iOS で言語優先順位を `[zh-TW, ja, en]` に並べているユーザを取りこぼす可能性。
   対処: `for (const l of navigator.languages ?? [navigator.language])` で順次マッチ、未マッチで `'en'`。

3. **`isValidLocale` / `isValidLocalePreference` と `settingsStore.normalizeLanguage` の二重実装解消** ([src/stores/settingsStore.ts:96-108](src/stores/settingsStore.ts))
   現状: i18n と settingsStore で同じ列挙を別々に管理。Locale 追加のたびに 2 箇所同期する手間。
   対処: settingsStore 側で `isValidLocalePreference` を i18n から import。

4. **`interpolate()` の placeholder regex を named-only に絞る** ([src/i18n/index.tsx:103](src/i18n/index.tsx))
   現状: `\{(\w+)\}` は `{0}` を許容する (ICU positional に紛らわしい)。
   対処: `[a-zA-Z]` 始まりに絞る or docs に「named only」と明記。

### View Transitions (中優先度) ✅ 完了 (PR #22)

5. **retry の VT 意味論を明確化** ([src/stores/queueStore.ts:289-305](src/stores/queueStore.ts), [src/components/QueueItem.tsx:121](src/components/QueueItem.tsx))
   現状: retry は同じ `id` を保つので `viewTransitionName: queue-item-${id}` が VT API では morph 扱いされ、`::view-transition-new(*):only-child` の slide-in は走らない。
   対処 A: status flip だけアニメさせたいなら CSS で `[data-status="queued"]` の enter アニメに切り替え。
   対処 B: 「再投入感」を出したいなら `viewTransitionName` を `queue-item-${id}-${retryCount}` にして retry のたびに変える。

6. **`viewTransitionName` 衝突防御 (tiebreaker)** ([src/components/QueueItem.tsx:121](src/components/QueueItem.tsx))
   現状: `viewTransitionName: queue-item-${id}` で UUID 衝突は実質ゼロだが、テスト fixture でハードコード id 使用時に warning。
   対処: `queue-item-${id}-${addedAt}` で tiebreaker (1 行)。

7. **VT 不在 + Reduced Motion ON のテスト追加** ([src/lib/viewTransition.test.ts](src/lib/viewTransition.test.ts))
   現状: 2 つの fallback 条件 (`||`) を別々にカバーしているが、両方 true の挙動テストなし。
   対処: 1 件追加で regression に強くなる。

8. **`::view-transition-group(*)` の root duration 不整合** ([src/index.css:133-153](src/index.css))
   現状: root group は 0.3s、old/new は 0.2s で 100ms のズレ。視覚影響ほぼなし。
   対処: `::view-transition-group(root) { animation-duration: 0.2s }` 明示。

### SettingsSheet UX (中優先度) ✅ 完了 (PR #23)

9. **drag-to-dismiss target を header 全体に拡大** ([src/components/SettingsSheet.tsx:253-260](src/components/SettingsSheet.tsx))
   現状: 40×6px の小さい handle のみ。iOS native sheet は header 行全体を drag できる。
   対処: handle + title + close button area に touch handlers を移動、`delta > 8px` debounce で close 誤発火を防ぐ。

10. **「自動」が現在解決された locale を表示** ([src/components/SettingsSheet.tsx:214-221](src/components/SettingsSheet.tsx))
    現状: 静的に `t('settings.language.auto')` (= `'自動 (デバイス設定に従う)'`)。
    対処: `useI18n().locale` を補間して `'自動 (現在: English)'`-style に。混合言語環境のユーザの安心感が上がる。

11. **storage bar の色を >80%/>95% で変える** ([src/components/SettingsSheet.tsx:209](src/components/SettingsSheet.tsx))
    現状: 常に `bg-[var(--accent)]`。iOS Settings → General → iPhone Storage は黄→赤に。
    対処: 2 個の ternary で `bg-[var(--warning)]` / `bg-[var(--error)]` を出し分け。

12. **`settingsStore.init()` write-back の payload coupling を解消** ([src/stores/settingsStore.ts:136-141](src/stores/settingsStore.ts))
    現状: 4 箇所 (init / setPreset / dismissCameraTip / setLanguage) で同じ 3-field literal を repeat。新 field 追加時にずれる risk。
    対処: `currentPersisted()` helper を抽出。

### Icons / Build (低優先度) ✅ 完了 (PR #23)

13. **`generate-icons.mjs` の SVG width 正規表現を DOM mutation に置換** ([scripts/generate-icons.mjs:30-32](scripts/generate-icons.mjs))
    現状: `svg.replace(/width="\d+"/, ...)`。SVG が `width="100%"` や属性順変更で silently 破綻。
    対処: `<svg>` の `setAttribute('width', '100vw')` を page context 内で実行。

14. **`generate-icons.mjs` の決定性 smoke test を CI に追加**
    現状: 同じ SVG → 同じ PNG の保証は Playwright/chromium のバージョン依存で隠れている。
    対処: CI でアイコン生成を 2 回走らせて diff、byte-identical を確認。anti-aliasing regression を検出。
