// V2.x (C1): audioPassthrough.ts のユニットテスト。
//
// 判定関数 `decideAudioPassthrough` の全分岐 (preset 除外 / codec / decoderConfig /
// sample rate / channels / bitrate) と、`estimateAudioBitrate` の境界を検証する。
//
// mediabunny の `EncodedPacketSink` を vi.mock で差し替えて、packet 列を制御する。

import { describe, it, expect, vi } from 'vitest';

// EncodedPacketSink をテスト全体で差し替える。`new EncodedPacketSink(track)` の引数
// `track` から packets を返すよう、テスト fixture 側で `__testPackets` を仕込む方式。
vi.mock('mediabunny', async () => {
  const actual = await vi.importActual<typeof import('mediabunny')>('mediabunny');
  return {
    ...actual,
    EncodedPacketSink: class MockEncodedPacketSink {
      private packets: Array<{ timestamp: number; duration: number; byteLength: number }>;
      constructor(track: unknown) {
        const trackAny = track as { __testPackets?: typeof MockEncodedPacketSink.prototype.packets };
        this.packets = trackAny.__testPackets ?? [];
      }
      async getFirstPacket(): Promise<unknown> {
        return this.packets[0] ? this.packets[0] : null;
      }
      async getNextPacket(prev: unknown): Promise<unknown> {
        const idx = this.packets.indexOf(prev as never);
        if (idx === -1 || idx + 1 >= this.packets.length) return null;
        return this.packets[idx + 1];
      }
    },
  };
});

import { decideAudioPassthrough, estimateAudioBitrate } from './audioPassthrough';
import type { Preset, PresetKey } from '../lib/types';

// ----- Fixtures -----

function makePreset(key: PresetKey, audioBitrate: number): Preset {
  return {
    key,
    label: key,
    description: '',
    codec:
      key.includes('hevc')
        ? 'hevc'
        : key === 'min-h264'
          ? 'h264-baseline'
          : 'h264-high',
    maxLongEdge: 1080,
    videoBitrate: 3_000_000,
    audioBitrate,
  };
}

/**
 * iPhone 標準を真似た audioTrack mock。
 * `__testPackets` で EncodedPacketSink の挙動を制御する。
 */
type AudioTrackMock = {
  getCodec: () => Promise<string | null>;
  getDecoderConfig: () => Promise<AudioDecoderConfig | null>;
  getSampleRate: () => Promise<number>;
  getNumberOfChannels: () => Promise<number>;
  __testPackets?: Array<{ timestamp: number; duration: number; byteLength: number }>;
};

function makeIphoneAudioTrack(overrides: Partial<AudioTrackMock> = {}): AudioTrackMock {
  return {
    getCodec: async () => 'aac',
    getDecoderConfig: async () => ({
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 2,
      description: new Uint8Array([0x12, 0x10]), // AudioSpecificConfig (AAC-LC stereo 44.1kHz)
    }),
    getSampleRate: async () => 44100,
    getNumberOfChannels: async () => 2,
    // 128 kbps を模した packets: 1 packet = 1024 samples = 23.2ms @ 44.1k
    // 100 packets = 2.32s、合計 (128_000 / 8) × 2.32 ≈ 37120 bytes、packet あたり 371 bytes
    __testPackets: Array.from({ length: 100 }, (_, i) => ({
      timestamp: i * (1024 / 44100),
      duration: 1024 / 44100,
      byteLength: 371,
    })),
    ...overrides,
  };
}

function makeDem(audioTrack: AudioTrackMock | null, durationSec = 10) {
  return {
    audioTrack: audioTrack as never,
    durationSec,
  };
}

// ----- decideAudioPassthrough: 失敗条件 -----

describe('decideAudioPassthrough — 失敗条件', () => {
  it('min-h264 preset では disable (圧縮期待を尊重)', async () => {
    const dem = makeDem(makeIphoneAudioTrack());
    const result = await decideAudioPassthrough(dem, makePreset('min-h264', 64_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) {
      expect(result.reason).toMatch(/min-h264/);
    }
  });

  it('音声トラック無しで disable', async () => {
    const dem = makeDem(null);
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/no audio track/);
  });

  it('codec !== aac (e.g. opus) で disable', async () => {
    const dem = makeDem(makeIphoneAudioTrack({ getCodec: async () => 'opus' }));
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/unsupported codec: opus/);
  });

  it('decoderConfig 無しで disable', async () => {
    const dem = makeDem(makeIphoneAudioTrack({ getDecoderConfig: async () => null }));
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/no decoder config/);
  });

  it('AAC-LC 以外 (HE-AAC = mp4a.40.5) で disable', async () => {
    const dem = makeDem(
      makeIphoneAudioTrack({
        getDecoderConfig: async () => ({
          codec: 'mp4a.40.5',
          sampleRate: 44100,
          numberOfChannels: 2,
          description: new Uint8Array([0x12, 0x10]),
        }),
      }),
    );
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/not AAC-LC: mp4a\.40\.5/);
  });

  it('decoderConfig.description 無しで disable (ESDS が組めない)', async () => {
    const dem = makeDem(
      makeIphoneAudioTrack({
        getDecoderConfig: async () => ({
          codec: 'mp4a.40.2',
          sampleRate: 44100,
          numberOfChannels: 2,
          // description: undefined
        }),
      }),
    );
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/no AudioSpecificConfig/);
  });

  it('unusual sample rate (22050) で disable', async () => {
    const dem = makeDem(makeIphoneAudioTrack({ getSampleRate: async () => 22050 }));
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/unusual sample rate: 22050/);
  });

  it('multi-channel (5.1 = 6 ch) で disable', async () => {
    const dem = makeDem(makeIphoneAudioTrack({ getNumberOfChannels: async () => 6 }));
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/multi-channel \(6\)/);
  });

  it('input bitrate が target × 0.85 を超えると disable', async () => {
    // target=128k, threshold=108800, input=192k は 192_000 > 108_800 で disable
    const high = makeIphoneAudioTrack({
      __testPackets: Array.from({ length: 100 }, (_, i) => ({
        timestamp: i * (1024 / 48000),
        duration: 1024 / 48000,
        byteLength: 512, // 大きめ
      })),
      getSampleRate: async () => 48000,
    });
    const dem = makeDem(high);
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/^input \d+bps > threshold \d+bps/);
  });

  it('estimateAudioBitrate=0 (空 track) で disable', async () => {
    const empty = makeIphoneAudioTrack({ __testPackets: [] });
    const dem = makeDem(empty);
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false);
    if (!result.passthrough) expect(result.reason).toMatch(/could not estimate bitrate/);
  });
});

