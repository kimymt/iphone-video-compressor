// Phase 3b worker: JobRunner のユニットテスト。
// 依存 (readInput / openOutput / runTranscode / post) を全て mock した env で
// メッセージプロトコルと cancel/done レース対策を検証する。

import { describe, it, expect, vi } from 'vitest';
import { JobRunner, type RunnerEnv } from './compressor-runner';
import { TranscodeCancelledError, TranscodeError } from '../pipeline/transcode';
import type { WorkerResponse } from './messages';
import type { Preset } from '../lib/types';

// ----- 共通フィクスチャ -----

const PRESET_STANDARD: Preset = {
  key: 'standard-hevc',
  label: '標準 (HEVC)',
  description: '',
  codec: 'hevc',
  maxLongEdge: 1080,
  videoBitrate: 3_000_000,
  audioBitrate: 128_000,
};

function makeEnv(): {
  env: RunnerEnv;
  posted: WorkerResponse[];
  // tests can manipulate these to control mock behavior
  setTranscodeBehavior: (
    fn: (input: File, output: FileSystemWritableFileStream, opts: import('../pipeline/transcode').TranscodeOptions) => Promise<import('../pipeline/transcode').TranscodeResult>,
  ) => void;
} {
  const posted: WorkerResponse[] = [];
  let transcodeFn: RunnerEnv['runTranscode'] = async () => ({ outputSize: 1234, durationSec: 1.0 });
  const env: RunnerEnv = {
    post: (msg) => {
      posted.push(msg);
    },
    readInput: vi.fn().mockResolvedValue(new File([new Uint8Array(10)], 'in.mp4')),
    openOutput: vi
      .fn()
      .mockResolvedValue({} as FileSystemWritableFileStream),
    runTranscode: (i, o, opts) => transcodeFn(i, o, opts),
  };
  return {
    env,
    posted,
    setTranscodeBehavior: (fn) => {
      transcodeFn = fn;
    },
  };
}

function transcodeMsg(id = 'job-1') {
  return {
    type: 'transcode' as const,
    id,
    inputPath: 'inputs/in.mp4',
    outputPath: 'outputs/out.mp4',
    preset: PRESET_STANDARD,
  };
}

function cancelMsg(id = 'job-1') {
  return { type: 'cancel' as const, id };
}

// ----- テスト -----

describe('JobRunner — happy path', () => {
  it('transcode 受信で started を即 post (cold-start UX)', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    // transcode が長く走るのをシミュレート (resolve 遅延)
    let resolveTranscode!: () => void;
    setTranscodeBehavior(
      () =>
        new Promise((resolve) => {
          resolveTranscode = () =>
            resolve({ outputSize: 100, durationSec: 1 });
        }),
    );
    const runner = new JobRunner(env);
    const p = runner.handle(transcodeMsg());

    // started は readInput / openOutput await の前に post されているはず。
    // microtask キューを十分にフラッシュして transcode の Promise 生成まで進める。
    await new Promise((r) => setTimeout(r, 0));
    expect(posted.find((m) => m.type === 'started')).toEqual({ type: 'started', id: 'job-1' });

    resolveTranscode();
    await p;
    expect(posted[posted.length - 1]).toEqual({
      type: 'done',
      id: 'job-1',
      outputSize: 100,
      durationSec: 1,
    });
  });

  it('正常完了で started → done の順', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async () => ({ outputSize: 5000, durationSec: 2.5 }));
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg('abc'));

    expect(posted.map((m) => m.type)).toEqual(['started', 'done']);
    expect(posted[1]).toEqual({
      type: 'done',
      id: 'abc',
      outputSize: 5000,
      durationSec: 2.5,
    });
  });

  it('onProgress callback で progress メッセージを post', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async (_i, _o, opts) => {
      opts.onProgress(25, 0.25, 1.0, null);
      opts.onProgress(50, 0.5, 1.0, 0.5);
      opts.onProgress(100, 1.0, 1.0, 0);
      return { outputSize: 100, durationSec: 1 };
    });
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg());

    const progresses = posted.filter((m) => m.type === 'progress');
    expect(progresses).toHaveLength(3);
    expect(progresses[0]).toMatchObject({
      type: 'progress',
      id: 'job-1',
      percent: 25,
      currentSec: 0.25,
      totalSec: 1.0,
      etaSec: null,
    });
    expect(progresses[2]).toMatchObject({ percent: 100, etaSec: 0 });
  });
});

