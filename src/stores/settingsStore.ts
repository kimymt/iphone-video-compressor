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
import { isValidLocalePreference, type LocalePreference } from '../i18n';
import type { HevcBenchResult } from '../pipeline/hevcBench';

const STORAGE_KEY = 'iVC.settings.v1';

/** localStorage に保存される最小限の形。バージョンアップは KEY suffix で行う。 */
interface PersistedSettings {
  preset?: PresetKey;
  cameraTipDismissed?: boolean;
  /** V2: 言語選択。未保存なら 'auto' が default。 */
  language?: LocalePreference;
  /** V2: HEVC 並列ベンチマーク結果。null = 未実行。
   *  queueStore.hevcBenchSlowdown は本値の slowdown を反映する (orchestrator が両者を更新)。 */
  hevcBench?: HevcBenchResult | null;
}

export interface SettingsState {
  /** 選択中のプリセット。初期化前は null。 */
  preset: PresetKey | null;
  /** カメラ案内 (高効率推奨) を非表示にしたか。 */
  cameraTipDismissed: boolean;
  /** V2: 言語選択 ('auto' | 'ja' | 'en')。default は 'auto' (デバイス追従)。 */
  language: LocalePreference;
  /** V2: HEVC 並列ベンチマーク結果。null = 未実行。
   *  - SettingsSheet で「最終実行」「speedup x.xx」「並列度: 1 / 2」を表示する
   *  - queueStore.hevcBenchSlowdown は本値の `slowdown` フィールドを反映する
   *  - 90 日以上経過したら shouldRunBench() が true を返し、auto-trigger される */
  hevcBench: HevcBenchResult | null;
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

  /** V2: HEVC ベンチマーク結果を保存。orchestrator (runAndPersistHevcBench)
   *  が呼び出して localStorage に rich record を永続化する。
   *  null を渡すと結果をクリア (Settings の「リセット」用途、現在は未使用)。 */
  setHevcBench: (result: HevcBenchResult | null) => void;
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
 *  i18n の単一の真実源 `isValidLocalePreference` を再利用する (旧実装は同じ列挙を別々に
 *  管理していて Locale 追加のたびに 2 箇所同期が必要だった)。 */
function normalizeLanguage(v: unknown): LocalePreference {
  return isValidLocalePreference(v) ? v : 'auto';
}

/** HEVC bench record の shape を粗くチェック。localStorage 起源の壊れたデータを弾く。
 *  値域は雑にチェック (NaN や負数を弾く程度、厳密 schema validation はしない)。 */
function isValidHevcBench(v: unknown): v is HevcBenchResult {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.speedup === 'number' && Number.isFinite(o.speedup) && o.speedup >= 0 &&
    typeof o.slowdown === 'boolean' &&
    typeof o.serialMs === 'number' && Number.isFinite(o.serialMs) && o.serialMs >= 0 &&
    typeof o.parallelMs === 'number' && Number.isFinite(o.parallelMs) && o.parallelMs >= 0 &&
    typeof o.ranAt === 'number' && Number.isFinite(o.ranAt) && o.ranAt > 0 &&
    typeof o.frameCount === 'number' && Number.isInteger(o.frameCount) && o.frameCount > 0 &&
    typeof o.width === 'number' && Number.isInteger(o.width) && o.width > 0 &&
    typeof o.height === 'number' && Number.isInteger(o.height) && o.height > 0
  );
}

/** V2.x MINOR #4: 現在の state を localStorage 形式に変換する helper。
 *  旧実装は 4 箇所 (init / setPreset / dismissCameraTip / setLanguage) で
 *  同じ 3-field literal を repeat していて、新 field 追加時にずれる risk があった。
 *  V2: hevcBench を追加。 */
function currentPersisted(
  state: Pick<SettingsState, 'preset' | 'cameraTipDismissed' | 'language' | 'hevcBench'>,
): PersistedSettings {
  return {
    preset: state.preset ?? undefined,
    cameraTipDismissed: state.cameraTipDismissed,
    language: state.language,
    hevcBench: state.hevcBench,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  preset: null,
  cameraTipDismissed: false,
  language: 'auto',
  hevcBench: null,
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
    const hevcBench =
      stored.hevcBench !== undefined && isValidHevcBench(stored.hevcBench)
        ? stored.hevcBench
        : null;

    set({
      preset,
      cameraTipDismissed: stored.cameraTipDismissed === true,
      language,
      hevcBench,
      initialized: true,
    });

    // 復元値がデフォルトに差し替わった場合は localStorage も最新値に揃える
    if (stored.preset !== preset || stored.language !== language) {
      safeWriteStorage(currentPersisted({
        preset,
        cameraTipDismissed: stored.cameraTipDismissed === true,
        language,
        hevcBench,
      }));
    }
  },

  setPreset(key) {
    set({ preset: key });
    safeWriteStorage(currentPersisted(get()));
  },

  dismissCameraTip() {
    set({ cameraTipDismissed: true });
    safeWriteStorage(currentPersisted(get()));
  },

  setLanguage(lang) {
    const normalized = normalizeLanguage(lang);
    set({ language: normalized });
    safeWriteStorage(currentPersisted(get()));
  },

  setHevcBench(result) {
    set({ hevcBench: result });
    safeWriteStorage(currentPersisted(get()));
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
    hevcBench: null,
    initialized: false,
  });
}

/** テスト用: 内部の永続化キー (assertion 等で参照したい場合)。 */
export const SETTINGS_STORAGE_KEY = STORAGE_KEY;
