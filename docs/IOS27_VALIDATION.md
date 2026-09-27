# iOS 27 PWA validation

## PR準備時の再検証（2026-09-27）

最新main (`257554e`) に今回の差分を適用したPR用worktreeで再検証。単体644件、Chromiumの追加テスト15件、本番プレビュー3件、型チェック・本番ビルド・開発用コードの本番混入チェックが成功。既存WebKit UIテストは失敗があり、全検証成功とは扱わない。詳細は [PR検証記録](verification/2026-09-27-pr.md) を参照。

ユーザーの方針により、実機検証は本番公開後に行う。実機合格済みではない。Streamsは本番無効を維持する。

## ローカル検証結果（2026-09-13）

- 単体テスト: 39ファイル、630件成功。
- Chromium実ブラウザーテスト: 15件成功。SHA-256一致、キャンセル、Worker異常、読み取り失敗、削除失敗と復旧、複数タブの競合、Bフレーム/VFR診断、SDR実圧縮、比較計測を確認。
- 型チェック・本番ビルド・差分の空白チェック: 成功。
- 8MiBの合成データを各5回取り込んだ中央値: 既存経路6.1ms（5.9–7.3ms）、Streams経路13.2ms（13.1–29.9ms）。このデスクトップ環境では高速化していない。本番への採用条件は未達。
- SDR検証素材は入力・圧縮後とも60フレームで、タイムスタンプの逆転・重複なし。実画像の順序・色の正確さ、厳密な音声同期はこの集計のみでは保証しない。
- iOS 26／27実機の画質、音声同期、性能、ホーム画面起動での回帰は未検証。実機を接続して検証したという結果は含まない。
- Streamsは開発用スイッチのみで有効化できる。本番ビルドには取り込みWorkerと開発用スイッチが含まれないことを確認した。

診断結果: [SDR入力・出力](ios27-results/sdr-validation.json)、[取り込み比較](ios27-results/desktop-ingestion-baseline.json)。この値をiPhoneの性能推定には使用しない。

## 実機不要の追加検証（2026-09-13）

- 待機中の取り込みをキャンセルしても先行処理の終了まで待たされる不具合を修正。Web Locksに直列化と待機中キャンセルを集約した。
- 複数選択の途中で取り込みに失敗すると、保存済みの動画も画面に反映されず処理されない不具合を修正。成功済みの動画をキューへ反映して処理し、失敗を呼び出し元へ返す。
- 開発用の取り込みWorkerが本番配信ファイルに残る問題を修正。本番への混入を検出するスクリプトを追加し、通過を確認した。
- 追加の障害テスト4件: 待機中キャンセル、Workerのmessageerror、Worker無応答のタイムアウト、書き込み中のページ再読み込み後の復旧。タイムアウトの待ち時間はテスト内だけ短縮する。
- 既存のデスクトップWebKitテスト: 42件成功。キュー永続化テストはOPFS書き込み失敗を許容するため、この結果をWebKitのOPFS成功確認には使わない。
- 本番プレビュー検証: 3件成功。Chromiumでブラウザー経由の実オフライン取得と再読み込みを確認する2件、WebKitでCacheStorageの内容を確認する1件。
- 旧オフラインテストのAPIRequestContextによる取得を、実ブラウザーからの取得に変更した。キャッシュされていないURLがオフラインで失敗する負の対照も追加した。
- デスクトップWebKitではキャッシュが存在してもオフライン取得が `TypeError: Load failed` となった。原因・解消は未確認。WebKitのキャッシュ内容検査は通信成功の代用ではなく、Safari／ホーム画面起動での実機検証が残る。

上記の比較計測JSONは先行実行の保存結果であり、追加テスト実行時の再計測値ではない。

## Status

Implementation authorized on 2026-09-13. Streams remain development-only and off by default. No iOS device measurements or color acceptance results are claimed.

## Local checks

