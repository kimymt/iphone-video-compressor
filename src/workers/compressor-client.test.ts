// Phase 3b worker: メインスレッド側ラッパのテスト。
// Web Worker をモック (EventTarget + postMessage spy) して、
// runTranscodeJob の Promise 解決パターンを検証する。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTranscodeJob } from './compressor-client';
import type { WorkerRequest, WorkerResponse } from './messages';
import type { Preset } from '../lib/types';

// ----- MockWorker -----

class MockWorker extends EventTarget implements Worker {
  postMessage = vi.fn<(msg: WorkerRequest) => void>();
  terminate = vi.fn<() => void>();
  onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;

  /** テスト helper: Worker → main の response をエミュレート。 */
  emit(msg: WorkerResponse): void {
    this.dispatchEvent(new MessageEvent('message', { data: msg }));
  }

  /** テスト helper: worker error をエミュレート。 */
  emitError(message: string): void {
    this.dispatchEvent(new ErrorEvent('error', { message }));
  }
}

// ----- 共通フィクスチャ -----

const PRESET: Preset = {
  key: 'standard-hevc',
  label: '標準 (HEVC)',
  description: '',
  codec: 'hevc',
  maxLongEdge: 1080,
  videoBitrate: 3_000_000,
  audioBitrate: 128_000,
};

function makeOpts(overrides?: Partial<Parameters<typeof runTranscodeJob>[1]>) {
  return {
    id: 'job-1',
    inputPath: 'inputs/in.mp4',
    outputPath: 'outputs/out.mp4',
    preset: PRESET,
    ...overrides,
  };
}

let worker: MockWorker;
beforeEach(() => {
  worker = new MockWorker();
});

// ----- happy path -----

