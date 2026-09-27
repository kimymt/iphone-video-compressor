# PR test output

## unit

```text

> iphone-video-compressor@1.2.4 test
> vitest run


 RUN  v3.2.7 /private/tmp/movie-ios27-pr

 ✓ src/workers/compressor-client.test.ts (25 tests) 17ms
 ✓ src/pipeline/hevcBench.test.ts (20 tests) 8ms
 ✓ src/pipeline/audioPassthrough.test.ts (17 tests) 5ms
 ✓ src/i18n/index.test.tsx (41 tests) 35ms
stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — open / close > 閉じるボタンで onClose が呼ばれる
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — open / close > backdrop タップで onClose が呼ばれる
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — open / close > ESC キーで onClose が呼ばれる
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

 ✓ src/workers/compressor-runner.test.ts (19 tests) 180ms
stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — プリセット > HEVC 対応端末: 6 個のプリセットが radio として表示される
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — プリセット > HEVC 非対応端末: H.264 プリセット 2 個のみ表示 + 注釈テキスト
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

 ✓ src/components/QueueItem.test.tsx (31 tests) 187ms
stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — プリセット > プリセット選択で settingsStore.preset が更新される
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — プリセット > 既定 (standard-hevc) が初期で checked になっている
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — カメラ案内 > cameraTipDismissed=false なら表示、dismiss ボタンで非表示になる
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — PWA インストールガイド > isStandaloneOverride=false なら表示
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

 ✓ src/platform/share.test.ts (21 tests) 22ms
stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — PWA インストールガイド > isStandaloneOverride=true なら非表示
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — バージョン表示 > __APP_VERSION__ の値が data-testid=settings-version に表示される
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

 ✓ src/components/FilePicker.test.tsx (13 tests) 274ms
 ✓ src/platform/wakeLock.test.ts (23 tests) 23ms
stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — バージョン表示 > GitHub リンクが存在する
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — drag-to-dismiss > 100px 以上下方向にドラッグ→離す で onClose が呼ばれる
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — drag-to-dismiss > 小さなドラッグ (< 100px) では onClose は呼ばれない (spring back)
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — drag-to-dismiss > 上方向のドラッグは無視される (translateY 0 のまま)
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — V2: HEVC ベンチマーク > HEVC 対応端末: bench セクションが表示される + 未実行時は "未計測"
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — V2: HEVC ベンチマーク > HEVC 非対応端末: bench セクション自体が表示されない
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — V2: HEVC ベンチマーク > bench record があるとき: speedup と並列度が表示される (slowdown=false → 並列 2)
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

stderr | src/components/SettingsSheet.test.tsx > SettingsSheet — V2: HEVC ベンチマーク > bench record で slowdown=true なら 並列 1 を表示
Warning: An update to SettingsSheet inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://reactjs.org/link/wrap-tests-with-act
    at SettingsSheet (<repo>/src/components/SettingsSheet.tsx:30:3)

 ✓ src/components/SettingsSheet.test.tsx (25 tests) 405ms
 ✓ src/pipeline/transcode.test.ts (28 tests) 4ms
stderr | src/pipeline/hevcBenchOrchestrator.test.ts > maybeAutoRunHevcBench > bench 失敗後に再度呼べる (in-flight ロックが解放される)
[hevcBench] auto-run failed: Error: first attempt failed
    at <repo>/src/pipeline/hevcBenchOrchestrator.test.ts:232:33
    at file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:105:5)
    at runSuite (file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://<repo>/node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)

 ✓ src/pipeline/hevcBenchOrchestrator.test.ts (17 tests) 19ms
 ✓ src/lib/presets.test.ts (35 tests) 8ms
 ✓ src/stores/queueStore.test.ts (68 tests) 751ms
 ✓ src/pipeline/mux.test.ts (12 tests) 19ms
 ✓ src/stores/settingsStore.test.ts (16 tests) 6ms
 ✓ src/platform/audio.test.ts (11 tests) 8ms
 ✓ src/pipeline/colorConvert.test.ts (13 tests) 4ms
 ✓ src/components/ShareButton.test.tsx (12 tests) 90ms
 ✓ src/components/QueueList.test.tsx (15 tests) 138ms
 ✓ src/components/WakeLockIndicator.test.tsx (9 tests) 56ms
 ✓ src/lib/viewTransition.test.ts (9 tests) 6ms
 ✓ src/pipeline/demux.test.ts (15 tests) 7ms
 ✓ src/pipeline/rotate.test.ts (7 tests) 26ms
 ✓ src/stores/sideEffects.test.ts (10 tests) 3ms
 ✓ src/platform/capability.test.ts (9 tests) 9ms
 ✓ src/db/opfs.test.ts (13 tests) 18ms
 ✓ tests/unit/pwa-assets.test.ts (19 tests) 5ms
 ✓ src/db/indexeddb.test.ts (9 tests) 44ms
 ✓ src/lib/format.test.ts (18 tests) 18ms
 ✓ src/stores/toastStore.test.ts (11 tests) 8ms
 ✓ src/platform/storage.test.ts (12 tests) 2ms
 ✓ src/lib/color-space.test.ts (12 tests) 4ms
 ✓ src/pwa/register-sw.test.ts (5 tests) 4ms
 ✓ src/components/Toast.test.tsx (8 tests) 72ms
 ✓ src/components/UnsupportedScreen.test.tsx (6 tests) 60ms
 ✓ src/lib/types.test.ts (4 tests) 2ms
 ✓ src/workers/ingest-stream.test.ts (4 tests) 60ms
 ✓ tests/unit/smoke.test.ts (2 tests) 1ms

 Test Files  39 passed (39)
      Tests  644 passed (644)
   Start at  21:24:45
   Duration  2.71s (transform 876ms, setup 1.47s, collect 3.08s, tests 2.61s, environment 8.82s, prepare 2.32s)


```

