import { describe, it, expect } from 'vitest';
import {
  buildHevcCodecString,
  h264HighCodecString,
  buildCodecString,
  PRESETS,
  getAvailablePresets,
  defaultPresetKey,
  findPreset,
  MAX_INFLIGHT_FRAMES,
  estimatedOutputSize,
} from './presets';
import type { EnvCheck, Preset } from './types';

const HEVC_OK: EnvCheck = {
  videoEncoder: true,
  audioEncoder: true,
  webShareFiles: true,
  wakeLock: true,
  opfs: true,
  persistentStorage: true,
  hevcEncode: true,
  h264Encode: true,
  canRun: true,
};

const HEVC_NG: EnvCheck = { ...HEVC_OK, hevcEncode: false };

describe('buildHevcCodecString', () => {
  it('720p 以下は L93 (Level 3.1)', () => {
    expect(buildHevcCodecString(1280, 30)).toBe('hvc1.1.6.L93.B0');
    expect(buildHevcCodecString(720, 30)).toBe('hvc1.1.6.L93.B0');
    expect(buildHevcCodecString(640, 24)).toBe('hvc1.1.6.L93.B0');
  });

  it('1080p30 は L120 (Level 4.0)', () => {
    expect(buildHevcCodecString(1920, 30)).toBe('hvc1.1.6.L120.B0');
    expect(buildHevcCodecString(1920, 24)).toBe('hvc1.1.6.L120.B0');
    expect(buildHevcCodecString(1281, 30)).toBe('hvc1.1.6.L120.B0');
  });

  it('1080p60 は L123 (Level 4.1)', () => {
    expect(buildHevcCodecString(1920, 60)).toBe('hvc1.1.6.L123.B0');
    expect(buildHevcCodecString(1920, 50)).toBe('hvc1.1.6.L123.B0');
  });

  it('4K30 は L153 (Level 5.1)', () => {
    expect(buildHevcCodecString(3840, 30)).toBe('hvc1.1.6.L153.B0');
    expect(buildHevcCodecString(3840, 24)).toBe('hvc1.1.6.L153.B0');
    expect(buildHevcCodecString(2160, 30)).toBe('hvc1.1.6.L153.B0');
  });

  it('4K60 は L156 (Level 5.2)', () => {
    expect(buildHevcCodecString(3840, 60)).toBe('hvc1.1.6.L156.B0');
    expect(buildHevcCodecString(3840, 120)).toBe('hvc1.1.6.L156.B0');
  });

  it('4K 超は L156 にクランプ (現時点で WebCodecs が L62+ を扱えないため)', () => {
    expect(buildHevcCodecString(7680, 30)).toBe('hvc1.1.6.L156.B0');
  });

  it('fps デフォルトは 30', () => {
    expect(buildHevcCodecString(1920)).toBe('hvc1.1.6.L120.B0');
  });
});

describe('h264HighCodecString', () => {
  it('avc1.640028 を返す (H.264 High Profile Level 4.0)', () => {
    expect(h264HighCodecString()).toBe('avc1.640028');
  });
});

