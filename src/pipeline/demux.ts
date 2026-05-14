// Phase 3a: 入力動画ファイルを mediabunny で demux し、transcode が必要とする
// メタ情報 + track ハンドルを返す。track からの実 packet 読み取りは Phase 3b の
// transcode.ts で行う。

import {
  Input,
  BlobSource,
  ALL_FORMATS,
  type InputVideoTrack,
  type InputAudioTrack,
  type Rotation,
} from 'mediabunny';
// VideoColorSpaceInit は WebCodecs の DOM 組み込み型 (lib.dom.d.ts) を直接参照する。
// mediabunny v1.45 では型再 export されていないため。
import { isBt2020Primaries } from '../lib/color-space';

// pipeline 内部から参照しやすい別名
export type VideoTrack = InputVideoTrack;
export type AudioTrack = InputAudioTrack;

export type DemuxResult = {
  /** Input インスタンス。終了時に `input.dispose()` を呼ぶこと (呼び出し側の責任)。 */
  readonly input: Input;
  /** プライマリ動画トラック。 */
  readonly videoTrack: VideoTrack;
  /** プライマリ音声トラック。無音録画動画では null。 */
  readonly audioTrack: AudioTrack | null;
  /** 動画 + 音声で最長の end timestamp (秒)。 */
  readonly durationSec: number;
  /**
   * 動画トラックの回転角 (0/90/180/270)。
   * WebCodecs の VideoDecoder は回転を自動適用しないため、transcode 側で
   * `rotate.applyRotation()` を呼ぶ必要がある (CLAUDE.md ハマりどころ 1)。
   */
  readonly rotation: Rotation;
  /** coded width (回転前)。 */
  readonly width: number;
  /** coded height (回転前)。 */
  readonly height: number;
  /**
   * 動画トラックの色空間。`primaries === 'bt2020'` のとき HDR、
   * colorConvert で BT.709 へトーンマッピング必要 (CLAUDE.md ハマりどころ 10)。
   */
  readonly colorSpace: VideoColorSpaceInit;
  /**
   * 平均フレームレート (VFR の場合の概算)。
   * VideoEncoderConfig.framerate と HEVC level 算出 (buildHevcCodecString) に渡す。
   */
  readonly fps: number;
};

/** demux 段階で握り潰した内部エラーをラップして上位に伝える専用エラー。 */
export class DemuxError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DemuxError';
  }
}

/**
 * File / Blob から DemuxResult を作る。失敗時は `DemuxError` を投げ、`Input` を破棄する。
 *
 * エラー条件:
 * - canRead() === false (未対応コンテナ、ファイル破損)
 * - getPrimaryVideoTrack() === null (動画トラック無し)
 * - その他 mediabunny 内部例外 (DemuxError でラップ)
 *
 * `fps` は `computePacketStats(100)` で先頭 100 パケットから平均 fps を概算する。
 * VFR の場合は実際のフレーム間隔が不揃いだが、`VideoEncoderConfig.framerate` や
 * HEVC level 文字列の判定には平均値で十分。
 */
export async function demuxInput(file: Blob): Promise<DemuxResult> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  try {
    if (!(await input.canRead())) {
      throw new DemuxError('対応していないコンテナ形式、もしくはファイルが壊れています');
    }

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new DemuxError('動画トラックが見つかりません');
    }

    const audioTrack = await input.getPrimaryAudioTrack();

    const [durationSec, rotation, width, height, colorSpace, packetStats] = await Promise.all([
      input.computeDuration(),
      videoTrack.getRotation(),
      videoTrack.getCodedWidth(),
      videoTrack.getCodedHeight(),
      videoTrack.getColorSpace(),
      videoTrack.computePacketStats(100),
    ]);

    return {
      input,
      videoTrack,
      audioTrack,
      durationSec,
      rotation,
      width,
      height,
      colorSpace,
      fps: packetStats.averagePacketRate,
    };
  } catch (e) {
    // 失敗時は Input を破棄してリーク防止
    try {
      input.dispose();
    } catch {
      /* dispose 中の二次例外は握り潰す */
    }
    if (e instanceof DemuxError) throw e;
    throw new DemuxError(
      'demux 中に内部エラーが発生しました: ' + (e instanceof Error ? e.message : String(e)),
      e,
    );
  }
}

/**
 * 入力動画が HDR (BT.2020 PQ or HLG) かを判定する。
 * `colorConvert.convertToBt709` のパススルー条件に使う。
 *
 * iPhone 12 以降の HDR 録画は `primaries === 'bt2020'`、transfer は 'pq' or 'hlg'。
 * primaries だけで判定すれば十分 (CLAUDE.md ハマりどころ 10)。
 *
 * 実装は `src/lib/color-space.ts` に委譲 (lib.dom.d.ts の VideoColorPrimaries が
 * 'bt2020' を含まないため、文字列比較に下げて評価する)。
 */
export function isHdrColorSpace(colorSpace: VideoColorSpaceInit): boolean {
  return isBt2020Primaries(colorSpace);
}

/**
 * 動画の (回転後の) 表示解像度の長辺を返す。
 * - rotation が 90/270 のときは width/height が入れ替わる
 * - rotation が 0/180 のときはそのまま max(width, height)
 *
 * preset の maxLongEdge との比較や HEVC level 算出で使用。
 */
export function effectiveLongEdge(meta: Pick<DemuxResult, 'width' | 'height' | 'rotation'>): number {
  // 90/270 度回転は表示時に width/height が入れ替わるが、長辺の値自体は
  // max(width, height) で変わらない。なので回転に関わらず max を取れば良い。
  return Math.max(meta.width, meta.height);
}