## build

```text

> iphone-video-compressor@1.2.4 build
> tsc -b && vite build

vite v6.4.2 building for production...
transforming...
(node:47383) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
✓ 1620 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest                          0.49 kB
dist/index.html                                    2.40 kB │ gzip:  0.94 kB
dist/assets/compressor.worker-DIWnjUB6.js        469.68 kB
dist/assets/index-BvGtTvWf.css                    17.15 kB │ gzip:  4.52 kB
dist/assets/workbox-window.prod.es5-BBnX5xw4.js    5.75 kB │ gzip:  2.36 kB
dist/assets/index-Cur33fVY.js                    253.06 kB │ gzip: 79.36 kB
✓ built in 1.28s

PWA v0.21.2
mode      generateSW
precache  14 entries (750.02 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js

```

## ios27

```text
[WebServer] (node:47571) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)

Running 15 tests using 1 worker

[WebServer] (node:47571) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(node:47575) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:47575) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   1 [chromium] › tests/ios27/faults.spec.ts:5:1 › queued cancellation rejects while the previous ingestion is still running (343ms)
  ✓   2 [chromium] › tests/ios27/faults.spec.ts:32:3 › messageerror releases worker and permits a subsequent ingestion (185ms)
[WebServer] warnings
[WebServer]   One of the glob patterns doesn't match any files. Please remove or fix the following: {
[WebServer]   "globDirectory": "<repo>/dev-dist",
[WebServer]   "globPattern": "**/*.{js,css,html,ico,png,svg,webp}",
[WebServer]   "globIgnores": [
[WebServer]     "**/node_modules/**/*",
[WebServer]     "sw.js",
[WebServer]     "workbox-*.js"
[WebServer]   ]
[WebServer] }
[WebServer]
  ✓   3 [chromium] › tests/ios27/faults.spec.ts:32:3 › timeout releases worker and permits a subsequent ingestion (195ms)
  ✓   4 [chromium] › tests/ios27/faults.spec.ts:66:1 › reload leaves a recoverable receipt for an interrupted ingestion (184ms)
  ✓   5 [chromium] › tests/ios27/ingest.spec.ts:4:1 › real stream transfer preserves bytes and leaves no receipt (144ms)
  ✓   6 [chromium] › tests/ios27/ingest.spec.ts:27:1 › mid-stream failure cleans partial data and permits next job (140ms)
  ✓   7 [chromium] › tests/ios27/ingest.spec.ts:47:1 › cancellation stops an active stream and preserves queue availability (135ms)
  ✓   8 [chromium] › tests/ios27/ingest.spec.ts:69:1 › numbered B-frame and VFR fixtures decode in presentation order (149ms)
  ✓   9 [chromium] › tests/ios27/ingest.spec.ts:84:1 › unsupported Worker transfer fails the probe safely (109ms)
  ✓  10 [chromium] › tests/ios27/ingest.spec.ts:97:1 › Worker error after dispatch is rejected and journal cleanup runs (111ms)
  ✓  11 [chromium] › tests/ios27/ingest.spec.ts:113:1 › existing input is never overwritten by a duplicate job id (118ms)
[WebServer]
[WebServer] PWA WARNING:
[WebServer] </head> and <body> tags not found in the html, the service worker and web manifest will not be injected.
  ✓  12 [chromium] › tests/ios27/ingest.spec.ts:129:1 › validation page transcodes numbered SDR and reports matching counts (238ms)
  ✓  13 [chromium] › tests/ios27/ingest.spec.ts:150:1 › failed cleanup retains a durable receipt and recovery retries it (126ms)
[WebServer]
[WebServer] PWA WARNING:
[WebServer] </head> and <body> tags not found in the html, the service worker and web manifest will not be injected.
  ✓  14 [chromium] › tests/ios27/ingest.spec.ts:176:1 › development benchmark runs both paths and records desktop baseline (786ms)
  ✓  15 [chromium] › tests/ios27/ingest.spec.ts:187:1 › recovery in another tab waits for an active ingestion (731ms)

  15 passed (4.8s)

```

