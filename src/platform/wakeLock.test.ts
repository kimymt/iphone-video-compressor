// Phase 5: WakeLockManager のユニットテスト。
// constructor 注入で WakeLockApiLike / Document を mock し、状態遷移を検証する。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WakeLockManager,
  type WakeLockApiLike,
  type WakeLockSentinelLike,
} from './wakeLock';

class MockSentinel implements WakeLockSentinelLike {
  released = false;
  releaseSpy = vi.fn();
  private releaseListeners: Array<() => void> = [];

  async release(): Promise<void> {
    this.releaseSpy();
    if (this.released) return;
    this.released = true;
    for (const l of this.releaseListeners) l();
  }

  addEventListener(_type: 'release', listener: () => void): void {
    this.releaseListeners.push(listener);
  }

  /** テスト用: システム由来の release (visibility=hidden 等) をシミュレート。 */
  simulateSystemRelease(): void {
    if (this.released) return;
    this.released = true;
    for (const l of this.releaseListeners) l();
  }
}

class MockWakeLockApi implements WakeLockApiLike {
  sentinels: MockSentinel[] = [];
  requestSpy = vi.fn();
  rejectNext: Error | null = null;

  async request(_type: 'screen'): Promise<WakeLockSentinelLike> {
    this.requestSpy();
    if (this.rejectNext) {
      const err = this.rejectNext;
      this.rejectNext = null;
      throw err;
    }
    const s = new MockSentinel();
    this.sentinels.push(s);
    return s;
  }
}

