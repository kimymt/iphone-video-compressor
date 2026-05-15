// V1.1: SettingsSheet 用の軽量 Zustand store。
// V2: i18n の language preference を追加 (auto / ja / en)。
//
// CLAUDE.md「主要モジュール仕様 > src/stores/settingsStore.ts」を参照。
// プリセット選択 / カメラ案内 dismiss / 言語選択 を localStorage に永続化する。
//
// なぜ localStorage か:
// - 設定値は同期で読み書きしたい (UI 初期化時に即値が必要、I18nProvider の initialPreference)
// - 永続化対象は数 KB 未満で容量問題なし
// - IndexedDB の getSetting/setSetting は async で扱いにくい
//
// SSR / Node 環境: localStorage 不在時は安全にメモリ内のデフォルト値で動作する。

import { create } from 'zustand';
import type { EnvCheck, PresetKey } from '../lib/types';
import { defaultPresetKey, findPreset } from '../lib/presets';
import type { LocalePreference } from '../i18n';

const STORAGE_KEY = 'iVC.settings.v1';

/** localStorage に保存される最小限の形。バージョンアップは KEY suffix で行う。 */
interface PersistedSettings {
  preset?: PresetKey;
  cameraTipDismissed?: boolean;
  /** V2: 言語選択。未保存なら 'auto' が default。 */
  language?: LocalePreference;
}

export interface SettingsState {
  /** 選択中のプリセット。初期化前は null。 */
  preset: PresetKey | null;
  /** カメラ案内 (高効率推奨) を非表示にしたか。 */
  cameraTipDismissed: boolean;
  /** V2: 言語選択 ('auto' | 'ja' | 'en')。default は 'auto' (デバイス追従)。 */
  language: LocalePreference;
  /** localStorage から復元 + envCheck に応じて default を埋めたか。 */
  initialized: boolean;

  /**
   * 初期化。
   * - localStorage から復元
   * - 復元値が envCheck 的に無効 (例: HEVC 非対応端末で hevc 系プリセット) なら defaultPresetKey に差し替え
   * - preset が未設定なら defaultPresetKey(envCheck) を採用
   * - language が未設定なら 'auto' を採用
   */
  init: (envCheck: EnvCheck) => void;

  /** プリセット選択。即 localStorage に保存。 */
  setPreset: (key: PresetKey) => void;

  /** カメラ案内を dismiss。即 localStorage に保存。 */
  dismissCameraTip: () => void;

  /** V2: 言語選択。即 localStorage に保存。 */
  setLanguage: (lang: LocalePreference) => void;
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

/** V2: 不明な language 値を 'auto' に正規化する。
 *  V2.x: zh-CN / zh-TW / ko を追加サポート。
 *  isValidLocalePreference を再利用すべきだが、型循環を避けるためここでは直書きする
 *  (i18n が settingsStore を import するわけではないので循環は発生しないが、保守上の独立性を優先)。 */
function normalizeLanguage(v: LocalePreference | undefined): LocalePreference {
  if (
    v === 'auto' ||
    v === 'ja' ||
    v === 'en' ||
    v === 'zh-CN' ||
    v === 'zh-TW' ||
    v === 'ko'
  ) {
    return v;
  }
  return 'auto';
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  preset: null,
  cameraTipDismissed: false,
  language: 'auto',
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
    const language = normalizeLanguage(stored.language);

    set({
      preset,
      cameraTipDismissed: stored.cameraTipDismissed === true,
      language,
      initialized: true,
    });

    // 復元値がデフォルトに差し替わった場合は localStorage も最新値に揃える
    if (stored.preset !== preset || stored.language !== language) {
      safeWriteStorage({
        preset,
        cameraTipDismissed: stored.cameraTipDismissed === true,
        language,
      });
    }
  },

  setPreset(key) {
    set({ preset: key });
    safeWriteStorage({
      preset: key,
      cameraTipDismissed: get().cameraTipDismissed,
      language: get().language,
    });
  },

  dismissCameraTip() {
    set({ cameraTipDismissed: true });
    safeWriteStorage({
      preset: get().preset ?? undefined,
      cameraTipDismissed: true,
      language: get().language,
    });
  },

  setLanguage(lang) {
    const normalized = normalizeLanguage(lang);
    set({ language: normalized });
    safeWriteStorage({
      preset: get().preset ?? undefined,
      cameraTipDismissed: get().cameraTipDismissed,
      language: normalized,
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
    language: 'auto',
    initialized: false,
  });
}

/** テスト用: 内部の永続化キー (assertion 等で参照したい場合)。 */
export const SETTINGS_STORAGE_KEY = STORAGE_KEY;
