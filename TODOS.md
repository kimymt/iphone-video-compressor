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

## V2: カスタムプリセット

**何:**
ユーザーがコーデック・解像度・動画/音声ビットレート・ビットレートモード（CBR/VBR）を自由に設定できるダイアログ + スライダー UI。`PresetKey: 'custom'` を復活させ、`CustomPreset = Omit<Preset, 'key'> & { key: 'custom' }` 型を導入。`SettingsPanel` にスライダー UI を追加し、`localStorage` に保存。

**Why:**
プリセットだけで足りないこだわり派ユーザー（撮影者、編集者、特殊用途）向け。プロにとっては有用だが、MVP の 95% 以上のユーザーは固定 6 プリセットでカバーできる。

**Pros:**
- カスタムプリセットを保存しておけば、毎回同じ設定でワンタップ圧縮できる
- 上限ビットレート指定で「クラウド側の制約に合わせる」ユースケースに対応
- 解像度・FPS の手動指定で意図的な低解像度ダウンサンプリングが可能

**Cons:**
- UI スコープが膨らむ（コーデック切替、ビットレートスライダー、解像度プリセット、音声制御）
- バリデーション（無効な組み合わせを弾く）が必要
- カスタム値の保存・読み込み・export/import 仕様を定義する必要

**スコープ:**
- 設計 + 実装で 3〜5 日（ダイアログ UI、バリデーション、保存読み込み、テスト）

**Context:**
- レビュー時の決定 C2 で MVP から削除
- `PresetKey` の union から `'custom'` を削除済み
- 復活させるときは `types.ts` の `PresetKey` に追加し、`presets.ts` に `buildCodecString()` が custom も扱えるよう拡張、`SettingsPanel` にダイアログ追加

**Depends on:** なし（MVP 出荷後すぐ着手可能）

---

## V2: ComparePreview 同期再生 + Picture in Picture

**何:**
入力（圧縮前）と出力（圧縮後）の `<video>` を縦並びで同時再生する `src/components/ComparePreview.tsx`。タイムラインスライダーで両方同時シーク、PiP ボタンで片方を画中画に出して比較。`QueueItem` 完了時に「比較プレビュー」ボタンとして表示。

**Why:**
「圧縮で画質が劣化していないか」を視覚的に確認したいユーザーには有用。コアの「圧縮して共有」フローには不要なポリッシュ機能。

**Pros:**
- 圧縮レベル（プリセット）選びの判断材料になる
- ビフォーアフター動画として SNS 共有用にも使える
- 信頼性アピール（「ちゃんと圧縮できてる」を見せる UX）

**Cons:**
- メモリ消費が増える（2 つの動画を同時にデコード）
- 同期再生の状態管理がトリッキー（早送り/巻き戻し/シーク同期）
- iOS Safari の PiP は制約あり（同時に PiP できるのは 1 ウィンドウのみ）

**スコープ:**
- 1〜2 日（同期再生 UI、PiP API、状態管理、テスト 5 ケース）

**Context:**
- レビュー時の決定 TODO-1 で MVP から削除
- 仕様書のディレクトリ構造からも `ComparePreview.tsx` を削除済み

**Depends on:** Phase 5（ShareButton + WakeLock）完了後

---

## V2: mid-stream resume（中断地点からの処理再開）

**何:**
アプリ再起動後に、処理が中断していたジョブを中断地点から再開できるようにする。VideoDecoder / VideoEncoder / muxer の内部状態をシリアライズして OPFS に保存、復元時にリストア。

**Why:**
長い 4K 動画の処理中にアプリが落ちると、現状（A4 の決定で `processing → queued` リセットして再処理）はゼロから処理し直す必要があり、ユーザー時間とバッテリーを消費する。長動画ユーザーには大きな価値。

**Pros:**
- 5 分超の 4K HDR 動画でも安全に処理できる
- バッテリー切れ・アプリ kill が許容範囲になる

