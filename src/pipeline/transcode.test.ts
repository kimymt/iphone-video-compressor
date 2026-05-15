// Phase 3b: transcode.ts のユニットテスト。
// 純粋ヘルパー (computeOutputDimensions, makeVideoEncoderConfig) と
// 主要エラーパス (signal aborted、demux 失敗) を検証する。
// 実 encoder/decoder を伴う end-to-end は spike/transcode-check で手動検証 +
// Phase 4 で Worker 経由の E2E (Playwright + fixtures) を追加する。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeOutputDimensions,
  makeVideoEncoderConfig,
  shouldForceKeyframe,
  KEYFRAME_INTERVAL_US,
  TranscodeError,
  TranscodeCancelledError,
  transcode,
} from './transcode';
import type { Preset } from '../lib/types';
import { DemuxError } from './demux';

// ---- mediabunny / mux / demux のモック ----

const mocks = vi.hoisted(() => ({
  demuxInput: vi.fn(),
  createMuxer: vi.fn(),
  createOpfsStreamTarget: vi.fn(),
}));

vi.mock('./demux', async () => {
  const actual = await vi.importActual<typeof import('./demux')>('./demux');
  return {
    ...actual,
    demuxInput: mocks.demuxInput,
  };
});

vi.mock('./mux', async () => {
  const actual = await vi.importActual<typeof import('./mux')>('./mux');
  return {
    ...actual,
    createMuxer: mocks.createMuxer,
    createOpfsStreamTarget: mocks.createOpfsStreamTarget,
  };
});

// ---- プリセット定数 ----

const HEVC_STANDARD: Preset = {
  key: 'standard-hevc',
  label: '標準 (HEVC)',
  description: '',
  codec: 'hevc',
  maxLongEdge: 1080,
  videoBitrate: 3_000_000,
  audioBitrate: 128_000,
};

const HEVC_BEST: Preset = {
  ...HEVC_STANDARD,
  key: 'best-hevc',
  maxLongEdge: null,
  videoBitrate: 12_000_000,
};

const H264_HIGH: Preset = {
  ...HEVC_STANDARD,
  key: 'compat-h264',
  codec: 'h264-high',
};