describe('PRESETS 定義', () => {
  it('6 個のプリセットが定義されている', () => {
    expect(PRESETS).toHaveLength(6);
  });

  it('各プリセットキーが types.ts の PresetKey と一致', () => {
    const keys = PRESETS.map((p) => p.key);
    expect(keys).toEqual([
      'best-hevc',
      'high-hevc',
      'standard-hevc',
      'light-hevc',
      'compat-h264',
      'min-h264',
    ]);
  });

  it('HEVC プリセット 4 個 + H.264 プリセット 2 個', () => {
    const hevc = PRESETS.filter((p) => p.codec === 'hevc');
    const h264 = PRESETS.filter((p) => p.codec.startsWith('h264'));
    expect(hevc).toHaveLength(4);
    expect(h264).toHaveLength(2);
  });

  it('best-hevc は maxLongEdge=null (オリジナル解像度)', () => {
    const best = PRESETS.find((p) => p.key === 'best-hevc');
    expect(best?.maxLongEdge).toBeNull();
  });

  it('全プリセットで videoBitrate と audioBitrate が正の整数', () => {
    for (const p of PRESETS) {
      expect(p.videoBitrate).toBeGreaterThan(0);
      expect(p.audioBitrate).toBeGreaterThan(0);
      expect(Number.isInteger(p.videoBitrate)).toBe(true);
      expect(Number.isInteger(p.audioBitrate)).toBe(true);
    }
  });

  it('label と description が空でない', () => {
    for (const p of PRESETS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });
});

describe('buildCodecString', () => {
  const hevcPreset: Preset = PRESETS.find((p) => p.codec === 'hevc')!;
  const h264HighPreset: Preset = PRESETS.find((p) => p.codec === 'h264-high')!;
  const h264BaselinePreset: Preset = PRESETS.find((p) => p.codec === 'h264-baseline')!;

  it('hevc プリセットは buildHevcCodecString に委譲', () => {
    expect(buildCodecString(hevcPreset, 1280, 30)).toBe('hvc1.1.6.L93.B0');
    expect(buildCodecString(hevcPreset, 1920, 30)).toBe('hvc1.1.6.L120.B0');
    expect(buildCodecString(hevcPreset, 1920, 60)).toBe('hvc1.1.6.L123.B0');
    expect(buildCodecString(hevcPreset, 3840, 30)).toBe('hvc1.1.6.L153.B0');
    expect(buildCodecString(hevcPreset, 3840, 60)).toBe('hvc1.1.6.L156.B0');
  });

  it('h264-high は avc1.640028 固定 (Level 4.0)', () => {
    expect(buildCodecString(h264HighPreset, 1920, 30)).toBe('avc1.640028');
    expect(buildCodecString(h264HighPreset, 720, 30)).toBe('avc1.640028');
  });

  it('h264-baseline は avc1.42E01F 固定 (Level 3.1)', () => {
    expect(buildCodecString(h264BaselinePreset, 854, 30)).toBe('avc1.42E01F');
    expect(buildCodecString(h264BaselinePreset, 1280, 24)).toBe('avc1.42E01F');
  });

  it('fps デフォルト 30 でも動作', () => {
    expect(buildCodecString(hevcPreset, 1920)).toBe('hvc1.1.6.L120.B0');
  });
});

describe('getAvailablePresets', () => {
  it('HEVC 対応端末では 6 個全部', () => {
    expect(getAvailablePresets(HEVC_OK)).toHaveLength(6);
  });

  it('HEVC 非対応端末では H.264 系 2 個のみ', () => {
    const avail = getAvailablePresets(HEVC_NG);
    expect(avail).toHaveLength(2);
    expect(avail.every((p) => p.codec !== 'hevc')).toBe(true);
    expect(avail.map((p) => p.key)).toEqual(['compat-h264', 'min-h264']);
  });

  it('返り値の順序は PRESETS の宣言順を保つ', () => {
    const avail = getAvailablePresets(HEVC_OK);
    expect(avail.map((p) => p.key)).toEqual([
      'best-hevc',
      'high-hevc',
      'standard-hevc',
      'light-hevc',
      'compat-h264',
      'min-h264',
    ]);
  });
});

describe('defaultPresetKey', () => {
  it('HEVC 対応端末では standard-hevc', () => {
    expect(defaultPresetKey(HEVC_OK)).toBe('standard-hevc');
  });

  it('HEVC 非対応端末では compat-h264', () => {
    expect(defaultPresetKey(HEVC_NG)).toBe('compat-h264');
  });
});

describe('findPreset', () => {
  it('既知のキーで Preset を返す', () => {
    expect(findPreset('standard-hevc')?.label).toBe('標準 (HEVC)');
    expect(findPreset('min-h264')?.codec).toBe('h264-baseline');
  });

  it('全 PresetKey が PRESETS に存在する', () => {
    const keys = ['best-hevc', 'high-hevc', 'standard-hevc', 'light-hevc', 'compat-h264', 'min-h264'] as const;
    for (const k of keys) {
      expect(findPreset(k)).not.toBeNull();
    }
  });
});

describe('MAX_INFLIGHT_FRAMES', () => {
  it('hevc は 4 (VideoToolbox 単一リソース対策)', () => {
    expect(MAX_INFLIGHT_FRAMES.hevc).toBe(4);
  });

  it('H.264 系は 8', () => {
    expect(MAX_INFLIGHT_FRAMES['h264-high']).toBe(8);
    expect(MAX_INFLIGHT_FRAMES['h264-baseline']).toBe(8);
  });

  it('全 CodecChoice をカバー', () => {
    const codecs = PRESETS.map((p) => p.codec);
    for (const c of codecs) {
      expect(MAX_INFLIGHT_FRAMES[c]).toBeGreaterThan(0);
    }
  });
});

// ----- V2.x (D2): estimatedOutputSize -----

describe('estimatedOutputSize (V2.x D2)', () => {
  const standardHevc = PRESETS.find((p) => p.key === 'standard-hevc')!;
  const minH264 = PRESETS.find((p) => p.key === 'min-h264')!;

  it('動画長 + preset から bps × sec / 8 でバイト数を計算', () => {
    // standard-hevc: video 3 Mbps + audio 128 kbps = 3.128 Mbps
    // 10 秒なら 3.128 * 10 / 8 = 3.91 MB ≈ 3,910,000 bytes
    const bytes = estimatedOutputSize(10, standardHevc);
    expect(bytes).toBeCloseTo((3_000_000 + 128_000) * 10 / 8, 0);
  });

  it('min-h264 で短時間動画 (1 秒) も正しく計算', () => {
    // min-h264: video 800 kbps + audio 64 kbps = 864 kbps
    // 1 秒 = 864,000 / 8 = 108,000 bytes
    expect(estimatedOutputSize(1, minH264)).toBe((800_000 + 64_000) / 8);
  });

  it('durationSec=0 で NaN を返す (UI 側で「予測なし」表示)', () => {
    expect(estimatedOutputSize(0, standardHevc)).toBeNaN();
  });

  it('durationSec が負数で NaN を返す', () => {
    expect(estimatedOutputSize(-5, standardHevc)).toBeNaN();
  });

  it('durationSec が NaN / Infinity で NaN を返す (UI が誤表示しない)', () => {
    expect(estimatedOutputSize(NaN, standardHevc)).toBeNaN();
    expect(estimatedOutputSize(Infinity, standardHevc)).toBeNaN();
    expect(estimatedOutputSize(-Infinity, standardHevc)).toBeNaN();
  });

  it('長時間動画 (1 時間) でも overflow せず合理的な値', () => {
    // 1h × standard-hevc = 3.128 Mbps × 3600 sec / 8 = 1.408 GB
    const oneHour = estimatedOutputSize(3600, standardHevc);
    expect(oneHour).toBeCloseTo(1_407_600_000, -3);
    expect(Number.isFinite(oneHour)).toBe(true);
  });

  it('全プリセットで durationSec=10 のときに正の有限値を返す', () => {
    for (const p of PRESETS) {
      const bytes = estimatedOutputSize(10, p);
      expect(Number.isFinite(bytes)).toBe(true);
      expect(bytes).toBeGreaterThan(0);
    }
  });
});