/** visibilityState を変更しつつ visibilitychange イベントを dispatch。 */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('WakeLockManager', () => {
  let api: MockWakeLockApi;

  beforeEach(() => {
    api = new MockWakeLockApi();
    // jsdom デフォルトは 'visible'
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  it('acquire() で navigator.wakeLock.request("screen") を呼び isActive=true', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    expect(mgr.isActive()).toBe(false);
    await mgr.acquire();
    expect(api.requestSpy).toHaveBeenCalledTimes(1);
    expect(mgr.isActive()).toBe(true);
  });

  it('release() で lock を release し isActive=false', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await mgr.acquire();
    await mgr.release();
    expect(api.sentinels[0]?.releaseSpy).toHaveBeenCalledTimes(1);
    expect(mgr.isActive()).toBe(false);
  });

  it('navigator.wakeLock がない (null) と acquire は no-op で isActive=false のまま', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: null });
    await mgr.acquire();
    expect(mgr.isActive()).toBe(false);
  });

  it('request が reject しても例外を握り潰し isActive=false', async () => {
    api.rejectNext = new Error('NotAllowedError');
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await expect(mgr.acquire()).resolves.toBeUndefined();
    expect(mgr.isActive()).toBe(false);
  });

  it('visibility=hidden で lock が自動 release されたあと visible に戻ると再取得', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await mgr.acquire();
    expect(mgr.isActive()).toBe(true);

    // システムが release (iOS Safari 挙動シミュレーション)
    api.sentinels[0]!.simulateSystemRelease();
    expect(mgr.isActive()).toBe(false);

    // visible に戻ったら visibilitychange で再取得
    setVisibility('hidden');
    setVisibility('visible');
    // requestLock は非同期。マイクロタスクを進める。
    await new Promise((r) => setTimeout(r, 0));
    expect(api.requestSpy).toHaveBeenCalledTimes(2);
    expect(mgr.isActive()).toBe(true);
  });

  it('release() 後の visibilitychange は再取得しない', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await mgr.acquire();
    await mgr.release();
    setVisibility('hidden');
    setVisibility('visible');
    await new Promise((r) => setTimeout(r, 0));
    expect(api.requestSpy).toHaveBeenCalledTimes(1); // 初回のみ
  });

  it('acquire が二度呼ばれても visibilitychange リスナーは 1 つだけ', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await mgr.acquire();
    await mgr.acquire(); // 二度目: lock が既に有効なので request は呼ばない
    expect(api.requestSpy).toHaveBeenCalledTimes(1);
    expect(mgr._debugState().hasHandler).toBe(true);
  });

  it('acquire 中に release() が呼ばれたら取得した lock を即解放', async () => {
    // request の解決を遅らせる
    let resolveRequest: ((s: WakeLockSentinelLike) => void) | undefined;
    const slowSentinel = new MockSentinel();
    api.request = vi.fn(() => {
      return new Promise<WakeLockSentinelLike>((resolve) => {
        resolveRequest = resolve;
      });
    });
    const mgr = new WakeLockManager({ wakeLockApi: api });
    const p = mgr.acquire();
    // release を先に走らせる
    await mgr.release();
    // request を解決
    resolveRequest?.(slowSentinel);
    await p;
    expect(mgr.isActive()).toBe(false);
    expect(slowSentinel.releaseSpy).toHaveBeenCalledTimes(1);
  });

  it('release() で visibilitychange リスナーが外れる', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await mgr.acquire();
    expect(mgr._debugState().hasHandler).toBe(true);
    await mgr.release();
    expect(mgr._debugState().hasHandler).toBe(false);
    // visibilitychange を投げても requestLock は呼ばれない (handler 削除済み)
    setVisibility('hidden');
    setVisibility('visible');
    await new Promise((r) => setTimeout(r, 0));
    expect(api.requestSpy).toHaveBeenCalledTimes(1);
  });

  it('isActive はシステム release 後 false', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: api });
    await mgr.acquire();
    api.sentinels[0]!.simulateSystemRelease();
    expect(mgr.isActive()).toBe(false);
  });

  describe('onChange (Phase 7 post-v0.9.0)', () => {
    it('acquire 成功で listener(true) が呼ばれる', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const listener = vi.fn();
      mgr.onChange(listener);
      await mgr.acquire();
      expect(listener).toHaveBeenCalledWith(true);
    });

    it('release で listener(false) が呼ばれる', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const listener = vi.fn();
      await mgr.acquire();
      mgr.onChange(listener);
      await mgr.release();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('システム由来 release でも listener(false)', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const listener = vi.fn();
      await mgr.acquire();
      mgr.onChange(listener);
      api.sentinels[0]!.simulateSystemRelease();
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('visibility=visible での再取得成功でも listener(true) が再度呼ばれる', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const listener = vi.fn();
      await mgr.acquire();
      mgr.onChange(listener);
      api.sentinels[0]!.simulateSystemRelease();
      setVisibility('hidden');
      setVisibility('visible');
      await new Promise((r) => setTimeout(r, 0));
      // システム release → false、再取得 → true の 2 回
      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener.mock.calls[0]?.[0]).toBe(false);
      expect(listener.mock.calls[1]?.[0]).toBe(true);
    });

    it('unsubscribe 戻り値で以降の通知を止められる', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const listener = vi.fn();
      const unsub = mgr.onChange(listener);
      await mgr.acquire();
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
      await mgr.release();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('acquire 失敗時も listener が呼ばれる (active=false、Indicator が lastError を再読込できるよう)', async () => {
      api.rejectNext = new Error('NotAllowedError');
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const listener = vi.fn();
      mgr.onChange(listener);
      await mgr.acquire();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(false);
      expect(mgr.getLastError()?.name).toBe('Error');
    });

    it('listener が throw しても他の listener と本体ロジックは止まらない', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      const badListener = vi.fn(() => {
        throw new Error('listener bug');
      });
      const goodListener = vi.fn();
      mgr.onChange(badListener);
      mgr.onChange(goodListener);
      await expect(mgr.acquire()).resolves.toBeUndefined();
      expect(badListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLastError (Phase 7 post-v0.9.0 診断用)', () => {
    it('初期状態で null', () => {
      const mgr = new WakeLockManager({ wakeLockApi: api });
      expect(mgr.getLastError()).toBeNull();
    });

    it('wakeLockApi が null なら NotSupported を返す', async () => {
      const mgr = new WakeLockManager({ wakeLockApi: null });
      await mgr.acquire();
      const err = mgr.getLastError();
      expect(err?.name).toBe('NotSupported');
      expect(err?.message).toMatch(/navigator\.wakeLock/);
    });

    it('request が DOMException を投げたら name と message を捕捉', async () => {
      api.rejectNext = Object.assign(new Error('user gesture missing'), {
        name: 'NotAllowedError',
      });
      const mgr = new WakeLockManager({ wakeLockApi: api });
      await mgr.acquire();
      const err = mgr.getLastError();
      expect(err?.name).toBe('NotAllowedError');
      expect(err?.message).toBe('user gesture missing');
    });

    it('acquire 成功で lastError が null にクリアされる', async () => {
      api.rejectNext = Object.assign(new Error('boom'), { name: 'NotAllowedError' });
      const mgr = new WakeLockManager({ wakeLockApi: api });
      await mgr.acquire();
      expect(mgr.getLastError()).not.toBeNull();
      // 次回の acquire は成功
      await mgr.acquire();
      expect(mgr.getLastError()).toBeNull();
    });

    it('release で lastError がクリアされる', async () => {
      api.rejectNext = Object.assign(new Error('boom'), { name: 'NotAllowedError' });
      const mgr = new WakeLockManager({ wakeLockApi: api });
      await mgr.acquire();
      expect(mgr.getLastError()).not.toBeNull();
      await mgr.release();
      expect(mgr.getLastError()).toBeNull();
    });

    it('Error 以外を投げても UnknownError 名で記録', async () => {
      api.request = vi.fn(async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'string error';
      });
      const mgr = new WakeLockManager({ wakeLockApi: api });
      await mgr.acquire();
      const err = mgr.getLastError();
      expect(err?.name).toBe('UnknownError');
      expect(err?.message).toBe('string error');
    });
  });
});
