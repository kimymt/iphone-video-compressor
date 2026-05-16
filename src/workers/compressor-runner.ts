// Phase 3b worker: Worker 内ロジック (テスト容易性のため `self` への依存を抽出)。
//
// JobRunner は 1 ジョブのライフサイクルを管理する。
// - `handle({ type: 'transcode', ... })` で job を開始 (cold-start で 'started' 即 post)
// - `handle({ type: 'cancel', ... })` で AbortController.abort()、transcode が
//   TranscodeCancelledError を投げ catch ブロックで 'cancelled' を post
// - terminalSent フラグで cancel/done レースを 1 メッセージに収束させる
//   (CLAUDE.md ハマりどころ 19)
// - V2.x (A2): `handle({ type: 'peek', ... })` で投機的 demux を実行し、metadata を
//   `peeked` で応答。transcode の lifecycle (currentJobId / terminalSent) には影響しない。
//
// V2.x (A1): Worker は persistent。1 つの JobRunner で複数 transcode を順次処理する。
// handleTranscode 開始時に currentJobId / terminalSent をリセットすることで実現。

import {
  TranscodeCancelledError,
  type TranscodeOptions,
  type TranscodeResult,
} from '../pipeline/transcode';
import type { DemuxResult } from '../pipeline/demux';
import { isHdrColorSpace } from '../pipeline/demux';
import type { Rotation } from 'mediabunny';
import type { PeekMeta, WorkerRequest, WorkerResponse } from './messages';

/** JobRunner の依存。テストで差し替え可能。 */
export type RunnerEnv = {
  /** メインスレッドへ response を送る。デフォルトは self.postMessage。 */
  post(msg: WorkerResponse): void;
  /** OPFS のパスから入力ファイルを取得。デフォルトは src/db/opfs.ts の readFromOpfs。 */
  readInput(path: string): Promise<File>;
  /** OPFS のパスに対する Writable を取得。デフォルトは src/db/opfs.ts の getOpfsWritable。 */
  openOutput(path: string): Promise<FileSystemWritableFileStream>;
  /** transcode 実装。テストで差し替え可能。 */
  runTranscode(
    input: File,
    output: FileSystemWritableFileStream,
    opts: TranscodeOptions,
  ): Promise<TranscodeResult>;
  /**
   * V2.x (A2): demux 実装。peek で metadata 抽出に使う。
   * デフォルトは src/pipeline/demux.ts の demuxInput。
   * 戻り値の `Input` は呼び出し側 (handlePeek) が dispose() する責任を持つ。
   */
  demux(file: Blob): Promise<DemuxResult>;
};

/**
 * mediabunny の Rotation 型 (0/90/180/270) を message protocol 用の固定 union に
 * 絞り込む。実値は同じだが、PeekMeta の型と互換にするためのヘルパ。
 */
function normalizeRotation(r: Rotation): 0 | 90 | 180 | 270 {
  if (r === 90 || r === 180 || r === 270) return r;
  return 0;
}

export class JobRunner {
  private abortController: AbortController | null = null;
  private currentJobId: string | null = null;
  /**
   * このジョブで done/failed/cancelled のいずれかを既に post 済み。
   * 設定後の progress / 重複 terminal は post しない (CLAUDE.md「cancel/done レース」)。
   */
  private terminalSent = false;

  constructor(private readonly env: RunnerEnv) {}

  async handle(msg: WorkerRequest): Promise<void> {
    if (msg.type === 'transcode') {
      await this.handleTranscode(msg);
    } else if (msg.type === 'cancel') {
      this.handleCancel(msg);
    } else if (msg.type === 'peek') {
      // V2.x (A2): peek は transcode の lifecycle と独立。並行で走る可能性がある
      // (ユーザが picker で複数件選んだとき、各 file に対して peek が連続発火する)。
      await this.handlePeek(msg);
    }
  }