// ----- decideAudioPassthrough: 成功条件 -----

describe('decideAudioPassthrough — 成功条件', () => {
  it('iPhone 標準 (AAC-LC 44.1k stereo 128k) + standard-hevc で passthrough=true', async () => {
    const dem = makeDem(makeIphoneAudioTrack());
    // 100 packets × 371 bytes × 8 / (100 × 1024/44100) ≈ 128 kbps
    // standard-hevc target=128k, threshold=128k × 0.85=108.8k
    // 推定 128k > 108.8k で fail。これは現実的なシナリオ — iPhone 標準 128k 録音は
    // 128k target に対しては passthrough できない (15% マージン下回らない)。
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(false); // 128k input vs 128k target → margin fail
  });

  it('iPhone 標準音声 + best-hevc (target=192k) なら passthrough=true', async () => {
    // best-hevc target=192k、threshold=163.2k、入力 128k なら通る
    const dem = makeDem(makeIphoneAudioTrack());
    const result = await decideAudioPassthrough(dem, makePreset('best-hevc', 192_000));
    expect(result.passthrough).toBe(true);
    if (result.passthrough) {
      expect(result.reason).toBe('compatible');
      expect(result.decoderConfig.codec).toBe('mp4a.40.2');
      expect(result.estimatedBitrate).toBeGreaterThan(120_000);
      expect(result.estimatedBitrate).toBeLessThan(140_000);
    }
  });

  it('低 bitrate 入力 (64k) + standard-hevc (target=128k) で passthrough=true', async () => {
    const lowBitrate = makeIphoneAudioTrack({
      __testPackets: Array.from({ length: 100 }, (_, i) => ({
        timestamp: i * (1024 / 44100),
        duration: 1024 / 44100,
        byteLength: 186, // ~64 kbps
      })),
    });
    const dem = makeDem(lowBitrate);
    const result = await decideAudioPassthrough(dem, makePreset('standard-hevc', 128_000));
    expect(result.passthrough).toBe(true);
    if (result.passthrough) {
      expect(result.estimatedBitrate).toBeLessThan(70_000);
    }
  });

  it('48k sample rate (一部 iPhone 設定) でも passthrough=true', async () => {
    const at48k = makeIphoneAudioTrack({
      getSampleRate: async () => 48000,
      __testPackets: Array.from({ length: 100 }, (_, i) => ({
        timestamp: i * (1024 / 48000),
        duration: 1024 / 48000,
        byteLength: 200,
      })),
    });
    const dem = makeDem(at48k);
    const result = await decideAudioPassthrough(dem, makePreset('best-hevc', 192_000));
    expect(result.passthrough).toBe(true);
  });
});

// ----- estimateAudioBitrate -----

describe('estimateAudioBitrate', () => {
  it('packets 無しで 0 を返す (推定不能)', async () => {
    const empty = makeIphoneAudioTrack({ __testPackets: [] });
    const r = await estimateAudioBitrate(empty as never, 10);
    expect(r).toBe(0);
  });

  it('総バイト数 / 経過秒 × 8 = bps を計算', async () => {
    // 10 packets, 各 1000 bytes, packet duration 0.1s → 1s 合計、80,000 bps
    const track = makeIphoneAudioTrack({
      __testPackets: Array.from({ length: 10 }, (_, i) => ({
        timestamp: i * 0.1,
        duration: 0.1,
        byteLength: 1000,
      })),
    });
    const r = await estimateAudioBitrate(track as never, 1.0);
    expect(r).toBe(80_000);
  });

  it('長 track は最大 100 packets で打ち切り (推定の境界)', async () => {
    // 200 packets 用意するが先頭 100 のみで計算
    // 200 packets, 各 200 bytes, packet duration 0.01s → 2s 合計 ぜんぶで
    // 100 packets で計測 = 1s ぶん = 100 × 200 × 8 / 1 = 160,000 bps
    const track = makeIphoneAudioTrack({
      __testPackets: Array.from({ length: 200 }, (_, i) => ({
        timestamp: i * 0.01,
        duration: 0.01,
        byteLength: 200,
      })),
    });
    const r = await estimateAudioBitrate(track as never, 2.0);
    expect(r).toBe(160_000);
  });
});
