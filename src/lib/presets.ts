// Phase 3a: Phase 1 partial の buildHevcCodecString / h264HighCodecString を
// 完全なプリセット定義に拡張する。
// - 6 個の固定 PRESETS
// - buildCodecString: preset + 解像度 + fps → 動的 codec 文字列
// - getAvailablePresets: capability に応じてフィルタ
// - defaultPresetKey: HEVC 対応の有無で 'standard-hevc' or 'compat-h264'
// - MAX_INFLIGHT_FRAMES: encodeQueueSize バックプレッシャー上限

import type { CodecChoice, EnvCheck, Preset, PresetKey } from './types';

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
 * 仕様書の `hvc1.1.6.L93.B0` 固定は 720p までしか対応しないバグだったため、
 * V1 plan-eng-review の A1 で動的選択に変更（CLAUDE.md 参照）。
 */
export function buildHevcCodecString(longEdge: number, fps = 30): string {
  if (longEdge <= 1280) return 'hvc1.1.6.L93.B0';
  if (longEdge <= 1920) return fps <= 30 ? 'hvc1.1.6.L120.B0' : 'hvc1.1.6.L123.B0';
  if (longEdge <= 3840) return fps <= 30 ? 'hvc1.1.6.L153.B0' : 'hvc1.1.6.L156.B0';
  return 'hvc1.1.6.L156.B0';
}

/**
 * @deprecated Phase 1 互換ヘルパー。Phase 3 以降は buildCodecString を経由する。
 */
export function h264HighCodecString(): string {
  return 'avc1.640028';
}

/**
 * Preset と出力長辺 / fps から WebCodecs `VideoEncoderConfig.codec` 文字列を返す。
 * - hevc: 解像度 + fps で動的 (buildHevcCodecString)
 * - h264-high: 'avc1.640028' (Profile High, Level 4.0、≤1080p30)
 * - h264-baseline: 'avc1.42E01F' (Profile Baseline, Level 3.1、≤720p30)
 *
 * H.264 は MVP では固定 Profile/Level（端末側 isConfigSupported で十分カバー）。
 * 動的選択が必要になったら拡張ポイント。
 */
export function buildCodecString(preset: Preset, longEdge: number, fps = 30): string {
  switch (preset.codec) {
    case 'hevc':
      return buildHevcCodecString(longEdge, fps);
    case 'h264-high':
      return 'avc1.640028';
    case 'h264-baseline':
      return 'avc1.42E01F';
  }
}

/**
 * 6 個の固定プリセット定義 (CLAUDE.md「主要モジュール仕様 > src/lib/presets.ts」)。
 *
 * `maxLongEdge` は出力動画の長辺ピクセル数の上限。`null` でオリジナル維持。
 * iPhone は撮影時にしばしば 4K (長辺 3840) で記録するため、'high-hevc' / 'standard-hevc'
 * の 1080 で大幅なサイズ削減が見込める。
 *
 * `videoBitrate` / `audioBitrate` は bps。VBR 想定なので実出力ビットレートは前後する。
 */
export const PRESETS: readonly Preset[] = [
  {
    key: 'best-hevc',
    label: '最高画質 (HEVC)',
    description: 'オリジナル解像度を維持、12 Mbps / 192 kbps',
    codec: 'hevc',
    maxLongEdge: null,
    videoBitrate: 12_000_000,
    audioBitrate: 192_000,
  },
  {
    key: 'high-hevc',
    label: '高画質 (HEVC)',
    description: '長辺 1080px、5 Mbps / 128 kbps',
    codec: 'hevc',
    maxLongEdge: 1080,
    videoBitrate: 5_000_000,
    audioBitrate: 128_000,
  },
  {
    key: 'standard-hevc',
    label: '標準 (HEVC)',
    description: '長辺 1080px、3 Mbps / 128 kbps（既定）',
    codec: 'hevc',
    maxLongEdge: 1080,
    videoBitrate: 3_000_000,
    audioBitrate: 128_000,
  },
  {
    key: 'light-hevc',
    label: '軽量 (HEVC)',
    description: '長辺 720px、1.5 Mbps / 96 kbps',
    codec: 'hevc',
    maxLongEdge: 720,
    videoBitrate: 1_500_000,
    audioBitrate: 96_000,
  },
  {
    key: 'compat-h264',
    label: '互換優先 (H.264)',
    description: '長辺 1080px、5 Mbps / 128 kbps、H.264 High',
    codec: 'h264-high',
    maxLongEdge: 1080,
    videoBitrate: 5_000_000,
    audioBitrate: 128_000,
  },
  {
    key: 'min-h264',
    label: '最小 (H.264)',
    description: '長辺 480px、800 kbps / 64 kbps、H.264 Baseline',
    codec: 'h264-baseline',
    maxLongEdge: 480,
    videoBitrate: 800_000,
    audioBitrate: 64_000,
  },
] as const;

/**
 * 端末のエンコード対応に応じて利用可能なプリセットを返す。
 * HEVC エンコード非対応端末では H.264 系プリセット 2 個のみが残る。
 */
export function getAvailablePresets(envCheck: EnvCheck): Preset[] {
  return PRESETS.filter((p) => p.codec !== 'hevc' || envCheck.hevcEncode);
}

/**
 * デフォルトのプリセットキー。HEVC 対応端末では 'standard-hevc'、非対応なら 'compat-h264'。
 * 起動時の settings 初期化、および UI の選択肢のデフォルト選択に使用。
 */
export function defaultPresetKey(envCheck: EnvCheck): PresetKey {
  return envCheck.hevcEncode ? 'standard-hevc' : 'compat-h264';
}

/**
 * PresetKey で PRESETS から Preset を引く。未知のキーは null。
 */
export function findPreset(key: PresetKey): Preset | null {
  return PRESETS.find((p) => p.key === key) ?? null;
}

/**
 * Worker の transcode ループにおける `videoEncoder.encodeQueueSize` 上限。
 * 値を超えたらバックプレッシャー待機 (短いスリープ + 再チェック)。
 *
 * HEVC は VideoToolbox の単一ハードウェアリソース制約を踏まえて小さめ (4)。
 * H.264 はパイプラインに余裕があるので 8。
 *
 * CLAUDE.md 「ハマりどころ 17」: HEVC 2 並列で逆に遅くなる場合の対策の前段。
 * 並列度判定は queueStore 側で別途行う。
 */
export const MAX_INFLIGHT_FRAMES: Record<CodecChoice, number> = {
  hevc: 4,
  'h264-high': 8,
  'h264-baseline': 8,
};

// CodecChoice の型再 export (capability check が presets.ts 経由で参照しても良いように)
export type { CodecChoice };