describe('runTranscodeJob — happy path', () => {
  it('transcode メッセージを postMessage で送る', async () => {
    const p = runTranscodeJob(worker, makeOpts());
    // postMessage は同期的に呼ばれる
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'transcode',
      id: 'job-1',
      inputPath: 'inputs/in.mp4',
      outputPath: 'outputs/out.mp4',
      preset: PRESET,
    });
    // 終わらせる
    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    await p;
  });

  it('started → onStarted コールバック呼び出し', async () => {
    const onStarted = vi.fn();
    const p = runTranscodeJob(worker, makeOpts({ onStarted }));
    worker.emit({ type: 'started', id: 'job-1' });
    expect(onStarted).toHaveBeenCalledOnce();
    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    await p;
  });

  it('progress → onProgress コールバック呼び出し', async () => {
    const onProgress = vi.fn();
    const p = runTranscodeJob(worker, makeOpts({ onProgress }));
    worker.emit({
      type: 'progress',
      id: 'job-1',
      percent: 50,
      currentSec: 0.5,
      totalSec: 1.0,
      etaSec: 0.5,
    });
    expect(onProgress).toHaveBeenCalledWith(50, 0.5, 1.0, 0.5);
    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    await p;
  });

  it('done で Promise が { kind:done } で resolve、worker.terminate 呼ばれる', async () => {
    const p = runTranscodeJob(worker, makeOpts());
    worker.emit({ type: 'done', id: 'job-1', outputSize: 12345, durationSec: 7.5 });
    const result = await p;
    expect(result).toEqual({ kind: 'done', outputSize: 12345, durationSec: 7.5 });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('failed で Promise が { kind:failed, error } で resolve', async () => {
    const p = runTranscodeJob(worker, makeOpts());
    worker.emit({ type: 'failed', id: 'job-1', error: 'oops' });
    const result = await p;
    expect(result).toEqual({ kind: 'failed', error: 'oops' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('cancelled で Promise が { kind:cancelled } で resolve', async () => {
    const p = runTranscodeJob(worker, makeOpts());
    worker.emit({ type: 'cancelled', id: 'job-1' });
    const result = await p;
    expect(result).toEqual({ kind: 'cancelled' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

// ----- ID マッチング -----

describe('runTranscodeJob — id matching', () => {
  it('違う id のメッセージは無視', async () => {
    const onProgress = vi.fn();
    const onStarted = vi.fn();
    const p = runTranscodeJob(worker, makeOpts({ onStarted, onProgress }));

    // 違う id
    worker.emit({ type: 'started', id: 'other-job' });
    worker.emit({
      type: 'progress',
      id: 'other-job',
      percent: 99,
      currentSec: 9,
      totalSec: 10,
      etaSec: 1,
    });

    expect(onStarted).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();

    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    await p;
  });

  it("id='unknown' (worker fatal) は受理して failed として resolve", async () => {
    const p = runTranscodeJob(worker, makeOpts());
    worker.emit({ type: 'failed', id: 'unknown', error: 'worker uncaught: boom' });
    const result = await p;
    expect(result).toEqual({ kind: 'failed', error: 'worker uncaught: boom' });
  });
});

// ----- cancel/done レース (メイン側) -----

describe('runTranscodeJob — cancel/done race (main side)', () => {
  it('terminal 後の追加メッセージは無視 (terminate も 1 回だけ)', async () => {
    const onProgress = vi.fn();
    const p = runTranscodeJob(worker, makeOpts({ onProgress }));
    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    await p;

    // terminal 後の遅延メッセージ
    worker.emit({
      type: 'progress',
      id: 'job-1',
      percent: 100,
      currentSec: 1,
      totalSec: 1,
      etaSec: 0,
    });
    worker.emit({ type: 'failed', id: 'job-1', error: 'stale' });
    expect(onProgress).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('signal.abort() で cancel メッセージを post (transcode 後)', async () => {
    const controller = new AbortController();
    const p = runTranscodeJob(worker, makeOpts({ signal: controller.signal }));

    // postMessage 履歴は transcode 1 件のみ
    expect(worker.postMessage.mock.calls).toHaveLength(1);
    expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({ type: 'transcode' });

    controller.abort();
    expect(worker.postMessage.mock.calls).toHaveLength(2);
    expect(worker.postMessage.mock.calls[1]![0]).toEqual({ type: 'cancel', id: 'job-1' });

    // worker は cancelled を返す
    worker.emit({ type: 'cancelled', id: 'job-1' });
    const result = await p;
    expect(result).toEqual({ kind: 'cancelled' });
  });

  it('既に aborted な signal で transcode → cancel を即座に post', async () => {
    const controller = new AbortController();
    controller.abort();
    const p = runTranscodeJob(worker, makeOpts({ signal: controller.signal }));

    expect(worker.postMessage.mock.calls).toHaveLength(2);
    expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({ type: 'transcode' });
    expect(worker.postMessage.mock.calls[1]![0]).toEqual({ type: 'cancel', id: 'job-1' });

    worker.emit({ type: 'cancelled', id: 'job-1' });
    await p;
  });

  it('terminal 後の signal.abort は cancel を post しない (terminate 済み worker)', async () => {
    const controller = new AbortController();
    const p = runTranscodeJob(worker, makeOpts({ signal: controller.signal }));

    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    await p;

    // postMessage 履歴は transcode 1 件のみ
    expect(worker.postMessage.mock.calls).toHaveLength(1);

    // 終了後の abort は無視される
    controller.abort();
    expect(worker.postMessage.mock.calls).toHaveLength(1);
  });

  it('progress 中に cancel → cancelled で resolve、後続 done は無視', async () => {
    const onProgress = vi.fn();
    const controller = new AbortController();
    const p = runTranscodeJob(
      worker,
      makeOpts({ onProgress, signal: controller.signal }),
    );

    worker.emit({ type: 'started', id: 'job-1' });
    worker.emit({
      type: 'progress',
      id: 'job-1',
      percent: 30,
      currentSec: 0.3,
      totalSec: 1,
      etaSec: null,
    });

    controller.abort();
    // worker から cancelled が返る
    worker.emit({ type: 'cancelled', id: 'job-1' });
    const result = await p;
    expect(result).toEqual({ kind: 'cancelled' });

    // race で後から届いた done は無視される
    worker.emit({ type: 'done', id: 'job-1', outputSize: 1, durationSec: 1 });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});

// ----- worker error -----

describe('runTranscodeJob — worker error', () => {
  it('Worker の error イベントで failed として resolve', async () => {
    const p = runTranscodeJob(worker, makeOpts());
    worker.emitError('script load failed');
    const result = await p;
    expect(result).toEqual({ kind: 'failed', error: 'script load failed' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('Worker error 後の追加メッセージは無視', async () => {
    const onProgress = vi.fn();
    const p = runTranscodeJob(worker, makeOpts({ onProgress }));
    worker.emitError('boom');
    await p;
    worker.emit({
      type: 'progress',
      id: 'job-1',
      percent: 50,
      currentSec: 0.5,
      totalSec: 1,
      etaSec: null,
    });
    expect(onProgress).not.toHaveBeenCalled();
  });
});
