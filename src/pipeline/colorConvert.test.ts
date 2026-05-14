// Phase 3a: colorConvert.ts のユニットテスト。
// JSDOM で実際の色域変換は検証できないため、API 契約と所有権セマンティクスのみ検証。
// 視覚的な色変換の正しさ (緑かぶりなし) は Phase 3c で HDR fixture 実機検証。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
// VideoColorSpaceInit は WebCodecs DOM 組み込み型
import { convertToBt709, isHdr } from './colorConvert';

// ----- カラースペース定数 -----

// lib.dom.d.ts の VideoColorPrimaries / VideoTransferCharacteristics は
// 古くて 'bt2020' / 'hlg' / 'pq' を含まないため unknown 経由でキャスト。
const BT709 = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
} as unknown as VideoColorSpaceInit;

const BT2020_HLG = {
  primaries: 'bt2020',
  transfer: 'hlg',
  matrix: 'bt2020-ncl',
  fullRange: false,
} as unknown as VideoColorSpaceInit;

const BT2020_PQ = {
  primaries: 'bt2020',
  transfer: 'pq',
  matrix: 'bt2020-ncl',
  fullRange: false,
} as unknown as VideoColorSpaceInit;

// ----- モックヘルパー (rotate.test.ts と同じ pattern) -----

function makeMockCtx(width: number, height: number) {
  return {
    canvas: { width, height },
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

function makeMockFrame(opts: { timestamp?: number; duration?: number | null } = {}) {
  return {
    timestamp: opts.timestamp ?? 1_000_000,
    duration: opts.duration === undefined ? 33_333 : opts.duration,
    close: vi.fn(),
  };
}

let videoFrameCtor: ReturnType<typeof vi.fn>;

beforeEach(() => {
  videoFrameCtor = vi.fn(function (this: object, source: unknown, init: VideoFrameInit) {
    Object.assign(this, {
      _source: source,
      _init: init,
      timestamp: init.timestamp,
      duration: init.duration ?? null,
      close: vi.fn(),
    });
  });
  vi.stubGlobal('VideoFrame', videoFrameCtor);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ----- isHdr -----

describe('isHdr', () => {
  it('BT.2020 HLG は HDR', () => {
    expect(isHdr(BT2020_HLG)).toBe(true);
  });

  it('BT.2020 PQ は HDR', () => {
    expect(isHdr(BT2020_PQ)).toBe(true);
  });

  it('BT.709 は SDR', () => {
    expect(isHdr(BT709)).toBe(false);
  });

  it('primaries 未指定は SDR (デフォルトパススルー)', () => {
    expect(isHdr({})).toBe(false);
  });
});

// ----- convertToBt709 -----

describe('convertToBt709', () => {
  it('SDR 入力 (BT.709) はパススルー、close しない、canvas にも書かない', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);

    const result = convertToBt709(
      frame as unknown as VideoFrame,
      BT709,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(result).toBe(frame as unknown as VideoFrame);
    expect(frame.close).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(videoFrameCtor).not.toHaveBeenCalled();
  });

  it('primaries 未指定もパススルー', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);

    const result = convertToBt709(
      frame as unknown as VideoFrame,
      {},
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(result).toBe(frame as unknown as VideoFrame);
    expect(frame.close).not.toHaveBeenCalled();
  });

  it('HDR 入力 (BT.2020 HLG) は canvas 経由で変換、入力 frame.close, 新 frame を返す', () => {
    const frame = makeMockFrame({ timestamp: 5_000, duration: 33_333 });
    const ctx = makeMockCtx(1920, 1080);

    const result = convertToBt709(
      frame as unknown as VideoFrame,
      BT2020_HLG,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(ctx.drawImage).toHaveBeenCalledWith(frame, 0, 0);
    expect(ctx.restore).toHaveBeenCalledOnce();

    expect(videoFrameCtor).toHaveBeenCalledOnce();
    expect(videoFrameCtor).toHaveBeenCalledWith(
      ctx.canvas,
      expect.objectContaining({ timestamp: 5_000, duration: 33_333 }),
    );

    expect(frame.close).toHaveBeenCalledOnce();
    expect(result).not.toBe(frame as unknown as VideoFrame);
  });

  it('HDR 入力 (BT.2020 PQ) も同じく変換される', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(3840, 2160);

    convertToBt709(
      frame as unknown as VideoFrame,
      BT2020_PQ,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(ctx.drawImage).toHaveBeenCalledWith(frame, 0, 0);
    expect(videoFrameCtor).toHaveBeenCalledOnce();
    expect(frame.close).toHaveBeenCalledOnce();
  });

  it('frame.duration === null のとき新 frame init に duration を含めない', () => {
    const frame = makeMockFrame({ duration: null });
    const ctx = makeMockCtx(1920, 1080);

    convertToBt709(
      frame as unknown as VideoFrame,
      BT2020_HLG,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    const calls = videoFrameCtor.mock.calls;
    expect(calls).toHaveLength(1);
    const init = calls[0]![1] as VideoFrameInit;
    expect(init.timestamp).toBeDefined();
    expect('duration' in init).toBe(false);
  });

  it('save/restore は対になっている', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);
    convertToBt709(
      frame as unknown as VideoFrame,
      BT2020_HLG,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('SDR パススルー時は ctx を 1 度も触らない', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);
    convertToBt709(
      frame as unknown as VideoFrame,
      BT709,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
    expect(ctx.clearRect).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
