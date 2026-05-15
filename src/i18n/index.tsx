// V2: 多言語対応 (i18n) のコア。
//
// 設計方針 (TODOS.md「V2: 英語 UI 併記 / i18n 対応」を独自実装で消化):
// - tiny ソリューション (バンドル ~1KB)。react-i18next 等の重量級は導入しない
// - `Messages` 型を ja.ts から推論 → en.ts は satisfies で型整合性が build 時に保証
// - インターポレーション `{var}` だけサポート (ICU plural は ja 不要)
// - locale 判定: navigator.language の先頭 2 文字を見て fallback 'en'
// - 永続化: settingsStore.language ('ja' | 'en' | 'auto')

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ja, type Messages } from './locales/ja';
import { en } from './locales/en';

export type Locale = 'ja' | 'en';
/** 'auto' はユーザ選択値、実 locale 解決後は 'ja' | 'en' になる。 */
export type LocalePreference = Locale | 'auto';

const messages: Record<Locale, Messages> = { ja, en };

export interface I18nContextValue {
  /** 解決後の現在ロケール ('ja' | 'en')。 */
  locale: Locale;
  /** ユーザ選択値 ('ja' | 'en' | 'auto')。表示用 (SettingsSheet)。 */
  preference: LocalePreference;
  setPreference: (p: LocalePreference) => void;
  /**
   * 翻訳取得。
   * 例: `t('app.title')`、`t('error.quotaExceeded', { size: '120 MB' })`
   * 未知キーは dev モードで `[missing: key]`、本番ではキー文字列をそのまま返す (フォールバック)。
   */
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** navigator.language を見て 'ja' or 'en' を返す。'ja' から始まれば 'ja'、それ以外は 'en'。 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined' || !navigator.language) return 'en';
  return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** preference → 実 locale 解決 ('auto' なら navigator から検出)。 */
export function resolveLocale(preference: LocalePreference): Locale {
  return preference === 'auto' ? detectLocale() : preference;
}

/** ドット区切りパスで型のない object から値を取り出す。型は string でなければ undefined。 */
function getMessage(messagesForLocale: Messages, path: string): string | undefined {
  const segments = path.split('.');
  let cursor: unknown = messagesForLocale;
  for (const seg of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return typeof cursor === 'string' ? cursor : undefined;
}

/** `{var}` のプレースホルダを vars[var] で置換。未指定の var はリテラルのまま残す (debug 用)。 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return key in vars ? String(vars[key]) : `{${key}}`;
  });
}

const IS_DEV =
  typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

export interface I18nProviderProps {
  children: ReactNode;
  /** 初期 preference。未指定なら 'auto'。テストで上書き可能。 */
  initialPreference?: LocalePreference;
}

export function I18nProvider({ children, initialPreference = 'auto' }: I18nProviderProps) {
  const [preference, setPreference] = useState<LocalePreference>(initialPreference);
  const [autoLocale, setAutoLocale] = useState<Locale>(() => detectLocale());

  // 'auto' のとき、navigator.language が変わったら再検出。
  // iOS では設定変更でアプリがリロードされるため過剰だが、定石として実装。
  useEffect(() => {
    if (preference !== 'auto') return;
    const updateAuto = () => setAutoLocale(detectLocale());
    window.addEventListener('languagechange', updateAuto);
    return () => window.removeEventListener('languagechange', updateAuto);
  }, [preference]);

  const locale: Locale = preference === 'auto' ? autoLocale : preference;

  // <html lang> を locale に合わせる (SEO + screen reader 向け)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useMemo(() => {
    const localeMessages = messages[locale];
    return (path: string, vars?: Record<string, string | number>): string => {
      const tmpl = getMessage(localeMessages, path);
      if (tmpl === undefined) {
        // 開発: 明示的に missing を可視化。本番: キーをそのまま返す (UI が壊れない)
        return IS_DEV ? `[missing: ${path}]` : path;
      }
      return interpolate(tmpl, vars);
    };
  }, [locale]);

  const value: I18nContextValue = { locale, preference, setPreference, t };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Provider 外でも安全に動くよう、null の場合は default 'ja' context を返す。
 * 主な用途は既存の Vitest コンポーネントテスト (Provider なしで render) との互換性維持。
 * 本番では main.tsx で必ず Provider 配下に置かれる前提だが、defensive に書く。
 */
const FALLBACK_LOCALE: Locale = 'ja';
const fallbackT: I18nContextValue['t'] = (path, vars) => {
  const tmpl = getMessage(messages[FALLBACK_LOCALE], path);
  if (tmpl === undefined) return IS_DEV ? `[missing: ${path}]` : path;
  return interpolate(tmpl, vars);
};
const fallbackContext: I18nContextValue = {
  locale: FALLBACK_LOCALE,
  preference: FALLBACK_LOCALE,
  setPreference: () => undefined,
  t: fallbackT,
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  return ctx ?? fallbackContext;
}

/** よく使う `t` だけ返す軽量フック。 */
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}

/**
 * Provider 外で利用する翻訳ヘルパ。locale を明示指定。
 * 用途: main.tsx の Service Worker onOfflineReady toast のような、
 * React ツリー外からの呼び出し。
 */
export function tForLocale(
  locale: Locale,
  path: string,
  vars?: Record<string, string | number>,
): string {
  const tmpl = getMessage(messages[locale], path);
  if (tmpl === undefined) return IS_DEV ? `[missing: ${path}]` : path;
  return interpolate(tmpl, vars);
}

// 型 / 値の再 export (テストや他モジュールから使いやすく)
export { ja, en };
export type { Messages };