describe('JobRunner — cancel/done レース', () => {
  it('cancel → transcode 内で AbortError → cancelled が post', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async (_i, _o, opts) => {
      // signal が abort されるまで待つ
      await new Promise<void>((resolve) => {
        opts.signal.addEventListener('abort', () => resolve());
      });
      throw new TranscodeCancelledError();
    });

    const runner = new JobRunner(env);
    const p = runner.handle(transcodeMsg());

    // 別経路で cancel を投げる
    await new Promise((r) => setTimeout(r, 0));
    await runner.handle(cancelMsg());

    await p;
    expect(posted.map((m) => m.type)).toEqual(['started', 'cancelled']);
  });

  it('cancel は abortController.abort() を呼ぶ (signal.aborted=true になる)', async () => {
    const { env, setTranscodeBehavior } = makeEnv();
    let capturedSignal: AbortSignal | null = null;
    setTranscodeBehavior(async (_i, _o, opts) => {
      capturedSignal = opts.signal;
      await new Promise<void>((resolve) => {
        opts.signal.addEventListener('abort', () => resolve());
      });
      throw new TranscodeCancelledError();
    });

    const runner = new JobRunner(env);
    const p = runner.handle(transcodeMsg());
    await new Promise((r) => setTimeout(r, 0));
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal!.aborted).toBe(false);

    await runner.handle(cancelMsg());
    expect(capturedSignal!.aborted).toBe(true);
    await p;
  });

  it('done を post 済みで cancel が来ても無視 (二重 terminal 防止)', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async () => ({ outputSize: 100, durationSec: 1 }));
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg());

    // done が posted されてから cancel が来る
    expect(posted.map((m) => m.type)).toEqual(['started', 'done']);

    await runner.handle(cancelMsg());
    // cancel 受信後も追加メッセージは無い
    expect(posted.map((m) => m.type)).toEqual(['started', 'done']);
  });

  it('cancelled を post 済みで遅延 progress が来ても無視', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    let delayedOnProgress!: (
      p: number, c: number, t: number, e: number | null,
    ) => void;
    setTranscodeBehavior(async (_i, _o, opts) => {
      delayedOnProgress = opts.onProgress;
      await new Promise<void>((resolve) => {
        opts.signal.addEventListener('abort', () => resolve());
      });
      throw new TranscodeCancelledError();
    });

    const runner = new JobRunner(env);
    const p = runner.handle(transcodeMsg());
    await new Promise((r) => setTimeout(r, 0));
    await runner.handle(cancelMsg());
    await p;

    expect(posted.map((m) => m.type)).toEqual(['started', 'cancelled']);

    // cancelled 後に transcode が遅延 progress を呼んでも、ランナーは無視
    delayedOnProgress(99, 0.99, 1.0, null);
    expect(posted.map((m) => m.type)).toEqual(['started', 'cancelled']);
  });

  it('cancel for 違う jobId は無視', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    let signal!: AbortSignal;
    setTranscodeBehavior(async (_i, _o, opts) => {
      signal = opts.signal;
      await new Promise((r) => setTimeout(r, 50));
      return { outputSize: 100, durationSec: 1 };
    });

    const runner = new JobRunner(env);
    const p = runner.handle(transcodeMsg('job-A'));
    await new Promise((r) => setTimeout(r, 0));

    // 違う ID の cancel
    await runner.handle(cancelMsg('job-B'));
    expect(signal.aborted).toBe(false);

    await p;
    expect(posted.map((m) => m.type)).toEqual(['started', 'done']);
  });
});

describe('JobRunner — failed path', () => {
  it('transcode が generic Error を投げると failed', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async () => {
      throw new Error('boom');
    });
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg());

    expect(posted.map((m) => m.type)).toEqual(['started', 'failed']);
    const fail = posted.find((m) => m.type === 'failed');
    expect(fail).toMatchObject({ type: 'failed', id: 'job-1', error: 'boom' });
  });

  it('TranscodeError を投げると failed (cancel と区別)', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async () => {
      throw new TranscodeError('mediabunny error');
    });
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg());

    expect(posted.map((m) => m.type)).toEqual(['started', 'failed']);
    expect(posted[1]).toMatchObject({ type: 'failed', error: 'mediabunny error' });
  });

  it('readInput 失敗 (OPFS read エラー) で failed', async () => {
    const { env, posted } = makeEnv();
    (env.readInput as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('OPFS: not found'),
    );
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg());

    expect(posted.map((m) => m.type)).toEqual(['started', 'failed']);
    expect(posted[1]).toMatchObject({ error: 'OPFS: not found' });
  });

  it('Error でない値を throw した場合は String 化', async () => {
    const { env, posted, setTranscodeBehavior } = makeEnv();
    setTranscodeBehavior(async () => {
      throw 'plain string';
    });
    const runner = new JobRunner(env);
    await runner.handle(transcodeMsg());
    expect(posted[1]).toMatchObject({ type: 'failed', error: 'plain string' });
  });
});