```sh
npm test
npm run build
node scripts/check-production-isolation.mjs
npx playwright test --config playwright.ios27.config.ts
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.preview.config.ts
npm run dev
```

Open `/tests/ios27.html` on the development server. Select a synthetic fixture or a local video. This page performs no upload. The input and compressed output appear side by side; the report contains frame counts, timestamp reversals/duplicates, container/decoder/frame color information, and duration. Diagnostic summaries are bounded rather than retaining one record per frame. The output preview is copied into memory: use short clips for the color test, not multi-GB inputs.

- `色・順序・圧縮を検証`: inspect input, transcode with the existing compatible H.264 preset, inspect output.
- `取り込み比較`: alternate baseline/Streams order over five trials each. Reports elapsed time, timer-delay responsiveness proxy, and saved size. Memory is not measurable through a portable Safari API here; do not interpret absent metrics as zero. Hash checks run separately in automated tests.
- `中止`: abort stream ingestion or video processing. The baseline `write(file)` trial only observes cancellation between trials.
- `失敗した取り込みを削除再試行`: retry files recorded in `pending-ingests`. An origin-wide Web Lock prevents recovery from deleting an active stream ingestion in another tab.

Enable the experimental app ingestion path on a development build:

```js
localStorage.setItem('experimental-stream-ingest', '1');
```

Disable it:

```js
localStorage.removeItem('experimental-stream-ingest');
```

Production builds remove this switch and keep the original ingestion path. Web Locks and a successful tiny-stream Worker probe are required before taking the experimental path. Probe failure falls back; failure after real writing begins does not silently restart or duplicate the write.

## iPhone acceptance procedure

1. Serve the development server over trusted HTTPS reachable by the iPhone. The desktop browser test is not a substitute for this step.
2. Test iOS 26 and 27, in Safari and home-screen launch, recording exact OS build and hardware. If only one phone is available, keep before/after measurements for that phone rather than comparing different devices as an OS-only result.
3. Use all synthetic fixtures, then short real camera clips (HLG/PQ, skin tones, saturated colors, portrait, VFR, clap/lip-sync).
4. Verify visible frame numbering, no missing/duplicate frames, orientation, audio alignment, grayscale gradients, white clipping, black detail, and skin/saturated colors. Counts and monotonic timestamps alone do not prove visual ordering or accurate color.
5. The current output remains SDR. Inspect output primaries/transfer/matrix with ffprobe and compare with rendered output. Do not claim HDR preservation or lossless tone mapping.
6. Benchmark several sizes including a large file and multiple selections, with comparable charge, temperature, power mode, and foreground state. Allow cooling between trials. Repeat baseline and experimental trials; record medians and spread.
7. Test cancellation, source read failure, Worker failure, quota failure, cleanup failure/retry, and reload after interruption. Inspect OPFS for remaining bytes and `pending-ingests` receipts.
8. Adopt Streams only when measured gains exceed trial variability without worse total compression time or success rate. Otherwise retain baseline.

## Implementation decisions

- HDR classification uses PQ/HLG, independently of BT.2020 gamut. BT.2020 SDR still passes through gamut conversion; decoded-frame information can also trigger conversion.
- Installed mediabunny already passes container color space into VideoDecoder configuration and has a Safari B-frame ordering workaround. No internal patch, duplicate sorter, or unconditional color override was added.
- Actual HDR/SDR Canvas behavior and metadata consistency still need iOS device validation.
- Stream ingestion and recovery are serialized across tabs using Web Locks. Receipts are stored before writes and retained if cleanup fails. Recovery is explicit; it never scans or removes unrelated inputs.
- Browser automation uses Chromium for real OPFS/transfer tests. The end-to-end encoding test, if supported, uses a software preference override solely in the test because headless Chromium lacks the iPhone hardware encoder.

## Sources

- https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/
- https://developer.apple.com/documentation/safari-release-notes/safari-27-release-notes?language=_5
