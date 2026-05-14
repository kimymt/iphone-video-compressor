import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyEnvironment } from './capability';

// JSDOM には VideoEncoder/AudioEncoder/navigator.wakeLock/OPFS が存在しないため、
// 各テストで `vi.stubGlobal` を使って必要な API を擬似する。
// テスト終了時に `vi.unstubAllGlobals()` で完全に剥がす。

function setLocation(href: string) {
  // location.search を JSDOM 上で書き換える。
  // window.location は readonly なため、location.assign の代わりに history を使う。
  const url = new URL(href, 'http://localhost/');
  window.history.replaceState({}, '', url.pathname + url.search);
}

function stubFullyCapable() {
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
  });
  vi.stubGlobal('AudioEncoder', class {});
  vi.stubGlobal('navigator', {
    canShare: () => true,
    wakeLock: { request: vi.fn() },
    storage: {
      getDirectory: vi.fn(),
      persist: vi.fn(),
    },
  });
}

describe('verifyEnvironment', () => {
  beforeEach(() => {
    setLocation('/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setLocation('/');
  });

  it('全 API 揃い HEVC/H.264 両方サポート → canRun=true、hevcEncode=true', async () => {
    stubFullyCapable();
    const result = await verifyEnvironment();
    expect(result.canRun).toBe(true);
    expect(result.hevcEncode).toBe(true);
    expect(result.h264Encode).toBe(true);
    expect(result.audioEncoder).toBe(true);
    expect(result.videoEncoder).toBe(true);
    expect(result.webShareFiles).toBe(true);
    expect(result.wakeLock).toBe(true);
    expect(result.opfs).toBe(true);
    expect(result.persistentStorage).toBe(true);
  });

  it('VideoEncoder が未定義 → canRun=false', async () => {
    // VideoEncoder/AudioEncoder どちらも未定義
    vi.stubGlobal('navigator', { storage: {} });
    const result = await verifyEnvironment();
    expect(result.videoEncoder).toBe(false);
    expect(result.audioEncoder).toBe(false);
    expect(result.canRun).toBe(false);
    expect(result.hevcEncode).toBe(false);
    expect(result.h264Encode).toBe(false);
  });

  it('AudioEncoder のみ未定義 → canRun=false (iOS 17-18.7 シナリオ)', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    });
    // AudioEncoder は意図的に stub しない
    vi.stubGlobal('navigator', { storage: {} });
    const result = await verifyEnvironment();
    expect(result.videoEncoder).toBe(true);
    expect(result.audioEncoder).toBe(false);
    expect(result.canRun).toBe(false); // AudioEncoder 必須
  });

  it('HEVC isConfigSupported が例外を投げる → hevcEncode=false、canRun は H.264 次第', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockImplementation((cfg: VideoEncoderConfig) => {
        if (cfg.codec.startsWith('hvc1')) throw new Error('codec not implemented');
        return Promise.resolve({ supported: true });
      }),
    });
    vi.stubGlobal('AudioEncoder', class {});
    vi.stubGlobal('navigator', {
      canShare: () => true,
      wakeLock: {},
      storage: { getDirectory: vi.fn(), persist: vi.fn() },
    });
    const result = await verifyEnvironment();
    expect(result.hevcEncode).toBe(false);
    expect(result.h264Encode).toBe(true);
    expect(result.canRun).toBe(true);
  });

  it('HEVC supported=false (旧 iPad など) → hevcEncode=false、canRun=true', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockImplementation((cfg: VideoEncoderConfig) => {
        if (cfg.codec.startsWith('hvc1')) return Promise.resolve({ supported: false });
        return Promise.resolve({ supported: true });
      }),
    });
    vi.stubGlobal('AudioEncoder', class {});
    vi.stubGlobal('navigator', {
      canShare: () => true,
      wakeLock: {},
      storage: { getDirectory: vi.fn(), persist: vi.fn() },
    });
    const result = await verifyEnvironment();
    expect(result.hevcEncode).toBe(false);
    expect(result.h264Encode).toBe(true);
    expect(result.canRun).toBe(true);
  });

  it('OPFS / wakeLock 欠如でも canRun には影響しない (UI で警告)', async () => {
    vi.stubGlobal('VideoEncoder', {
      isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
    });
    vi.stubGlobal('AudioEncoder', class {});
    vi.stubGlobal('navigator', {});
    const result = await verifyEnvironment();
    expect(result.opfs).toBe(false);
    expect(result.wakeLock).toBe(false);
    expect(result.persistentStorage).toBe(false);
    expect(result.webShareFiles).toBe(false);
    // canRun は VideoEncoder + AudioEncoder + h264Encode の AND
    expect(result.canRun).toBe(true);
  });

  it('?dev=1 クエリで全 capability を true に強制 (macOS 開発用)', async () => {
    setLocation('/?dev=1');
    // 何も stub しない状態でも dev override で true
    const result = await verifyEnvironment();
    expect(result.canRun).toBe(true);
    expect(result.videoEncoder).toBe(true);
    expect(result.audioEncoder).toBe(true);
    expect(result.hevcEncode).toBe(true);
    expect(result.h264Encode).toBe(true);
  });

  it('?dev=0 は override しない (1 のみが許容)', async () => {
    setLocation('/?dev=0');
    vi.stubGlobal('navigator', {});
    const result = await verifyEnvironment();
    expect(result.canRun).toBe(false);
  });

  it('?dev=1 が他のクエリと混ざっても override (?foo=bar&dev=1)', async () => {
    setLocation('/?foo=bar&dev=1');
    const result = await verifyEnvironment();
    expect(result.canRun).toBe(true);
  });
});