const H264_BASELINE: Preset = {
  ...HEVC_STANDARD,
  key: 'min-h264',
  codec: 'h264-baseline',
  maxLongEdge: 480,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- computeOutputDimensions ----

describe('computeOutputDimensions', () => {
  it('rotation=0, 縮小不要 (1920×1080, maxLongEdge=null)', () => {
    const r = computeOutputDimensions({ width: 1920, height: 1080, rotation: 0 }, HEVC_BEST);
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('rotation=90 で w/h スワップ (1920×1080 → 1080×1920)', () => {
    const r = computeOutputDimensions({ width: 1920, height: 1080, rotation: 90 }, HEVC_BEST);
    expect(r).toEqual({ width: 1080, height: 1920 });
  });

  it('rotation=270 でも w/h スワップ', () => {
    const r = computeOutputDimensions({ width: 1920, height: 1080, rotation: 270 }, HEVC_BEST);
    expect(r).toEqual({ width: 1080, height: 1920 });
  });

  it('rotation=180 では w/h スワップ無し', () => {
    const r = computeOutputDimensions({ width: 1920, height: 1080, rotation: 180 }, HEVC_BEST);
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  it('maxLongEdge=1080 で 3840×2160 が 1080×608 にスケールダウン', () => {
    const r = computeOutputDimensions({ width: 3840, height: 2160, rotation: 0 }, HEVC_STANDARD);
    expect(r.width).toBe(1080);
    expect(r.height).toBe(608);
  });

  it('maxLongEdge=480 で 1920×1080 が 480×270 にスケールダウン', () => {
    const r = computeOutputDimensions({ width: 1920, height: 1080, rotation: 0 }, H264_BASELINE);
    expect(r.width).toBe(480);
    expect(r.height).toBe(270);
  });

  it('回転 90 + リサイズ (1920×1080 rotation=90 → 1080×1920 → maxLongEdge=1080 で 608×1080)', () => {
    const r = computeOutputDimensions({ width: 1920, height: 1080, rotation: 90 }, HEVC_STANDARD);
    // disp 1080×1920、長辺 1920 > 1080、scale = 1080/1920 = 0.5625
    // 1080 * 0.5625 = 607.5 → 608, 1920 * 0.5625 = 1080
    expect(r.width).toBe(608);
    expect(r.height).toBe(1080);
  });

  it('出力 dimensions は常に偶数 (yuv420p chroma subsampling)', () => {
    // 1923×1080 long=1923 ≤ 1080? いいえ → scale=1080/1923=0.5616...
    // 1923 * 0.5616 = 1080 (target), 1080 * 0.5616 = 606.5 → 606
    const r = computeOutputDimensions({ width: 1923, height: 1080, rotation: 0 }, HEVC_STANDARD);
    expect(r.width % 2).toBe(0);
    expect(r.height % 2).toBe(0);
  });

  it('オリジナル維持時 (maxLongEdge=null) で奇数 dims でも偶数化', () => {
    const r = computeOutputDimensions({ width: 1921, height: 1081, rotation: 0 }, HEVC_BEST);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
  });

  it('長辺がちょうど maxLongEdge と等しい時はスケールしない', () => {
    const r = computeOutputDimensions({ width: 1080, height: 720, rotation: 0 }, HEVC_STANDARD);
    // longEdge=1080 = maxLongEdge=1080 → no scale
    expect(r).toEqual({ width: 1080, height: 720 });
  });
});

// ---- shouldForceKeyframe ----

describe('shouldForceKeyframe (V2.x: ハマりどころ 33)', () => {
  it('最初のフレーム (index=0) は IDR (lastKeyframeUs の値に関係なく)', () => {
    expect(shouldForceKeyframe(0, 0, Number.NEGATIVE_INFINITY)).toBe(true);
    expect(shouldForceKeyframe(0, 0, 0)).toBe(true);
    expect(shouldForceKeyframe(0, 1_000_000, 999_999)).toBe(true);
  });

  it('2 秒未満の差分: 非 IDR', () => {
    // 30 fps、frame 1 = 33333us、lastKeyframe=0
    expect(shouldForceKeyframe(1, 33_333, 0)).toBe(false);
    // frame 30 = 1_000_000us = 1 秒
    expect(shouldForceKeyframe(30, 1_000_000, 0)).toBe(false);
    // ちょうど 1_999_999us (2 秒未満)
    expect(shouldForceKeyframe(60, 1_999_999, 0)).toBe(false);
  });

  it('2 秒ちょうど: IDR', () => {
    expect(shouldForceKeyframe(60, 2_000_000, 0)).toBe(true);
  });

  it('2 秒超過: IDR', () => {
    expect(shouldForceKeyframe(75, 2_500_000, 0)).toBe(true);
  });

  it('最後の IDR が直近にあれば、絶対 timestamp が大きくても非 IDR', () => {
    // 30 秒目で IDR を打ったあと、31 秒目はまだ IDR じゃない
    expect(shouldForceKeyframe(930, 31_000_000, 30_000_000)).toBe(false);
    // 32 秒で IDR
    expect(shouldForceKeyframe(960, 32_000_000, 30_000_000)).toBe(true);
  });

  it('intervalUs を override できる (1 秒間隔指定)', () => {
    // index !== 0 + 1 秒未満 → false
    expect(shouldForceKeyframe(15, 500_000, 0, 1_000_000)).toBe(false);
    // 1 秒ちょうど → true
    expect(shouldForceKeyframe(30, 1_000_000, 0, 1_000_000)).toBe(true);
  });

  it('KEYFRAME_INTERVAL_US は 2 秒 (2_000_000 us)', () => {
    expect(KEYFRAME_INTERVAL_US).toBe(2_000_000);
  });

  it('実シナリオ: 30 fps 5 秒動画で IDR は 3 つ (frame 0 + 60 + 120)', () => {
    // 30 fps、150 フレーム (5 秒) を生成
    // 期待: frame 0, 60, 120 が IDR、他は P
    let lastKeyframeUs = Number.NEGATIVE_INFINITY;
    const keyframeIndices: number[] = [];
    for (let i = 0; i < 150; i++) {
      const tsUs = Math.round((i * 1_000_000) / 30);
      const force = shouldForceKeyframe(i, tsUs, lastKeyframeUs);
      if (force) {
        keyframeIndices.push(i);
        lastKeyframeUs = tsUs;
      }
    }
    expect(keyframeIndices).toEqual([0, 60, 120]);
  });
});

// ---- makeVideoEncoderConfig ----

describe('makeVideoEncoderConfig', () => {
  it('HEVC standard: hvc1.1.6.L93 (720p 以下) + bitrate + colorSpace=bt709', () => {
    const cfg = makeVideoEncoderConfig(HEVC_STANDARD, { width: 1080, height: 608 }, 30);
    expect(cfg.codec).toBe('hvc1.1.6.L93.B0'); // longEdge 1080 ≤ 1280
    expect(cfg.width).toBe(1080);
    expect(cfg.height).toBe(608);
    expect(cfg.bitrate).toBe(3_000_000);
    expect(cfg.framerate).toBe(30);
    expect(cfg.hardwareAcceleration).toBe('prefer-hardware');
    expect(cfg.latencyMode).toBe('quality');
    expect(cfg.bitrateMode).toBe('variable');
    // colorSpace は TS 型に厳格な lib.dom 一致が無いが、実装で BT.709 を明示
    expect((cfg as { colorSpace?: unknown }).colorSpace).toEqual({
      primaries: 'bt709',
      transfer: 'bt709',
      matrix: 'bt709',
    });
  });

  it('HEVC best (4K): hvc1.1.6.L153 (4K30)', () => {
    const cfg = makeVideoEncoderConfig(HEVC_BEST, { width: 3840, height: 2160 }, 30);
    expect(cfg.codec).toBe('hvc1.1.6.L153.B0');
    expect(cfg.bitrate).toBe(12_000_000);
  });

  it('HEVC best (4K60): hvc1.1.6.L156', () => {
    const cfg = makeVideoEncoderConfig(HEVC_BEST, { width: 3840, height: 2160 }, 60);
    expect(cfg.codec).toBe('hvc1.1.6.L156.B0');
    expect(cfg.framerate).toBe(60);
  });

  it('H.264 High: avc1.640028 (Level 4.0 固定)', () => {
    const cfg = makeVideoEncoderConfig(H264_HIGH, { width: 1080, height: 608 }, 30);
    expect(cfg.codec).toBe('avc1.640028');
  });

  it('H.264 Baseline: avc1.42E01F (Level 3.1 固定)', () => {
    const cfg = makeVideoEncoderConfig(H264_BASELINE, { width: 480, height: 270 }, 30);
    expect(cfg.codec).toBe('avc1.42E01F');
  });
});

// ---- Error クラス ----

describe('TranscodeError / TranscodeCancelledError', () => {
  it('TranscodeError は cause を保持', () => {
    const inner = new Error('inner');
    const e = new TranscodeError('outer', inner);
    expect(e.message).toBe('outer');
    expect(e.cause).toBe(inner);
    expect(e.name).toBe('TranscodeError');
  });

  it('TranscodeCancelledError は TranscodeError を継承', () => {
    const e = new TranscodeCancelledError();
    expect(e).toBeInstanceOf(TranscodeError);
    expect(e.name).toBe('TranscodeCancelledError');
  });
});

// ---- transcode() 主要エラーパス ----

describe('transcode() error paths', () => {
  const inputBlob = new Blob(['fake mp4'], { type: 'video/mp4' });
  const mockWritable = {} as FileSystemWritableFileStream;

  it('signal が既に aborted なら即座に TranscodeCancelledError', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transcode(inputBlob, mockWritable, {
        preset: HEVC_STANDARD,
        onProgress: vi.fn(),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(TranscodeCancelledError);
    // demux すら呼ばない (早期 return)
    expect(mocks.demuxInput).not.toHaveBeenCalled();
  });

  it('demux 失敗時は TranscodeError でラップしないで元の DemuxError をそのまま投げる', async () => {
    mocks.demuxInput.mockRejectedValueOnce(new DemuxError('壊れたファイル'));
    await expect(
      transcode(inputBlob, mockWritable, {
        preset: HEVC_STANDARD,
        onProgress: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/壊れたファイル/);
  });

  it('demux 失敗時に muxer は作られていないので cancel は呼ばれない', async () => {
    mocks.demuxInput.mockRejectedValueOnce(new DemuxError('test'));
    await expect(
      transcode(inputBlob, mockWritable, {
        preset: HEVC_STANDARD,
        onProgress: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
    expect(mocks.createMuxer).not.toHaveBeenCalled();
  });
});
