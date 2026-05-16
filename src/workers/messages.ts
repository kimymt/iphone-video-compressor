// Phase 3b worker: Worker ↔ メインスレッド間の message protocol。
// V2.x (A2): peek (投機的 demux) のリクエスト / 応答を追加。
// CLAUDE.md「主要モジュール仕様 > compressor.worker.ts」を反映。

import type { Preset } from '../lib/types';

/**
 * peek (投機的 demux) で返すメタ情報。
 * D2 で「予測 ~38MB」の表示に `durationSec` を使う。
 * 将来的に rotation / fps / isHdr を transcode 設定の先読みに利用可能。
 */
export type PeekMeta = {
  durationSec: number;
  rotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  fps: number;
  isHdr: boolean;
};

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
    }
  | {
      /**
       * V2.x (A2): 投機的 demux。OPFS write と並列に走らせて、durationSec などの
       * メタ情報を transcode 前に取得する。Worker 側で demuxInput → metadata 抽出 →
       * Input.dispose() し、`peeked` or `peekFailed` で応答。
       * id は QueueItem.id と同じ値を渡す (state 反映時の照合用)。
       */
      type: 'peek';
      id: string;
      file: File;
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
    }
  | {
      /** V2.x (A2): peek 成功。`meta.durationSec` を queueStore が item に反映する。 */
      type: 'peeked';
      id: string;
      meta: PeekMeta;
    }
  | {
      /**
       * V2.x (A2): peek 失敗。`failed` とは別 type にして transcode の terminal と
       * 混同しない。peek 失敗は致命的でない (transcode 時に同じエラーで failed になる)
       * ので queueStore は silent drop する。
       */
      type: 'peekFailed';
      id: string;
      error: string;
    };

/** Worker → メインの terminal (transcode ジョブのライフサイクル終了を意味する) なメッセージ種別。 */
export type TerminalResponseType = 'done' | 'failed' | 'cancelled';

export function isTerminalResponse(msg: WorkerResponse): msg is WorkerResponse & {
  type: TerminalResponseType;
} {
  return msg.type === 'done' || msg.type === 'failed' || msg.type === 'cancelled';
}
