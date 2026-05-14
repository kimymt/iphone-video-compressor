// Phase 5: playDoneSound のユニットテスト。
// jsdom には AudioContext が無いため、Ctor 注入で実体を差し替えて呼び出し順を検証する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playDoneSound, _setAudioContextCtorForTest } from './audio';

class MockGain {
  gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    value: 0,
  };
  connect = vi.fn();
}

class MockOsc {
  type: OscillatorType = 'sine';
  frequency = { value: 0 };
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 1.5;
  destination = {} as AudioNode;
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);
  createGain = vi.fn(() => new MockGain());
  createOscillator = vi.fn(() => new MockOsc());

  static instances: MockAudioContext[] = [];
  constructor() {
    MockAudioContext.instances.push(this);
  }
}

beforeEach(() => {
  MockAudioContext.instances = [];
});

afterEach(() => {
  _setAudioContextCtorForTest(null);
  vi.useRealTimers();
});

describe('playDoneSound', () => {
  it('AudioContext がなければ no-op (jsdom デフォルト)', async () => {
    _setAudioContextCtorForTest(null);
    await expect(playDoneSound()).resolves.toBeUndefined();
  });

  it('AudioContext を生成し oscillator を 2 本 start + stop する', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    vi.useFakeTimers();
    await playDoneSound();
    const ctx = MockAudioContext.instances[0]!;
    expect(MockAudioContext.instances).toHaveLength(1);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    const oscs = ctx.createOscillator.mock.results.map((r) => r.value as MockOsc);
    expect(oscs[0]?.start).toHaveBeenCalledTimes(1);
    expect(oscs[0]?.stop).toHaveBeenCalledTimes(1);
    expect(oscs[1]?.start).toHaveBeenCalledTimes(1);
    expect(oscs[1]?.stop).toHaveBeenCalledTimes(1);
    // 周波数: A5 (880) と E6 (1318.5)
    expect(oscs[0]?.frequency.value).toBe(880);
    expect(oscs[1]?.frequency.value).toBe(1318.5);
  });

  it('suspended なら resume を呼ぶ', async () => {
    class SuspendedCtx extends MockAudioContext {
      override state: AudioContextState = 'suspended';
    }
    _setAudioContextCtorForTest(SuspendedCtx as unknown as new () => AudioContext);
    vi.useFakeTimers();
    await playDoneSound();
    expect(SuspendedCtx.instances[0]?.resume).toHaveBeenCalledTimes(1);
  });

  it('700ms 後に close() で AudioContext を解放', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    vi.useFakeTimers();
    await playDoneSound();
    const ctx = MockAudioContext.instances[0]!;
    expect(ctx.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it('constructor が throw しても例外は外に出さない', async () => {
    const ThrowingCtor = vi.fn(() => {
      throw new Error('no audio');
    });
    _setAudioContextCtorForTest(ThrowingCtor as unknown as new () => AudioContext);
    await expect(playDoneSound()).resolves.toBeUndefined();
  });

  it('createGain が throw したら close を呼んで諦める', async () => {
    class GainThrowCtx extends MockAudioContext {
      override createGain = vi.fn(() => {
        throw new Error('gain unavailable');
      });
    }
    _setAudioContextCtorForTest(GainThrowCtx as unknown as new () => AudioContext);
    await expect(playDoneSound()).resolves.toBeUndefined();
    expect(GainThrowCtx.instances[0]?.close).toHaveBeenCalledTimes(1);
  });

  it('gain.setValueAtTime + linearRampToValueAtTime + exponentialRampToValueAtTime が envelope を組む', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    vi.useFakeTimers();
    await playDoneSound();
    const gain = (MockAudioContext.instances[0]!.createGain.mock.results[0]!.value) as MockGain;
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 1.5);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });
});