**Cons:**
- WebCodecs の状態シリアライズが事実上未定義
- 各 codec の reconfigure フローを自前で書く必要
- 復元後の最初の数フレームが破綻するリスク（IDR フレーム境界の管理）
- テストフィクスチャ作りが難しい（再現性のある「途中で死ぬ」シナリオ）

**スコープ:**
- 5〜10 日

**Context:**
- レビュー時の A4 で「MVP では processing → queued リセット、中途ファイル削除」と決定済み
- mid-stream resume はそれを上回るオーバーリーチとして V2 に退避

**Depends on:** 安定した MVP（Phase 7 完了）後

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

## V2: HEVC 並列ベンチマーク (hevcBenchSlowdown 自動判定)

**何:**
端末で「HEVC を 2 並列で encode したときに 1 並列より遅くなるか」をベンチマークし、結果を `localStorage.hevcBenchSlowdown` に保存。`queueStore.effectiveParallelism(preset)` が hevcBenchSlowdown=true のとき HEVC を 1 並列に降格する。

**Why:**
VideoToolbox の HEVC エンコーダは単一ハードウェアリソース。2 並列で逆に遅くなる端末がある (CLAUDE.md ハマりどころ 17)。一方、A17/M シリーズ世代では並列が効くこともある。実機データで判定したい。

**現状 (v1.1.0 時点):**
- `effectiveParallelism(preset)` は store に実装済み。`hevcBenchSlowdown === true` のときに HEVC を 1 並列に降格するロジックは既に動く。
- 自動ベンチは実装していない。`hevcBenchSlowdown` は `null` (= 未計測) で初期化、`null` を false 扱い (= 降格しない)。
- 結果として現状は parallelism = effectiveParallelism。
- iPhone Air は `navigator.hardwareConcurrency=4` capped で `parallelism=1` のため、bench を実装しても今のところ効果なし。Mac (8+ コア報告) で 2 並列が選ばれた場合のみ意味を持つ。

**Pros:**
- Mac やハイエンド iPad で HEVC 並列が遅い端末を自動的に 1 並列に落とせる
- ユーザーが設定を意識しなくて済む

**Cons:**
- 60 秒の動画を 2 回処理するベンチは初回起動 UX を大きく損なう (バックグラウンドで走らせるか、初回ジョブ後に走らせるかは要設計)
- ベンチ用の合成動画 (テストパターン) を Worker 内で生成する仕組みが必要
- ベンチ実行中に実ジョブが入ったときの優先制御が必要

**スコープ:**
- 1〜2 日 (合成入力生成、並列タイミング計測、結果保存、バックグラウンド実行、SettingsSheet からの再実行 UI)

**Context:**
- CLAUDE.md「実装フェーズ > Phase 4」で当初 Phase 4 に含めていたが、Phase 4c 着手時にユーザー判断で V2 へ退避 (2026-05-15 のセッション)
- 必要なときに store 側の `hevcBenchSlowdown` を上書きすれば即座に降格する API は揃っている
- v1.1.0 で SettingsSheet が実装済み → そこに「並列ベンチを実行」ボタンを追加するのが現実的

**Depends on:** 需要に応じて単独実施可能

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

## 検討: HEVC HDR 出力（V2 + 1）

**何:**
出力動画も HDR (BT.2020 HLG) で出すオプション。現状は MVP で SDR (BT.709) に統一しているが、将来的に HDR→HDR トランスコードを選べるようにする。

**Why:**
iPhone 12+ で HDR 録画したユーザーが「画質を保ったまま圧縮したい」とき、SDR に落とすと色情報が劣化する。

**Pros:**
- 4K HDR ユーザーには大きな価値
- AirDrop で他の iPhone に送れば HDR で再生できる

**Cons:**
- HEVC Main 10 Profile が必要（`hvc1.2.4.L153.B0`）、capability check で別判定
- ファイルサイズが SDR より大きくなる
- 「HDR を SDR に落とす」ニーズの方が多いかも知れない（後で確認）

**スコープ:**
- 3〜5 日

**Depends on:** MVP（V1）出荷後にユーザーフィードバックを集めてから判断

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
