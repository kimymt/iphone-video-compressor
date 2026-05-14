// Phase 5: playDoneSound + unlockAudio のユニットテスト。
// Phase 7: 共有 AudioContext (unlock と chime が同じ ctx) を検証。
// jsdom には AudioContext が無いため、Ctor 注入で実体を差し替えて呼び出し順を検証する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playDoneSound,
  unlockAudio,
  _setAudioContextCtorForTest,
  _resetSharedAudioCtxForTest,
} from './audio';

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

class MockBuf {}

class MockBufSrc {
  buffer: MockBuf | null = null;
  connect = vi.fn();
  start = vi.fn();
}

class MockAudioContext {
  state: AudioContextState = 'running';
  currentTime = 1.5;
  destination = {} as AudioNode;
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => undefined);
  createGain = vi.fn(() => new MockGain());
  createOscillator = vi.fn(() => new MockOsc());
  createBuffer = vi.fn((_ch: number, _len: number, _rate: number) => new MockBuf());
  createBufferSource = vi.fn(() => new MockBufSrc());

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

describe('audio: unlockAudio + playDoneSound (共有 ctx)', () => {
  it('AudioContext がなければ unlock も chime も no-op', async () => {
    _setAudioContextCtorForTest(null);
    await expect(unlockAudio()).resolves.toBeUndefined();
    await expect(playDoneSound()).resolves.toBeUndefined();
  });

  it('unlockAudio が AudioContext を生成し 1 サンプル BufferSource を再生', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    await unlockAudio();
    expect(MockAudioContext.instances).toHaveLength(1);
    const ctx = MockAudioContext.instances[0]!;
    expect(ctx.createBuffer).toHaveBeenCalledTimes(1);
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    const src = ctx.createBufferSource.mock.results[0]!.value as MockBufSrc;
    expect(src.start).toHaveBeenCalledTimes(1);
  });

  it('unlock → playDoneSound で AudioContext は 1 インスタンスを共有', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    await unlockAudio();
    await playDoneSound();
    expect(MockAudioContext.instances).toHaveLength(1);
    const ctx = MockAudioContext.instances[0]!;
    // unlock 由来の createBufferSource × 1、chime 由来の createOscillator × 2 と createGain × 1
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
  });

  it('unlock 無しで playDoneSound を呼んでも AudioContext を 1 個だけ生成', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    await playDoneSound();
    expect(MockAudioContext.instances).toHaveLength(1);
  });

  it('複数回 playDoneSound でも 1 インスタンスを再利用 (close されない)', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    await playDoneSound();
    await playDoneSound();
    await playDoneSound();
    expect(MockAudioContext.instances).toHaveLength(1);
    const ctx = MockAudioContext.instances[0]!;
    expect(ctx.close).not.toHaveBeenCalled();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(6); // 3 回 × 2 osc
  });

  it('suspended なら resume を呼んで chime を鳴らす', async () => {
    class SuspendedCtx extends MockAudioContext {
      override state: AudioContextState = 'suspended';
      override resume = vi.fn(async () => {
        this.state = 'running';
      });
    }
    _setAudioContextCtorForTest(SuspendedCtx as unknown as new () => AudioContext);
    await playDoneSound();
    const ctx = SuspendedCtx.instances[0]!;
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('resume しても state=running にならなければ chime はスキップ (gesture 外シナリオ)', async () => {
    class StuckSuspended extends MockAudioContext {
      override state: AudioContextState = 'suspended';
      override resume = vi.fn(async () => {
        // iOS gesture 外: resume() resolve するが state は suspended のまま
      });
    }
    _setAudioContextCtorForTest(StuckSuspended as unknown as new () => AudioContext);
    await playDoneSound();
    const ctx = StuckSuspended.instances[0]!;
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it('chime で 2 本の oscillator (A5 + E6) と envelope gain', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    await playDoneSound();
    const ctx = MockAudioContext.instances[0]!;
    const oscs = ctx.createOscillator.mock.results.map((r) => r.value as MockOsc);
    expect(oscs[0]?.frequency.value).toBe(880); // A5
    expect(oscs[1]?.frequency.value).toBe(1318.5); // E6
    expect(oscs[0]?.start).toHaveBeenCalledTimes(1);
    expect(oscs[0]?.stop).toHaveBeenCalledTimes(1);
    expect(oscs[1]?.start).toHaveBeenCalledTimes(1);
    expect(oscs[1]?.stop).toHaveBeenCalledTimes(1);

    const gain = ctx.createGain.mock.results[0]!.value as MockGain;
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0, 1.5);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('constructor が throw しても unlock/playDoneSound は外に例外を出さない', async () => {
    const ThrowingCtor = vi.fn(() => {
      throw new Error('no audio');
    });
    _setAudioContextCtorForTest(ThrowingCtor as unknown as new () => AudioContext);
    await expect(unlockAudio()).resolves.toBeUndefined();
    await expect(playDoneSound()).resolves.toBeUndefined();
  });

  it('createOscillator が throw しても外に出さない (チャイム失敗はサイレント)', async () => {
    class OscThrowCtx extends MockAudioContext {
      override createOscillator = vi.fn(() => {
        throw new Error('osc unavailable');
      });
    }
    _setAudioContextCtorForTest(OscThrowCtx as unknown as new () => AudioContext);
    await expect(playDoneSound()).resolves.toBeUndefined();
  });

  it('_resetSharedAudioCtxForTest で次の呼び出しは新規 ctx を作る', async () => {
    _setAudioContextCtorForTest(MockAudioContext as unknown as new () => AudioContext);
    await unlockAudio();
    expect(MockAudioContext.instances).toHaveLength(1);
    _resetSharedAudioCtxForTest();
    await unlockAudio();
    expect(MockAudioContext.instances).toHaveLength(2);
  });
});
