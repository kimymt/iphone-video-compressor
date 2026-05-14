// Phase 3b worker: メインスレッド側ラッパ。
// Worker と 1 ジョブの message プロトコルを Promise ベースに包む。
//
// 使用例:
//   const worker = spawnTranscodeWorker();
//   const result = await runTranscodeJob(worker, { id, inputPath, outputPath, preset,
//     onProgress: (...) => updateUi(),
//     signal: abortController.signal,
//   });
//   // worker は terminal 受信時に自動 terminate される。呼び出し側の clean up 不要。
//
// CLAUDE.md「メイン側: cancelled 受信後に届く done/failed/progress は無視」を実装。

import type { Preset } from '../lib/types';
import type { WorkerRequest, WorkerResponse } from './messages';
import { isTerminalResponse } from './messages';

export type TranscodeJobResult =
  | { kind: 'done'; outputSize: number; durationSec: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; error: string };

export type TranscodeJobOptions = {
  /** ジョブの一意 ID。Worker と response の id 一致確認に使用。 */
  id: string;
  /** OPFS 上の入力ファイルパス (Phase 2 の writeInputToOpfs が返したパス)。 */
  inputPath: string;
  /** OPFS 上の出力ファイルパス (outputs/{id}.mp4 を想定)。 */
  outputPath: string;
  /** 圧縮プリセット。 */
  preset: Preset;
  /** Worker が transcode を開始した瞬間 (started メッセージ受信時)。 */
  onStarted?: () => void;
  /** 進捗。200ms スロットルされている (Worker 側で)。 */
  onProgress?: (
    percent: number,
    currentSec: number,
    totalSec: number,
    etaSec: number | null,
  ) => void;
  /**
   * 外部からのキャンセル。abort 時に worker.postMessage({type:'cancel', id}) する。
   * abort 後は worker からの cancelled or done レースに任せる
   * (Worker 側で terminalSent 保証されている)。
   */
  signal?: AbortSignal;
};

/**
 * デフォルトの Worker spawner。vite が `new URL(...)` の bundle / dev 解決を行う。
 *
 * Vite 5: `new Worker(new URL('./xxx.ts', import.meta.url), { type: 'module' })` を
 * モジュール Worker として扱う (vite.config.ts: worker.format = 'es')。
 */
export function spawnTranscodeWorker(): Worker {
  return new Worker(new URL('./compressor.worker.ts', import.meta.url), {
    type: 'module',
    name: 'compressor',
  });
}

/**
 * 1 つの Worker で 1 ジョブを走らせ、terminal メッセージ受信で Promise を resolve する。
 *
 * 受信後 worker は自動 terminate される。同じ worker を再利用しない前提
 * (1 Worker = 1 job)。Worker プールが必要になったら別レイヤで実装する。
 *
 * 内部の状態:
 * - `resolved`: 既に terminal を受信した。以後の任意メッセージは無視する
 *   (CLAUDE.md「メイン側: cancelled 受信後に届く done/failed/progress は無視」)
 * - signal が abort されたら 'cancel' を post。実際のキャンセル成否は worker からの
 *   cancelled or done メッセージで決まる。
 */
export function runTranscodeJob(
  worker: Worker,
  opts: TranscodeJobOptions,
): Promise<TranscodeJobResult> {
  return new Promise<TranscodeJobResult>((resolve) => {
    let resolved = false;
    let abortListener: (() => void) | null = null;

    const finish = (result: TranscodeJobResult): void => {
      if (resolved) return;
      resolved = true;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (opts.signal && abortListener) {
        opts.signal.removeEventListener('abort', abortListener);
      }
      try {
        worker.terminate();
      } catch {
        /* terminate failure は無視 */
      }
      resolve(result);
    };

    const onMessage = (event: MessageEvent<WorkerResponse>): void => {
      const msg = event.data;
      // ID 不一致は無視 (1 worker = 1 job 前提だが防御的)
      if (msg.id !== opts.id && msg.id !== 'unknown') return;
      if (resolved) return;

      switch (msg.type) {
        case 'started':
          opts.onStarted?.();
          break;
        case 'progress':
          opts.onProgress?.(msg.percent, msg.currentSec, msg.totalSec, msg.etaSec);
          break;
        case 'done':
          finish({ kind: 'done', outputSize: msg.outputSize, durationSec: msg.durationSec });
          break;
        case 'cancelled':
          finish({ kind: 'cancelled' });
          break;
        case 'failed':
          finish({ kind: 'failed', error: msg.error });
          break;
      }
      // 余分な protection: terminal なら明示的に finish (上の switch で既に呼ばれているはず)
      if (isTerminalResponse(msg) && !resolved) {
        /* 上で finish 済み。理論的にここには到達しない。 */
      }
    };

    const onError = (event: ErrorEvent): void => {
      finish({ kind: 'failed', error: event.message || 'worker error' });
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    // 外部 signal → 'cancel' post
    if (opts.signal) {
      if (opts.signal.aborted) {
        // 既に aborted な状態で渡された場合: transcode 開始前に cancel を予約
        // worker は started を post してから cancel を処理する
        // (cancel と transcode の send 順序を保証するため、transcode → cancel の順に送る)
        abortListener = () => {
          /* もう abort されているので listener は不要、no-op */
        };
      } else {
        abortListener = () => {
          if (!resolved) {
            const cancelMsg: WorkerRequest = { type: 'cancel', id: opts.id };
            worker.postMessage(cancelMsg);
          }
        };
        opts.signal.addEventListener('abort', abortListener);
      }
    }

    // 起動 message を送る
    const transcodeMsg: WorkerRequest = {
      type: 'transcode',
      id: opts.id,
      inputPath: opts.inputPath,
      outputPath: opts.outputPath,
      preset: opts.preset,
    };
    worker.postMessage(transcodeMsg);

    // 既に aborted な signal の場合は transcode の直後に cancel を送る
    if (opts.signal?.aborted) {
      const cancelMsg: WorkerRequest = { type: 'cancel', id: opts.id };
      worker.postMessage(cancelMsg);
    }
  });
}
