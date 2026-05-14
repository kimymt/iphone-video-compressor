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
