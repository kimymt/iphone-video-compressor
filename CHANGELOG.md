# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v1.0.0
[0.9.1]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v0.9.1
[0.9.0]: https://github.com/kimymt/iphone-video-compressor/releases/tag/v0.9.0
