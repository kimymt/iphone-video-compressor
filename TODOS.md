# TODOS

`/plan-eng-review` (2026-05-14) と `/plan-design-review` (2026-05-14) で MVP から外して将来のバージョンに退避した項目、および MVP 着手前に推奨される検証ステップ。

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

## V2: View Transitions API

**何:**
`document.startViewTransition` でステート遷移をスムーズなアニメーションにする。プリセット選択、キュー追加、完了時のフェード/スライドなど。

**Why:**
iOS 26 ネイティブ感のもう一段の polish。MVP では CSS `transition` + React の `key` 切替で 80% カバーできるので、最初は CSS で出してから差分を見て V2 で深い遷移を足す。

**Pros:**
- 画面遷移が滑らかになり、ネイティブアプリ感が増す
- iOS 26 Safari は View Transitions をネイティブサポート
- 差分実装は小さい（フックでラップするだけ）

**Cons:**
- iOS 26 Safari 以外で動作しないため、フォールバック必須（=2 系統メンテ）
- アニメーション設計の手間（タイミング、duration、easing）

**スコープ:**
- 4〜8 時間（`useTransitions()` フック、状態遷移と統合、フォールバック、テスト）

**Context:**
- レビュー時の決定 TODO-2 で MVP から削除
- 仕様書の UI スタイル方針から View Transitions の記述を削除し、代わりに CSS `transition` で表現するよう変更済み

**Depends on:** Phase 6 完了後

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

## V2: 英語 UI 併記 / i18n 対応

**何:**
SettingsPanel、エラーメッセージ、QueueItem のステータス表示を英語併記、もしくは i18next 等で i18n 対応。

**Why:**
海外ユーザー需要。日本以外で WebCodecs の動画圧縮 PWA は珍しいため、英語化でユーザーが広がる可能性。

**Pros:**
- ユーザー層拡大
- iOS の `navigator.language` から自動切替できる
- 海外フィードバックから機能改善のヒントが得られる

**Cons:**
- 全文言の翻訳コスト
- 言語切替 UI の追加
- スクリーンショット類のメンテも 2 系統

**スコープ:**
- 1〜2 日（i18next 等の導入 + 全文言の翻訳 + 言語切替 UI）

**Depends on:** なし

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

**現状 (Phase 4c 終了時点):**
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
- Phase 6 の SettingsSheet 実装時に「並列ベンチを実行」ボタンを置く案も検討

**Depends on:** Phase 6 (SettingsSheet) 完了後、もしくは需要に応じて単独実施

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
