// 共通型定義。すべてのモジュールから参照。
// CLAUDE.md の「主要モジュール仕様 > src/lib/types.ts」を反映。

export type PresetKey =
  | 'best-hevc'
  | 'high-hevc'
  | 'standard-hevc'
  | 'light-hevc'
  | 'compat-h264'
  | 'min-h264';
// 'custom' は MVP から除外（TODOS.md V2）

export type CodecChoice = 'hevc' | 'h264-high' | 'h264-baseline';

export type Preset = {
  key: PresetKey;
  label: string;
  description: string;
  codec: CodecChoice;
  maxLongEdge: number | null; // null = オリジナル維持
  videoBitrate: number; // bps
  audioBitrate: number; // bps
  // codecString は presets.ts の buildCodecString(preset, longEdge, fps) で動的算出
};

// QueueItem の status ごとに保持するフィールドを discriminated union で表現。
// failed のみ error フィールドが必須、それ以外では存在しない。
type QueueItemBase = {
  id: string; // UUID
  fileName: string;
  inputSize: number;
  inputOpfsPath: string; // status='done' 遷移時に削除（その後は空文字）
  outputOpfsPath?: string;
  outputSize?: number;
  durationSec?: number;
  progress: number; // 0-100
  preset: PresetKey;
  addedAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** processing 中のみセット。Worker の onProgress 由来。terminal で undefined。 */
  etaSec?: number | null;
  /** processing 中の処理済み秒。UI で残り時間表示に使う。terminal で undefined。 */
  currentSec?: number;
};

export type QueueStatus =
  | 'queued'
  | 'starting'
  | 'processing'
  | 'done'
  | 'failed'
  | 'cancelled';

export type QueueItem =
  | (QueueItemBase & {
      status: 'queued' | 'starting' | 'processing' | 'done' | 'cancelled';
    })
  | (QueueItemBase & { status: 'failed'; error: string });

export type EnvCheck = {
  videoEncoder: boolean;
  audioEncoder: boolean;
  webShareFiles: boolean;
  wakeLock: boolean;
  opfs: boolean;
  persistentStorage: boolean;
  hevcEncode: boolean;
  h264Encode: boolean;
  canRun: boolean;
};
