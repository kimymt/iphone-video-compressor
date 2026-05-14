import { describe, it, expect } from 'vitest';
import { buildHevcCodecString, h264HighCodecString } from './presets';

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
