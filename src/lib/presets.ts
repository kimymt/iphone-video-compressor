// Phase 1: capability.ts が使う buildHevcCodecString のみを実装。
// 6 個の固定プリセット定義と PRESETS / getAvailablePresets / buildCodecString は Phase 3 で追加する。

import type { CodecChoice } from './types';

/**
 * 解像度とフレームレートに応じて HEVC のレベル文字列を返す。
 * `hvc1.1.6.L<level_idc>.B0` 形式。
 *
 * HEVC Main Profile, level_idc は解像度 + fps で決まる:
 * - <= 720p    → L93  (Level 3.1, MaxLumaPS  921,600)
 * - <= 1080p30 → L120 (Level 4.0, MaxLumaPS 2,228,224)
 * - <= 1080p60 → L123 (Level 4.1, 高フレームレート)
 * - <= 4K30    → L153 (Level 5.1, MaxLumaPS 8,912,896)
 * - <= 4K60    → L156 (Level 5.2)
 *
 * 仕様書 `hvc1.1.6.L93.B0` は Level 3.1 = 720p までしか対応しないバグだったため、
 * V1 plan-eng-review の A1 で動的選択に変更（CLAUDE.md 参照）。
 */
export function buildHevcCodecString(longEdge: number, fps = 30): string {
  if (longEdge <= 1280) return 'hvc1.1.6.L93.B0';
  if (longEdge <= 1920) return fps <= 30 ? 'hvc1.1.6.L120.B0' : 'hvc1.1.6.L123.B0';
  if (longEdge <= 3840) return fps <= 30 ? 'hvc1.1.6.L153.B0' : 'hvc1.1.6.L156.B0';
  return 'hvc1.1.6.L156.B0';
}

/**
 * Phase 1 では capability check が固定の H.264 High Profile L4.0 のみを使う。
 * Phase 3 で `buildCodecString(preset, longEdge, fps)` を追加して
 * baseline / high を切り替える。
 */
export function h264HighCodecString(): string {
  return 'avc1.640028';
}

// Phase 3 で追加予定:
//   export const PRESETS: Preset[]
//   export function buildCodecString(preset: Preset, longEdge: number, fps?: number): string
//   export function getAvailablePresets(envCheck: EnvCheck): Preset[]
//   export const MAX_INFLIGHT_FRAMES: Record<CodecChoice, number>

// CodecChoice の参照を確保（Phase 3 でフル使用）
export type { CodecChoice };