  /**
   * V2.x (A2): 投機的 demux。OPFS write と並列に main で発火させる想定。
   * demux → metadata 抽出 → dispose() の最小コストで返す。
   * 失敗は致命的でないので `peekFailed` で silent に応答 (transcode 時に再失敗する)。
   * currentJobId / terminalSent / abortController は触らない (transcode と独立)。
   */
  private async handlePeek(msg: WorkerRequest & { type: 'peek' }): Promise<void> {
    let demuxed: DemuxResult | null = null;
    try {
      demuxed = await this.env.demux(msg.file);
      const meta: PeekMeta = {
        durationSec: demuxed.durationSec,
        rotation: normalizeRotation(demuxed.rotation),
        width: demuxed.width,
        height: demuxed.height,
        fps: demuxed.fps,
        isHdr: isHdrColorSpace(demuxed.colorSpace),
      };
      this.env.post({ type: 'peeked', id: msg.id, meta });
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.env.post({ type: 'peekFailed', id: msg.id, error: errMsg });
    } finally {
      // Input は demuxed が成功していれば dispose() する責任がある (demux.ts のコメント参照)
      if (demuxed) {
        try {
          demuxed.input.dispose();
        } catch {
          /* dispose 中の二次例外は無視 */
        }
      }
    }
  }

  private async handleTranscode(msg: WorkerRequest & { type: 'transcode' }): Promise<void> {
    this.currentJobId = msg.id;
    this.terminalSent = false;
    this.abortController = new AbortController();

    // cold-start UX: started を即 post (CLAUDE.md ハマりどころ 18)
    this.env.post({ type: 'started', id: msg.id });

    try {
      const inputFile = await this.env.readInput(msg.inputPath);
      const outputWritable = await this.env.openOutput(msg.outputPath);

      const result = await this.env.runTranscode(inputFile, outputWritable, {
        preset: msg.preset,
        signal: this.abortController.signal,
        onProgress: (percent, currentSec, totalSec, etaSec) => {
          // 既に terminal を送っていれば追加 progress は送らない
          if (this.terminalSent) return;
          this.env.post({
            type: 'progress',
            id: msg.id,
            percent,
            currentSec,
            totalSec,
            etaSec,
          });
        },
      });

      // cancel が race してきていれば terminalSent=true になっている可能性…はない:
      // cancel handler は abort() するだけで terminalSent を触らない。
      // transcode が catch を通って TranscodeCancelledError を投げれば
      // catch ブロックで 'cancelled' が送られる。ここに到達するのは transcode が
      // 正常完了した場合のみ。terminalSent はまだ false。
      if (this.terminalSent) return; // 安全側、通常は不要
      this.terminalSent = true;
      this.env.post({
        type: 'done',
        id: msg.id,
        outputSize: result.outputSize,
        durationSec: result.durationSec,
      });
    } catch (e) {
      if (this.terminalSent) return;
      this.terminalSent = true;
      if (e instanceof TranscodeCancelledError) {
        this.env.post({ type: 'cancelled', id: msg.id });
      } else {
        const errMsg = e instanceof Error ? e.message : String(e);
        this.env.post({ type: 'failed', id: msg.id, error: errMsg });
      }
    } finally {
      // 1 ジョブで 1 Worker の前提のため、AbortController はリセット不要。
      // Worker は terminal 受信後、メインから terminate される。
    }
  }

  private handleCancel(msg: WorkerRequest & { type: 'cancel' }): void {
    // 違うジョブ ID なら無視 (Worker は 1 ジョブ前提だが防御的)
    if (msg.id !== this.currentJobId) return;
    // 既に terminal を送っていれば cancel は無視 (CLAUDE.md cancel/done レース)
    if (this.terminalSent) return;
    this.abortController?.abort();
    // cancel 受信後の挙動: abort により transcode が TranscodeCancelledError を投げる
    // → handleTranscode の catch で 'cancelled' を post。ここでは何も post しない
    // (二重 cancelled を避けるため)。
  }
}
