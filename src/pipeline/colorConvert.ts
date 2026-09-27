import { needsSdrConversion, isHdrTransfer } from '../lib/color-space';

/**
 * Convert HDR or wide-gamut frames through an sRGB Canvas. This preserves the
 * existing SDR output path; exact tone mapping is browser-dependent and must
 * be validated on iOS. Container and decoded-frame metadata both participate.
 * The input frame is consumed only when conversion is required, including on
 * conversion failure. The caller owns the returned frame.
 */
export function convertToBt709(
  frame: VideoFrame,
  inputColorSpace: VideoColorSpaceInit,
  ctx: OffscreenCanvasRenderingContext2D,
): VideoFrame {
  if (!needsSdrConversion(inputColorSpace) && !needsSdrConversion(frame.colorSpace)) {
    // BT.709 / SDR / primaries 未指定はそのままパススルー
    return frame;
  }

  try {
    const canvas = ctx.canvas;
    ctx.save();
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, 0, 0);
    } finally { ctx.restore(); }
    const init: VideoFrameInit = { timestamp: frame.timestamp };
    if (frame.duration !== null) init.duration = frame.duration;
    return new VideoFrame(canvas, init);
  } finally { frame.close(); }
}

/**
 * inputColorSpace が HDR (BT.2020 PQ or HLG) か判定する小さなユーティリティ。
 * demux.ts の isHdrColorSpace と同じ実装 (両方 src/lib/color-space.ts に委譲)。
 * pipeline/colorConvert.ts の利用側 (transcode.ts) が demux/colorConvert を
 * 両方 import せずに済むように再公開する。
 */
export function isHdr(colorSpace: VideoColorSpaceInit): boolean {
  return isHdrTransfer(colorSpace);
}