## e2e

```text
[WebServer] (node:47661) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)

Running 43 tests using 1 worker

[WebServer] (node:47661) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
(node:47663) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:47663) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] warnings
[WebServer]   One of the glob patterns doesn't match any files. Please remove or fix the following: {
[WebServer]   "globDirectory": "<repo>/dev-dist",
[WebServer]   "globPattern": "**/*.{js,css,html,ico,png,svg,webp}",
[WebServer]   "globIgnores": [
[WebServer]     "**/node_modules/**/*",
[WebServer]     "sw.js",
[WebServer]     "workbox-*.js"
[WebServer]   ]
[WebServer] }
[WebServer]
  ✓   1 [webkit-iphone] › tests/e2e/capability.spec.ts:5:1 › ?dev=1 なしで起動: UnsupportedScreen または メイン画面 のどちらかが描画される (1.2s)
  ✓   2 [webkit-iphone] › tests/e2e/capability.spec.ts:26:1 › ?dev=1 強制でメイン画面 (UnsupportedScreen にならない) (356ms)
  ✘   3 [webkit-iphone] › tests/e2e/i18n.spec.ts:34:1 › 初期状態 (auto + ja-JP locale): 日本語 UI で起動 (6.2s)
(node:47740) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:47740) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   4 [webkit-iphone] › tests/e2e/i18n.spec.ts:43:1 › SettingsSheet に言語ピッカー (自動 / 日本語 / English) (1.3s)
  ✓   5 [webkit-iphone] › tests/e2e/i18n.spec.ts:58:1 › English に切替 → タイトルが Video Compressor に (5.1s)
  ✓   6 [webkit-iphone] › tests/e2e/i18n.spec.ts:86:1 › English 切替後にリロードしても永続化される (5.0s)
  ✘   7 [webkit-iphone] › tests/e2e/i18n.spec.ts:100:1 › English → 日本語に戻す → 即時切替 (30.0s)
(node:48540) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:48540) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓   8 [webkit-iphone] › tests/e2e/i18n.spec.ts:113:1 › 英語モード: プリセット名も翻訳される (1.4s)
  ✓   9 [webkit-iphone] › tests/e2e/i18n.spec.ts:128:1 › <html lang> が locale に追従 (984ms)
  ✘  10 [webkit-iphone] › tests/e2e/i18n.spec.ts:138:1 › 言語ピッカーに 6 オプション (auto / ja / en / zh-CN / zh-TW / ko) (30.0s)
(node:48788) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:48788) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✘  11 [webkit-iphone] › tests/e2e/i18n.spec.ts:149:1 › 简体中文に切替 → UI が中文化 (30.0s)
(node:48866) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:48866) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  12 [webkit-iphone] › tests/e2e/i18n.spec.ts:167:1 › 繁體中文に切替 → UI が中文(繁体)化 (2.9s)
  ✓  13 [webkit-iphone] › tests/e2e/i18n.spec.ts:178:1 › 한국어로 전환 → UI 가 한국어화 (2.6s)
  ✓  14 [webkit-iphone] › tests/e2e/i18n.spec.ts:189:1 › iOS 26+ 専用シグナル: ヘッダにサブタイトル + document.title 連動 (2.2s)
  ✓  15 [webkit-iphone] › tests/e2e/i18n.spec.ts:206:1 › og:title / meta description にも iOS 26+ 専用 が反映されている (静的 HTML) (897ms)
  ✓  16 [webkit-iphone] › tests/e2e/phase4c.spec.ts:67:3 › Phase 4c retry / clearCompleted UI › failed item に Retry + Remove ボタンが表示される (2.1s)
  ✓  17 [webkit-iphone] › tests/e2e/phase4c.spec.ts:92:3 › Phase 4c retry / clearCompleted UI › cancelled item にも Retry + Remove ボタンが表示される (2.0s)
  ✓  18 [webkit-iphone] › tests/e2e/phase4c.spec.ts:113:3 › Phase 4c retry / clearCompleted UI › inputOpfsPath="" の failed では Retry ボタンが disabled (1.4s)
  ✓  19 [webkit-iphone] › tests/e2e/phase4c.spec.ts:135:3 › Phase 4c retry / clearCompleted UI › done では Retry ボタンが出ない (Remove のみ) (1.3s)
  ✓  20 [webkit-iphone] › tests/e2e/phase4c.spec.ts:158:3 › Phase 4c retry / clearCompleted UI › terminal アイテム 0 件では Clear Completed ボタンは出ない (5.0s)
  ✓  21 [webkit-iphone] › tests/e2e/phase4c.spec.ts:174:3 › Phase 4c retry / clearCompleted UI › terminal アイテム 3 件で Clear Completed ボタンに件数表示 (1.3s)
  ✓  22 [webkit-iphone] › tests/e2e/phase4c.spec.ts:218:3 › Phase 4c retry / clearCompleted UI › Clear Completed クリックで terminal アイテムが消え、queued は残る (6.7s)
  ✘  23 [webkit-iphone] › tests/e2e/phase4c.spec.ts:253:3 › Phase 4c retry / clearCompleted UI › Remove ボタンで個別アイテム削除も動く (Phase 4b 動作の回帰確認) (35.0s)
(node:49138) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:49138) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  24 [webkit-iphone] › tests/e2e/phase5.spec.ts:59:3 › Phase 5 Share button UI › done + outputOpfsPath で Share ボタン表示 + aria-label 検証 (1.2s)
  ✓  25 [webkit-iphone] › tests/e2e/phase5.spec.ts:84:3 › Phase 5 Share button UI › done でも outputOpfsPath が無いとき Share ボタンは出ない (5.0s)
  ✓  26 [webkit-iphone] › tests/e2e/phase5.spec.ts:105:3 › Phase 5 Share button UI › processing / queued / failed / cancelled では Share ボタンは出ない (4.2s)
  ✘  27 [webkit-iphone] › tests/e2e/phase5.spec.ts:154:3 › Phase 5 Share button UI › done 複数件で Share ボタンが各行に並ぶ (35.0s)
(node:49349) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:49349) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  28 [webkit-iphone] › tests/e2e/phase6.spec.ts:14:3 › Phase 6 PWA assets › manifest.webmanifest が 200 で配信され manifest スキーマを満たす (12ms)
  ✓  29 [webkit-iphone] › tests/e2e/phase6.spec.ts:36:3 › Phase 6 PWA assets › 全アイコンが 200 で配信され content-type image/png (7ms)
  ✓  30 [webkit-iphone] › tests/e2e/phase6.spec.ts:50:3 › Phase 6 PWA assets › index.html に apple-touch-icon link と manifest 関連 meta タグ (4ms)
  ✓  31 [webkit-iphone] › tests/e2e/phase6.spec.ts:62:3 › Phase 6 Service Worker › Service Worker API が利用できる (WebKit) (433ms)
  ✓  32 [webkit-iphone] › tests/e2e/phase6.spec.ts:68:3 › Phase 6 Service Worker › navigator.serviceWorker.ready が解決する (dev mode の SW 登録) (1.4s)
  ✓  33 [webkit-iphone] › tests/e2e/queue.spec.ts:13:3 › Phase 2 queue persistence › メイン画面とその要素が描画される (908ms)
add() failed in WebKit headless (expected for some configurations): {
  ok: false,
  reason: 'opfs-write-failed',
  error: 'The operation failed for an unknown transient reason (e.g. out of memory).'
}
  ✓  34 [webkit-iphone] › tests/e2e/queue.spec.ts:26:3 › Phase 2 queue persistence › queueStore.add の永続化チェーン (OPFS 書き込み可能なら add 成功) (929ms)
  ✘  35 [webkit-iphone] › tests/e2e/settings.spec.ts:34:1 › 歯車ボタンが表示され、タップで SettingsSheet が開く (6.0s)
(node:49413) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:49413) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  36 [webkit-iphone] › tests/e2e/settings.spec.ts:46:1 › 閉じるボタンで sheet が閉じる (data-state=closed) (1.3s)
  ✓  37 [webkit-iphone] › tests/e2e/settings.spec.ts:54:1 › backdrop タップで sheet が閉じる (1.1s)
  ✓  38 [webkit-iphone] › tests/e2e/settings.spec.ts:64:1 › プリセットを切り替えると aria-checked が反映、localStorage に永続化 (2.5s)
  ✓  39 [webkit-iphone] › tests/e2e/settings.spec.ts:100:1 › バージョン情報が v1.0.0 形式で表示される (1.8s)
  ✓  40 [webkit-iphone] › tests/e2e/settings.spec.ts:107:1 › カメラ案内を dismiss すると非表示になる (3.2s)
  ✓  41 [webkit-iphone] › tests/e2e/smoke.spec.ts:5:1 › ?dev=1 でタイトル「動画圧縮」 + empty state が表示される (980ms)
  ✓  42 [webkit-iphone] › tests/e2e/smoke.spec.ts:23:1 › 日本語タイトル (document.title) が設定されている (298ms)
(node:49475) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:49475) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  43 [webkit-iphone] › tests/e2e/deletion.spec.ts:7:1 › 削除失敗した動画は警告と管理情報を残し、再起動で削除を完了する (20.3s)


  1) [webkit-iphone] › tests/e2e/i18n.spec.ts:34:1 › 初期状態 (auto + ja-JP locale): 日本語 UI で起動 ────────

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('heading', { name: '動画圧縮', level: 1 })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByRole('heading', { name: '動画圧縮', level: 1 })


      34 | test('初期状態 (auto + ja-JP locale): 日本語 UI で起動', async ({ page }) => {
      35 |   // ヘッダ「動画圧縮」が見える
    > 36 |   await expect(page.getByRole('heading', { name: '動画圧縮', level: 1 })).toBeVisible();
         |                                                                       ^
      37 |   // EmptyState も日本語
      38 |   await expect(page.getByText('まだ何もありません')).toBeVisible();
      39 |   // FilePicker の CTA も日本語
        at <repo>/tests/e2e/i18n.spec.ts:36:71

    Error Context: test-results/i18n-初期状態-auto-ja-JP-locale-日本語-UI-で起動-webkit-iphone/error-context.md

  2) [webkit-iphone] › tests/e2e/i18n.spec.ts:100:1 › English → 日本語に戻す → 即時切替 ──────────────────────

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByTestId('open-settings')


      100 | test('English → 日本語に戻す → 即時切替', async ({ page }) => {
      101 |   // まず英語に
    > 102 |   await page.getByTestId('open-settings').click();
          |                                           ^
      103 |   await page.getByTestId('settings-language-en').click();
      104 |   await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
      105 |
        at <repo>/tests/e2e/i18n.spec.ts:102:43

    Error Context: test-results/i18n-English-→-日本語に戻す-→-即時切替-webkit-iphone/error-context.md

  3) [webkit-iphone] › tests/e2e/i18n.spec.ts:138:1 › 言語ピッカーに 6 オプション (auto / ja / en / zh-CN / zh-TW / ko)

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByTestId('open-settings')


      137 |
      138 | test('言語ピッカーに 6 オプション (auto / ja / en / zh-CN / zh-TW / ko)', async ({ page }) => {
    > 139 |   await page.getByTestId('open-settings').click();
          |                                           ^
      140 |   // 各 testid が存在する
      141 |   await expect(page.getByTestId('settings-language-auto')).toBeVisible();
      142 |   await expect(page.getByTestId('settings-language-ja')).toBeVisible();
        at <repo>/tests/e2e/i18n.spec.ts:139:43

    Error Context: test-results/i18n-言語ピッカーに-6-オプション-auto-ja-en-zh-CN-zh-TW-ko--webkit-iphone/error-context.md

  4) [webkit-iphone] › tests/e2e/i18n.spec.ts:149:1 › 简体中文に切替 → UI が中文化 ────────────────────────────

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByTestId('open-settings')


      148 |
      149 | test('简体中文に切替 → UI が中文化', async ({ page }) => {
    > 150 |   await page.getByTestId('open-settings').click();
          |                                           ^
      151 |   await page.getByTestId('settings-language-zh-CN').click();
      152 |   await expect(page.getByTestId('settings-language-zh-CN')).toHaveAttribute('aria-checked', 'true');
      153 |   // SettingsSheet 内が中国語化
        at <repo>/tests/e2e/i18n.spec.ts:150:43

    Error Context: test-results/i18n-简体中文に切替-→-UI-が中文化-webkit-iphone/error-context.md

  5) [webkit-iphone] › tests/e2e/phase4c.spec.ts:253:3 › Phase 4c retry / clearCompleted UI › Remove ボタンで個別アイテム削除も動く (Phase 4b 動作の回帰確認)

    Test timeout of 30000ms exceeded.

    Error: page.evaluate: Test timeout of 30000ms exceeded.

      50 |
      51 | async function seedItems(page: Page, items: SeededItem[]): Promise<void> {
    > 52 |   await page.evaluate((seeded: SeededItem[]) => {
         |              ^
      53 |     const setState = (window as unknown as {
      54 |       __movieCompresserSetState: (
      55 |         update: (state: { items: SeededItem[] }) => { items: SeededItem[] },
        at seedItems (<repo>/tests/e2e/phase4c.spec.ts:52:14)
        at <repo>/tests/e2e/phase4c.spec.ts:254:11

    Error Context: test-results/phase4c-Phase-4c-retry-cle-4bdc4-アイテム削除も動く-Phase-4b-動作の回帰確認--webkit-iphone/error-context.md

  6) [webkit-iphone] › tests/e2e/phase5.spec.ts:154:3 › Phase 5 Share button UI › done 複数件で Share ボタンが各行に並ぶ

    Test timeout of 30000ms exceeded.

    Error: page.evaluate: Test timeout of 30000ms exceeded.

      40 |
      41 | async function seedItems(page: Page, items: SeededItem[]): Promise<void> {
    > 42 |   await page.evaluate((seeded: SeededItem[]) => {
         |              ^
      43 |     const setState = (
      44 |       window as unknown as {
      45 |         __movieCompresserSetState: (
        at seedItems (<repo>/tests/e2e/phase5.spec.ts:42:14)
        at <repo>/tests/e2e/phase5.spec.ts:155:11

    Error Context: test-results/phase5-Phase-5-Share-button-UI-done-複数件で-Share-ボタンが各行に並ぶ-webkit-iphone/error-context.md

  7) [webkit-iphone] › tests/e2e/settings.spec.ts:34:1 › 歯車ボタンが表示され、タップで SettingsSheet が開く ─────────

    Error: expect(locator).toBeVisible() failed

    Locator: getByTestId('open-settings')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByTestId('open-settings')


      34 | test('歯車ボタンが表示され、タップで SettingsSheet が開く', async ({ page }) => {
      35 |   const gearButton = page.getByTestId('open-settings');
    > 36 |   await expect(gearButton).toBeVisible();
         |                            ^
      37 |   await expect(gearButton).toHaveAttribute('aria-label', '設定を開く');
      38 |
      39 |   await gearButton.click();
        at <repo>/tests/e2e/settings.spec.ts:36:28

    Error Context: test-results/settings-歯車ボタンが表示され、タップで-SettingsSheet-が開く-webkit-iphone/error-context.md

  7 failed
    [webkit-iphone] › tests/e2e/i18n.spec.ts:34:1 › 初期状態 (auto + ja-JP locale): 日本語 UI で起動 ─────────
    [webkit-iphone] › tests/e2e/i18n.spec.ts:100:1 › English → 日本語に戻す → 即時切替 ───────────────────────
    [webkit-iphone] › tests/e2e/i18n.spec.ts:138:1 › 言語ピッカーに 6 オプション (auto / ja / en / zh-CN / zh-TW / ko)
    [webkit-iphone] › tests/e2e/i18n.spec.ts:149:1 › 简体中文に切替 → UI が中文化 ─────────────────────────────
    [webkit-iphone] › tests/e2e/phase4c.spec.ts:253:3 › Phase 4c retry / clearCompleted UI › Remove ボタンで個別アイテム削除も動く (Phase 4b 動作の回帰確認)
    [webkit-iphone] › tests/e2e/phase5.spec.ts:154:3 › Phase 5 Share button UI › done 複数件で Share ボタンが各行に並ぶ
    [webkit-iphone] › tests/e2e/settings.spec.ts:34:1 › 歯車ボタンが表示され、タップで SettingsSheet が開く ──────────
  36 passed (4.6m)

```

## preview

```text
[WebServer] (node:48506) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:48506) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
[WebServer] (node:48508) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)
[WebServer] (node:48533) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[WebServer] (Use `node --trace-warnings ...` to show where the warning was created)

Running 3 tests using 1 worker

(node:48535) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:48535) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  1 [chromium-preview] › tests/e2e-preview/offline.spec.ts:13:3 › Phase 6 offline (preview build) › SW 登録 → controller セット → オフラインで index.html がキャッシュから返る (235ms)
  ✓  2 [chromium-preview] › tests/e2e-preview/offline.spec.ts:54:3 › Phase 6 offline (preview build) › manifest.webmanifest もオフラインで配信される (precache 範囲確認) (134ms)
(node:48549) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:48549) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ✓  3 [webkit-iphone-preview] › tests/e2e-preview/cache.spec.ts:3:1 › WebKit stores HTML and manifest in CacheStorage before going offline (409ms)

  3 passed (6.2s)

```
