// Phase 3b worker: Worker ↔ メインスレッド間の message protocol。
// CLAUDE.md「主要モジュール仕様 > compressor.worker.ts」を反映。

import type { Preset } from '../lib/types';

/** メイン → Worker の request。 */
export type WorkerRequest =
  | {
      type: 'transcode';
      id: string;
      inputPath: string;
      outputPath: string;
      preset: Preset;
    }
  | {
      type: 'cancel';
      id: string;
    };

/** Worker → メインの response。 */
export type WorkerResponse =
  | {
      type: 'started';
      id: string;
    }
  | {
      type: 'progress';
      id: string;
      percent: number;
      currentSec: number;
      totalSec: number;
      etaSec: number | null;
    }
  | {
      type: 'done';
      id: string;
      outputSize: number;
      durationSec: number;
    }
  | {
      type: 'failed';
      id: string;
      error: string;
    }
  | {
      type: 'cancelled';
      id: string;
    };

/** Worker → メインの terminal (Worker のライフサイクル終了を意味する) なメッセージ種別。 */
export type TerminalResponseType = 'done' | 'failed' | 'cancelled';

export function isTerminalResponse(msg: WorkerResponse): msg is WorkerResponse & {
  type: TerminalResponseType;
} {
  return msg.type === 'done' || msg.type === 'failed' || msg.type === 'cancelled';
}
