import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensurePersistent, getStorageInfo, hasEnoughQuota } from './storage';

function stubNavigatorStorage(impl: Partial<StorageManager>) {
  vi.stubGlobal('navigator', { storage: impl });
}

describe('storage.ts', () => {
  beforeEach(() => {
    // 各テストで navigator を新しく stub
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ensurePersistent', () => {
    it('persist() が true を返す → true', async () => {
      stubNavigatorStorage({ persist: () => Promise.resolve(true) });
      expect(await ensurePersistent()).toBe(true);
    });

    it('persist() が false を返す → false', async () => {
      stubNavigatorStorage({ persist: () => Promise.resolve(false) });
      expect(await ensurePersistent()).toBe(false);
    });

    it('persist() が reject → false (例外を投げない)', async () => {
      stubNavigatorStorage({ persist: () => Promise.reject(new Error('denied')) });
      expect(await ensurePersistent()).toBe(false);
    });

    it('navigator.storage 未対応 → false', async () => {
      vi.stubGlobal('navigator', {});
      expect(await ensurePersistent()).toBe(false);
    });
  });

  describe('getStorageInfo', () => {
    it('estimate の usage/quota から available を算出', async () => {
      stubNavigatorStorage({
        estimate: () => Promise.resolve({ usage: 1_000_000, quota: 10_000_000 }),
      });
      const info = await getStorageInfo();
      expect(info.usage).toBe(1_000_000);
      expect(info.quota).toBe(10_000_000);
      expect(info.available).toBe(9_000_000);
    });

    it('usage > quota (異常系) → available=0', async () => {
      stubNavigatorStorage({
        estimate: () => Promise.resolve({ usage: 11_000_000, quota: 10_000_000 }),
      });
      const info = await getStorageInfo();
      expect(info.available).toBe(0);
    });

    it('estimate が reject → 全 0', async () => {
      stubNavigatorStorage({ estimate: () => Promise.reject(new Error('x')) });
      const info = await getStorageInfo();
      expect(info).toEqual({ usage: 0, quota: 0, available: 0 });
    });

    it('navigator.storage 未対応 → 全 0', async () => {
      vi.stubGlobal('navigator', {});
      expect(await getStorageInfo()).toEqual({ usage: 0, quota: 0, available: 0 });
    });
  });

  describe('hasEnoughQuota', () => {
    it('入力 × 2.5 < available → true', async () => {
      // 100MB ファイル、available 500MB → 100*2.5=250MB < 500MB → true
      stubNavigatorStorage({
        estimate: () =>
          Promise.resolve({ usage: 0, quota: 500 * 1024 * 1024 }),
      });
      expect(await hasEnoughQuota(100 * 1024 * 1024)).toBe(true);
    });

    it('入力 × 2.5 > available → false', async () => {
      // 200MB ファイル、available 400MB → 200*2.5=500MB > 400MB → false
      stubNavigatorStorage({
        estimate: () =>
          Promise.resolve({ usage: 0, quota: 400 * 1024 * 1024 }),
      });
      expect(await hasEnoughQuota(200 * 1024 * 1024)).toBe(false);
    });

    it('境界: 入力 × 2.5 === available → false (厳密 < のため)', async () => {
      stubNavigatorStorage({
        estimate: () => Promise.resolve({ usage: 0, quota: 250 }),
      });
      expect(await hasEnoughQuota(100)).toBe(false);
    });

    it('quota が取得不能 (0) → true (試行を許容)', async () => {
      stubNavigatorStorage({
        estimate: () => Promise.resolve({ usage: 0, quota: 0 }),
      });
      expect(await hasEnoughQuota(100 * 1024 * 1024)).toBe(true);
    });
  });
});
