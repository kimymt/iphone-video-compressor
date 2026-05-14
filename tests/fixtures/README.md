# tests/fixtures/

Phase 3b / 3c 以降の pipeline 統合テストで使う小さな動画素材。各 1 秒前後、合計 5.6 MB。
iPhone 16 Pro (iOS 26) で撮影した HDR HEVC 動画 (`IMG_3531.MOV` / `IMG_3532.MOV`、各 60fps 1080p BT.2020 HLG) を ffmpeg で加工して生成した。

## ファイル一覧

| ファイル | サイズ | 内容 | 用途 |
|---|---|---|---|
| `portrait-rotation-1s.mov` | 2.8 MB | HEVC HDR 1920×1080 + `rotation=-90` display matrix | rotation 補正テスト + HDR→SDR 同時テスト |
| `landscape-hevc-hdr-1s.mov` | 2.6 MB | HEVC HDR 1920×1080 (BT.2020 HLG) | HDR→SDR トーンマッピングテスト |
| `landscape-1080p-baseline-h264-1s.mp4` | 144 KB | H.264 Constrained Baseline 1920×1080 | H.264 decode 経路テスト + min-h264 系のサニティ |
| `corrupt-truncated.mp4` | 29 KB | 上記の頭 30 KB のみ (moov 欠落) | demux エラー (`DemuxError: 対応していない…`) テスト |

## 生成コマンド

iPhone 録画素材を `~/Downloads/IMG_3531.MOV` (縦撮影 HDR) と `~/Downloads/IMG_3532.MOV` (横撮影 HDR) として用意した上で:

```bash
# 1) portrait-rotation-1s.mov (HEVC HDR + rotation=-90)
#    -c copy で生メタを全て保持。再エンコードすると hevc_videotoolbox が display matrix を
#    moov に書き出さないため、必ず stream copy にすること。
ffmpeg -y -i ~/Downloads/IMG_3531.MOV -t 0.9 -c copy \
  tests/fixtures/portrait-rotation-1s.mov

# 2) landscape-hevc-hdr-1s.mov (HEVC HDR、回転無し)
ffmpeg -y -i ~/Downloads/IMG_3532.MOV -t 0.9 -c copy \
  tests/fixtures/landscape-hevc-hdr-1s.mov

# 3) landscape-1080p-baseline-h264-1s.mp4 (H.264 Constrained Baseline)
#    -pix_fmt yuv420p で 10-bit HDR → 8-bit SDR (色は崩れるが decode 経路の検証目的)
ffmpeg -y -i ~/Downloads/IMG_3532.MOV -t 1 \
  -pix_fmt yuv420p \
  -c:v libx264 -profile:v baseline -b:v 1500k \
  -c:a aac -b:a 96k \
  tests/fixtures/landscape-1080p-baseline-h264-1s.mp4

# 4) corrupt-truncated.mp4 (上記の頭 30 KB のみ、moov 欠落で demux 失敗)
head -c 30000 tests/fixtures/landscape-1080p-baseline-h264-1s.mp4 \
  > tests/fixtures/corrupt-truncated.mp4
```

## 注意

- iPhone 録画素材は git に commit しない (各 8-11 MB と大きすぎる、また個人撮影物のため)。
  fixture ファイルだけを版管理する。
- `-noautorotate` + `-display_rotation` + `hevc_videotoolbox` でも rotation を出力 moov に
  書けなかったため、portrait は `-c copy` 一択。
- ffmpeg は `brew install ffmpeg` で導入。`zscale` / `libplacebo` フィルタは無い (brew の
  ビルドオプション)。tonemap が必要な場合は `colorspace` フィルタを使う。
- H.264 fixture の color は崩れているが、decode 経路 (mediabunny → VideoDecoder) の
  検証目的では問題ない。Phase 3c で iPhone 実機検証を行う際は別途 iPhone で
  H.264 撮影した素材を一時的に追加する想定。
