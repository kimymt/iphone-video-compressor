// V1.1: SettingsSheet 用 settingsStore のテスト。
//
// - 初期化: localStorage 復元 / 復元値が無効なら default に差し替え
// - setPreset: 即 localStorage 書き込み
// - dismissCameraTip: 即 localStorage 書き込み
// - HEVC 非対応端末で hevc 系プリセットが残っていた場合の cleanup

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useSettingsStore,
  _resetSettingsStoreForTest,
  SETTINGS_STORAGE_KEY,
} from './settingsStore';
import type { EnvCheck } from '../lib/types';
import type { HevcBenchResult } from '../pipeline/hevcBench';

function makeBenchRecord(overrides: Partial<HevcBenchResult> = {}): HevcBenchResult {
  return {
    speedup: 1.8,
    slowdown: false,
    serialMs: 1000,
    parallelMs: 1111,
    ranAt: Date.now(),
    frameCount: 60,
    width: 1280,
    height: 720,
    ...overrides,
  };
}

const HEVC_ENV: EnvCheck = {
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

const H264_ONLY_ENV: EnvCheck = {
  ...HEVC_ENV,
  hevcEncode: false,
};

describe('settingsStore', () => {
  beforeEach(() => {
    _resetSettingsStoreForTest();
  });

  describe('init()', () => {
    it('localStorage が空のとき: HEVC 対応端末は standard-hevc を採用', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      const state = useSettingsStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.preset).toBe('standard-hevc');
      expect(state.cameraTipDismissed).toBe(false);
    });

    it('localStorage が空のとき: HEVC 非対応端末は compat-h264 を採用', () => {
      useSettingsStore.getState().init(H264_ONLY_ENV);
      expect(useSettingsStore.getState().preset).toBe('compat-h264');
    });

    it('localStorage に有効な preset があれば復元する', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ preset: 'light-hevc', cameraTipDismissed: true }),
      );
      useSettingsStore.getState().init(HEVC_ENV);
      const state = useSettingsStore.getState();
      expect(state.preset).toBe('light-hevc');
      expect(state.cameraTipDismissed).toBe(true);
    });

    it('HEVC 非対応端末で hevc 系の preset が残っていれば default に差し替え + 書き戻す', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ preset: 'best-hevc' }),
      );
      useSettingsStore.getState().init(H264_ONLY_ENV);
      expect(useSettingsStore.getState().preset).toBe('compat-h264');

      // 書き戻しが効いている
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.preset).toBe('compat-h264');
    });

    it('壊れた JSON でも例外を出さず default を採用', () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, '{{not json');
      useSettingsStore.getState().init(HEVC_ENV);
      expect(useSettingsStore.getState().preset).toBe('standard-hevc');
    });

    it('未知の preset キーが入っていれば default に差し替え', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ preset: 'unknown-preset' }),
      );
      useSettingsStore.getState().init(HEVC_ENV);
      expect(useSettingsStore.getState().preset).toBe('standard-hevc');
    });

    it('init を 2 回呼んでも 2 回目は no-op', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      useSettingsStore.getState().setPreset('light-hevc');
      // 2 回目は state を上書きしない
      useSettingsStore.getState().init(HEVC_ENV);
      expect(useSettingsStore.getState().preset).toBe('light-hevc');
    });
  });

  describe('setPreset()', () => {
    it('state と localStorage 両方を更新', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      useSettingsStore.getState().setPreset('best-hevc');
      expect(useSettingsStore.getState().preset).toBe('best-hevc');

      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.preset).toBe('best-hevc');
    });

    it('既存の cameraTipDismissed を保存時に保つ', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      useSettingsStore.getState().dismissCameraTip();
      useSettingsStore.getState().setPreset('min-h264');

      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.preset).toBe('min-h264');
      expect(parsed.cameraTipDismissed).toBe(true);
    });
  });

  describe('dismissCameraTip()', () => {
    it('state と localStorage 両方を更新', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      useSettingsStore.getState().dismissCameraTip();
      expect(useSettingsStore.getState().cameraTipDismissed).toBe(true);

      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.cameraTipDismissed).toBe(true);
    });
  });

  describe('V2: setHevcBench()', () => {
    it('state と localStorage 両方を更新', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      expect(useSettingsStore.getState().hevcBench).toBeNull();

      const record = makeBenchRecord({ slowdown: true, speedup: 1.0 });
      useSettingsStore.getState().setHevcBench(record);

      expect(useSettingsStore.getState().hevcBench).toEqual(record);
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(parsed.hevcBench).toEqual(record);
    });

    it('null を渡すとクリア', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      useSettingsStore.getState().setHevcBench(makeBenchRecord());
      useSettingsStore.getState().setHevcBench(null);
      expect(useSettingsStore.getState().hevcBench).toBeNull();
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(parsed.hevcBench).toBeNull();
    });

    it('init() で localStorage から hevcBench record を復元', () => {
      const record = makeBenchRecord({ speedup: 1.4, slowdown: false });
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ preset: 'standard-hevc', hevcBench: record }),
      );
      useSettingsStore.getState().init(HEVC_ENV);
      expect(useSettingsStore.getState().hevcBench).toEqual(record);
    });

    it('壊れた hevcBench record (型違反) は null に正規化', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({
          preset: 'standard-hevc',
          // speedup が文字列 = invalid
          hevcBench: { speedup: 'fast', slowdown: true, serialMs: 1, parallelMs: 1, ranAt: 1, frameCount: 1, width: 1, height: 1 },
        }),
      );
      useSettingsStore.getState().init(HEVC_ENV);
      expect(useSettingsStore.getState().hevcBench).toBeNull();
    });

    it('既存の preset/language を保ったまま hevcBench だけ更新', () => {
      useSettingsStore.getState().init(HEVC_ENV);
      useSettingsStore.getState().setPreset('light-hevc');
      useSettingsStore.getState().setLanguage('en');
      const record = makeBenchRecord({ slowdown: true });
      useSettingsStore.getState().setHevcBench(record);

      const parsed = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
      expect(parsed.preset).toBe('light-hevc');
      expect(parsed.language).toBe('en');
      expect(parsed.hevcBench).toEqual(record);
    });
  });

  describe('localStorage 不在の防御', () => {
    it('localStorage がスローしても init は完走する', () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error('QuotaExceededError');
      };
      try {
        useSettingsStore.getState().init(HEVC_ENV);
        // 例外なく完了して default が反映されている
        expect(useSettingsStore.getState().preset).toBe('standard-hevc');
      } finally {
        Storage.prototype.setItem = original;
      }
    });
  });
});
