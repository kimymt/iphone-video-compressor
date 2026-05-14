// Phase 3a: rotate.ts のユニットテスト。
// JSDOM には VideoFrame / OffscreenCanvas2D の本物は無いため、
// 必要最低限のモックを差し込んで API 契約と所有権セマンティクスを検証する。
//
// 視覚的な回転の正しさは Phase 3c で実機検証 (回転メタデータ付き動画の出力確認)。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyRotation } from './rotate';

// ----- モックヘルパー -----

interface MockCanvas {
  width: number;
  height: number;
}

interface MockCtx {
  canvas: MockCanvas;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

function makeMockCtx(width: number, height: number): MockCtx {
  return {
    canvas: { width, height },
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  };
}

interface MockVideoFrame {
  timestamp: number;
  duration: number | null;
  codedWidth: number;
  codedHeight: number;
  close: ReturnType<typeof vi.fn>;
}

function makeMockFrame(opts: {
  timestamp?: number;
  duration?: number | null;
  codedWidth?: number;
  codedHeight?: number;
} = {}): MockVideoFrame {
  return {
    timestamp: opts.timestamp ?? 1_000_000,
    duration: opts.duration === undefined ? 33_333 : opts.duration,
    codedWidth: opts.codedWidth ?? 1920,
    codedHeight: opts.codedHeight ?? 1080,
    close: vi.fn(),
  };
}

// VideoFrame コンストラクタのモック。new された source と init を記録し、
// 元の frame と同じ shape の "別オブジェクト" を返す。
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

// ----- テスト本体 -----

describe('applyRotation', () => {
  it('rotation=0 は入力 frame をパススルー、close しない、canvas にも書かない', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);

    const result = applyRotation(
      frame as unknown as VideoFrame,
      0,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(result).toBe(frame as unknown as VideoFrame);
    expect(frame.close).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.save).not.toHaveBeenCalled();
    expect(videoFrameCtor).not.toHaveBeenCalled();
  });

  it('rotation=90 は translate(width,0) + rotate(π/2)、入力 frame.close, 新 frame を返す', () => {
    const frame = makeMockFrame({ timestamp: 5_000, duration: 33_333 });
    // 入力 1920×1080、回転後 canvas は 1080×1920
    const ctx = makeMockCtx(1080, 1920);

    const result = applyRotation(
      frame as unknown as VideoFrame,
      90,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    expect(ctx.translate).toHaveBeenCalledWith(1080, 0);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
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

  it('rotation=180 は translate(w,h) + rotate(π)', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);

    applyRotation(
      frame as unknown as VideoFrame,
      180,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(ctx.translate).toHaveBeenCalledWith(1920, 1080);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
    expect(ctx.drawImage).toHaveBeenCalledWith(frame, 0, 0);
    expect(frame.close).toHaveBeenCalledOnce();
  });

  it('rotation=270 は translate(0,h) + rotate(-π/2)', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1080, 1920);

    applyRotation(
      frame as unknown as VideoFrame,
      270,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(ctx.translate).toHaveBeenCalledWith(0, 1920);
    expect(ctx.rotate).toHaveBeenCalledWith(-Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(frame, 0, 0);
    expect(frame.close).toHaveBeenCalledOnce();
  });

  it('save/restore は対になっている', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1080, 1920);
    applyRotation(
      frame as unknown as VideoFrame,
      90,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('frame.duration === null のとき新 frame の init に duration を含めない', () => {
    const frame = makeMockFrame({ duration: null });
    const ctx = makeMockCtx(1080, 1920);

    applyRotation(
      frame as unknown as VideoFrame,
      90,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );

    const calls = videoFrameCtor.mock.calls;
    expect(calls).toHaveLength(1);
    const init = calls[0]![1] as VideoFrameInit;
    expect(init.timestamp).toBeDefined();
    expect('duration' in init).toBe(false);
  });

  it('rotation=0 の場合は ctx を 1 度も触らない (canvas 操作ゼロを保証)', () => {
    const frame = makeMockFrame();
    const ctx = makeMockCtx(1920, 1080);
    applyRotation(
      frame as unknown as VideoFrame,
      0,
      ctx as unknown as OffscreenCanvasRenderingContext2D,
    );
    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.restore).not.toHaveBeenCalled();
    expect(ctx.clearRect).not.toHaveBeenCalled();
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.rotate).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
