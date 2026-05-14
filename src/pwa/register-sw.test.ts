// Phase 6: registerAppServiceWorker のユニットテスト。
// virtual:pwa-register の解決は vite ランタイム時のみ可能なので、
// registerSW 関数を引数として受け取る形を取り、ここでは mock を渡す。

import { describe, it, expect, vi } from 'vitest';
import { registerAppServiceWorker, type RegisterSWFn } from './register-sw';

describe('registerAppServiceWorker', () => {
  it('registerSW に immediate=true を渡す', () => {
    const mock: RegisterSWFn = vi.fn(() => async () => undefined);
    registerAppServiceWorker(mock);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock).toHaveBeenCalledWith(
      expect.objectContaining({ immediate: true }),
    );
  });

  it('onOfflineReady / onNeedRefresh を forward する', () => {
    const onOfflineReady = vi.fn();
    const onNeedRefresh = vi.fn();
    const mock: RegisterSWFn = vi.fn((opts) => {
      opts.onOfflineReady?.();
      opts.onNeedRefresh?.();
      return async () => undefined;
    });
    registerAppServiceWorker(mock, { onOfflineReady, onNeedRefresh });
    expect(onOfflineReady).toHaveBeenCalledTimes(1);
    expect(onNeedRefresh).toHaveBeenCalledTimes(1);
  });

  it('onRegisterError は console.warn + onError を呼ぶ', () => {
    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mock: RegisterSWFn = vi.fn((opts) => {
      opts.onRegisterError?.(new Error('boom'));
      return async () => undefined;
    });
    registerAppServiceWorker(mock, { onError });
    expect(warnSpy).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    warnSpy.mockRestore();
  });

  it('戻り値は registerSW が返した updateSW 関数', async () => {
    const updateSW = vi.fn(async () => undefined);
    const mock: RegisterSWFn = vi.fn(() => updateSW);
    const result = registerAppServiceWorker(mock);
    expect(result).toBe(updateSW);
    await result(true);
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('onError を渡さない場合でも console.warn は呼ばれる (例外を握り潰す)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mock: RegisterSWFn = vi.fn((opts) => {
      opts.onRegisterError?.(new Error('x'));
      return async () => undefined;
    });
    expect(() => registerAppServiceWorker(mock)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
