// V1.1: SettingsSheet 用の軽量 Zustand store。
//
// CLAUDE.md「主要モジュール仕様 > src/stores/settingsStore.ts」を参照。
// プリセット選択 / カメラ案内 dismiss / その他 UI 設定を localStorage に永続化する。
//
// なぜ localStorage か:
// - 設定値は同期で読み書きしたい (UI 初期化時に即値が必要)
// - 永続化対象は数 KB 未満で容量問題なし
// - IndexedDB の getSetting/setSetting は async で扱いにくい (hevcBenchSlowdown は
//   queueStore.init() の async ライフサイクル内で扱われているが、UI 設定は別系統)
//
// SSR / Node 環境: localStorage 不在時は安全にメモリ内のデフォルト値で動作する。
// Vitest (jsdom) では localStorage が利用可能。

import { create } from 'zustand';
import type { EnvCheck, PresetKey } from '../lib/types';
import { defaultPresetKey, findPreset } from '../lib/presets';

const STORAGE_KEY = 'iVC.settings.v1';

/** localStorage に保存される最小限の形。バージョンアップは KEY suffix で行う。 */
interface PersistedSettings {
  preset?: PresetKey;
  cameraTipDismissed?: boolean;
}

export interface SettingsState {
  /** 選択中のプリセット。初期化前は null。 */
  preset: PresetKey | null;
  /** カメラ案内 (高効率推奨) を非表示にしたか。 */
  cameraTipDismissed: boolean;
  /** localStorage から復元 + envCheck に応じて default を埋めたか。 */
  initialized: boolean;

  /**
   * 初期化。
   * - localStorage から復元
   * - 復元値が envCheck 的に無効 (例: HEVC 非対応端末で hevc 系プリセット) なら defaultPresetKey に差し替え
   * - preset が未設定なら defaultPresetKey(envCheck) を採用
   */
  init: (envCheck: EnvCheck) => void;

  /** プリセット選択。即 localStorage に保存。 */
  setPreset: (key: PresetKey) => void;

  /** カメラ案内を dismiss。即 localStorage に保存。 */
  dismissCameraTip: () => void;
}

function safeReadStorage(): PersistedSettings {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return {};
    return parsed as PersistedSettings;
  } catch {
    // JSON 壊れ / localStorage アクセス不可は黙って初期化扱い。
    return {};
  }
}

function safeWriteStorage(value: PersistedSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private Browsing や quota exceeded 等。UI 上は無視する。
  }
}

/**
 * 端末で利用可能なプリセットかを判定。
 * HEVC 非対応端末で 'hevc' 系プリセットが localStorage に残っていた場合に false。
 */
function isPresetAvailable(key: PresetKey, envCheck: EnvCheck): boolean {
  const preset = findPreset(key);
  if (preset === null) return false;
  if (preset.codec === 'hevc' && !envCheck.hevcEncode) return false;
  return true;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  preset: null,
  cameraTipDismissed: false,
  initialized: false,

  init(envCheck) {
    if (get().initialized) return;
    const stored = safeReadStorage();

    let preset: PresetKey;
    if (stored.preset !== undefined && isPresetAvailable(stored.preset, envCheck)) {
      preset = stored.preset;
    } else {
      preset = defaultPresetKey(envCheck);
    }

    set({
      preset,
      cameraTipDismissed: stored.cameraTipDismissed === true,
      initialized: true,
    });

    // 復元値がデフォルトに差し替わった場合は localStorage も最新値に揃える
    if (stored.preset !== preset) {
      safeWriteStorage({ preset, cameraTipDismissed: stored.cameraTipDismissed === true });
    }
  },

  setPreset(key) {
    set({ preset: key });
    safeWriteStorage({
      preset: key,
      cameraTipDismissed: get().cameraTipDismissed,
    });
  },

  dismissCameraTip() {
    set({ cameraTipDismissed: true });
    safeWriteStorage({
      preset: get().preset ?? undefined,
      cameraTipDismissed: true,
    });
  },
}));

/** テスト用: store とローカル永続化をリセット。 */
export function _resetSettingsStoreForTest(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  useSettingsStore.setState({
    preset: null,
    cameraTipDismissed: false,
    initialized: false,
  });
}

/** テスト用: 内部の永続化キー (assertion 等で参照したい場合)。 */
export const SETTINGS_STORAGE_KEY = STORAGE_KEY;
