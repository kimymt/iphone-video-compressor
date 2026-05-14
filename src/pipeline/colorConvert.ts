// Phase 3a: iPhone 12 以降は HDR 録画がデフォルト (BT.2020 PQ もしくは HLG)。
// HDR 動画をそのまま SDR (BT.709) として encode すると緑かぶり / 露出破綻になるため、
// Canvas の暗黙的な色域変換を使って SDR sRGB に焼き直す (CLAUDE.md ハマりどころ 10)。
//
// このモジュールは convertToBt709 1 関数のみ。所有権セマンティクスは rotate.ts と同等。

// VideoColorSpaceInit は WebCodecs の DOM 組み込み型 (lib.dom.d.ts) を直接参照する。
import { isBt2020Primaries } from '../lib/color-space';

/**
 * 入力 VideoFrame の colorSpace が BT.2020 のときに BT.709 sRGB へ変換する。
 *
 * 仕組み:
 * - 2D Canvas (colorSpace: 'srgb') に drawImage すると、ブラウザは
 *   ソース VideoFrame の colorSpace から sRGB への変換を暗黙的に行う。
 *   HDR (PQ/HLG transfer) → SDR (sRGB transfer) のトーンマッピングも適用される。
 * - 結果として canvas には SDR sRGB の RGBA が描かれる。
 * - new VideoFrame(canvas) でその時点のピクセルを取り込んだ新 frame を生成。
 *
 * 所有権 / リソース管理:
 * - inputColorSpace.primaries !== 'bt2020' のとき: 入力 frame をパススルー、close しない
 * - それ以外: 新 frame を作って入力 frame.close()、新 frame を返す
 *
 * 呼び出し側のイディオム (リーク無し):
 * ```ts
 * const out = convertToBt709(in, demuxResult.colorSpace, ctx);
 * useFrame(out);
 * out.close();
 * ```
 *
 * 呼び出し側の前提条件:
 * - `ctx.canvas` の width/height が入力 frame の codedWidth/codedHeight に合わせて設定済み
 * - ctx は `OffscreenCanvas.getContext('2d', { colorSpace: 'srgb' })` で取得 (sRGB がデフォルトだが明示推奨)
 * - 同じ ctx を transcode() スコープで使い回すこと
 *
 * 注意:
 * - 出力 frame の colorSpace タグは canvas の colorSpace ('srgb') から決まる。
 *   その後 VideoEncoder へ渡す際は `VideoEncoderConfig.colorSpace = { primaries: 'bt709', ... }`
 *   を明示することで出力動画の色空間を正しく BT.709 に固定する (CLAUDE.md ハマりどころ 23)。
 */
export function convertToBt709(
  frame: VideoFrame,
  inputColorSpace: VideoColorSpaceInit,
  ctx: OffscreenCanvasRenderingContext2D,
): VideoFrame {
  if (!isBt2020Primaries(inputColorSpace)) {
    // BT.709 / SDR / primaries 未指定はそのままパススルー
    return frame;
  }

  const canvas = ctx.canvas;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // drawImage が暗黙的に BT.2020 PQ/HLG → sRGB のトーンマッピングを行う
  ctx.drawImage(frame, 0, 0);
  ctx.restore();

  const init: VideoFrameInit = { timestamp: frame.timestamp };
  if (frame.duration !== null) {
    init.duration = frame.duration;
  }
  const converted = new VideoFrame(canvas, init);
  frame.close();
  return converted;
}

/**
 * inputColorSpace が HDR (BT.2020 PQ or HLG) か判定する小さなユーティリティ。
 * demux.ts の isHdrColorSpace と同じ実装 (両方 src/lib/color-space.ts に委譲)。
 * pipeline/colorConvert.ts の利用側 (transcode.ts) が demux/colorConvert を
 * 両方 import せずに済むように再公開する。
 */
export function isHdr(colorSpace: VideoColorSpaceInit): boolean {
  return isBt2020Primaries(colorSpace);
}
