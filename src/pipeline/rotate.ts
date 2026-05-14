// Phase 3a: iPhone で撮影された動画は rotation メタデータ (0/90/180/270) を持つ。
// WebCodecs の VideoDecoder は rotation を自動適用しないため、decoder の出力 VideoFrame を
// Canvas に再描画して正しい向きに揃える必要がある (CLAUDE.md ハマりどころ 1)。
//
// このモジュールは applyRotation 1 関数のみ。所有権セマンティクスは厳密。

/**
 * VideoFrame を rotation 角度で正しい向きに描画して新しい VideoFrame を返す。
 *
 * 所有権 / リソース管理:
 * - rotation === 0 のとき: 入力 frame をそのまま返し、close しない (呼び出し側責任)
 * - それ以外: ctx の canvas に描画 → 新 VideoFrame を生成 → 入力 frame.close() → 新しい frame を返す
 *
 * 呼び出し側のイディオム (リーク無し):
 * ```ts
 * const out = applyRotation(in, rot, ctx);
 * await encoder.encode(out, opts);
 * out.close();
 * ```
 *
 * 呼び出し側の前提条件:
 * - `ctx.canvas` の width/height が rotation 後の最終解像度に合わせて設定済みであること
 *   - rotation 0:        canvas = (frame.codedWidth,  frame.codedHeight)
 *   - rotation 90 / 270: canvas = (frame.codedHeight, frame.codedWidth)   ← w/h スワップ
 *   - rotation 180:      canvas = (frame.codedWidth,  frame.codedHeight)
 * - 同じ ctx を transcode() スコープで使い回すこと (毎フレームの canvas 再生成を避ける)
 *
 * 角度の解釈は時計回り (clockwise) で、mediabunny の `getRotation()` 戻り値の仕様と一致。
 */
export function applyRotation(
  frame: VideoFrame,
  rotation: 0 | 90 | 180 | 270,
  ctx: OffscreenCanvasRenderingContext2D,
): VideoFrame {
  if (rotation === 0) {
    // パススルー: 呼び出し側が close する
    return frame;
  }

  const canvas = ctx.canvas;
  ctx.save();
  // 前フレームの残骸を消す (背景透過対策、特に 90/270 度で短辺方向に余白が出る場合の保険)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  switch (rotation) {
    case 90:
      // 時計回り 90°: 原点を右上に移し、π/2 回転して描画開始点を (0, 0) にする
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 180:
      // 180°: 原点を右下に移し、π 回転
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case 270:
      // 時計回り 270° = 反時計回り 90°: 原点を左下に移し、-π/2 回転
      ctx.translate(0, canvas.height);
      ctx.rotate(-Math.PI / 2);
      break;
  }

  // 元のフレーム座標系で (0, 0) から描画。canvas 側で回転変換済みなので
  // 描画結果は正しい向きになる。サイズは canvas 側のサイズに従う。
  ctx.drawImage(frame, 0, 0);
  ctx.restore();

  // 新 VideoFrame の init。duration が null のときは渡さない (null は VideoFrameInit で許容されない)
  const init: VideoFrameInit = { timestamp: frame.timestamp };
  if (frame.duration !== null) {
    init.duration = frame.duration;
  }
  const rotated = new VideoFrame(canvas, init);
  frame.close();
  return rotated;
}
