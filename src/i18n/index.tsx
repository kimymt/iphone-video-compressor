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
import { zhCN } from './locales/zh-CN';
import { zhTW } from './locales/zh-TW';
import { ko } from './locales/ko';

export type Locale = 'ja' | 'en' | 'zh-CN' | 'zh-TW' | 'ko';
/** 'auto' はユーザ選択値、実 locale 解決後は具体的な Locale になる。 */
export type LocalePreference = Locale | 'auto';

const messages: Record<Locale, Messages> = {
  ja,
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ko,
};

/** localStorage / settingsStore の文字列値を Locale | LocalePreference に正規化する。 */
export function isValidLocale(v: unknown): v is Locale {
  return v === 'ja' || v === 'en' || v === 'zh-CN' || v === 'zh-TW' || v === 'ko';
}
export function isValidLocalePreference(v: unknown): v is LocalePreference {
  return v === 'auto' || isValidLocale(v);
}

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

/**
 * `navigator.languages[]` (BCP-47 順序付きユーザ言語優先リスト) を順に走査して、
 * 最初にマッチした言語を対応 Locale に解決する。
 *
 * 例: iOS の言語と地域で `['de', 'en', 'ja']` の順に設定されているユーザは:
 *   - 'de' は未対応 → skip
 *   - 'en' は対応 → 'en' を返す (ja より en を優先する意図を尊重)
 *
 * 分類規則 (各 candidate に適用):
 *   - 'ja-*' → 'ja'
 *   - 'zh-Hans' / 'zh-CN' / 'zh-SG' / 'zh-MY' → 'zh-CN' (簡体)
 *   - 'zh-Hant' / 'zh-TW' / 'zh-HK' / 'zh-MO' → 'zh-TW' (繁体)
 *   - 'zh' のみ (region なし) → 'zh-CN' default
 *   - 'ko-*' → 'ko'
 *   - 'en-*' → 'en'
 *   - それ以外: 次の candidate へ
 *
 * すべて未マッチなら 'en' fallback。
 * `navigator.languages` が空 / 未定義のときは `navigator.language` のみを candidates に使う。
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const candidates: readonly string[] =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];

  for (const candidate of candidates) {
    const lang = candidate.toLowerCase();
    if (lang.startsWith('ja')) return 'ja';
    if (lang.startsWith('ko')) return 'ko';
    if (lang.startsWith('zh')) {
      // Traditional Chinese 領域 / script
      if (
        lang.startsWith('zh-tw') ||
        lang.startsWith('zh-hk') ||
        lang.startsWith('zh-mo') ||
        lang.includes('hant')
      ) {
        return 'zh-TW';
      }
      // Simplified Chinese (zh-CN / zh-SG / zh-MY / zh-Hans / zh のみ) を default に
      return 'zh-CN';
    }
    // 'en-*' は明示的に match (fallback と区別: 'de' は未対応として次へ進む)
    if (lang.startsWith('en')) return 'en';
    // それ以外の言語 ('de', 'fr', ...) は match せず次の candidate へ
  }
  return 'en';
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

/**
 * `{var}` のプレースホルダを vars[var] で置換。未指定の var はリテラルのまま残す (debug 用)。
 *
 * placeholder は **named-only** ([a-zA-Z][a-zA-Z0-9_]* 形式)。
 * `{0}` / `{1}` のような ICU positional 形式は受け付けない (混乱を避ける)。
 * 翻訳者には `{size}` `{duration}` 等の意味のある名前を強制する。
 */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_, key: string) => {
    return key in vars ? String(vars[key]) : `{${key}}`;
  });
}

/**
 * M4: `*Html` 接尾辞のキーは `dangerouslySetInnerHTML` で raw HTML として描画される想定。
 * vars が渡されると user-controlled input が HTML に注入されて XSS の温床になる。
 *
 * 現状 `cameraTipHtml` / `pwaGuideHtml` は静的文字列のみで呼ばれており実害なしだが、
 * 将来「{user} を埋め込みたい」と思って vars を追加した瞬間に XSS 化するのを防ぐ。
 *
 * dev: throw でビルド時に止める / prod: console.error + raw template を返す (UI が壊れないように)。
 * 戻り値が true なら呼び出し側は vars 無視で raw template を返す。
 */
function rejectHtmlInterpolation(path: string, vars?: Record<string, string | number>): boolean {
  if (vars === undefined) return false;
  if (!path.endsWith('Html')) return false;
  const msg = `i18n: Refusing to interpolate vars into "${path}" (Html-suffixed keys are rendered as raw HTML and must not include user input). Pass no vars, or split into separate non-Html keys + React children.`;
  if (IS_DEV) throw new Error(msg);
  // eslint-disable-next-line no-console
  console.error(msg);
  return true;
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
  // document.title も同様に locale 追従させる ("動画圧縮 — iOS 26+ 専用" / "Video Compressor — iOS 26+ only")
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    const fullTitle = getMessage(messages[locale], 'app.fullTitle');
    if (fullTitle) {
      document.title = fullTitle;
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
      if (rejectHtmlInterpolation(path, vars)) return tmpl;
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
  if (rejectHtmlInterpolation(path, vars)) return tmpl;
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
  if (rejectHtmlInterpolation(path, vars)) return tmpl;
  return interpolate(tmpl, vars);
}

// 型 / 値の再 export (テストや他モジュールから使いやすく)
export { ja, en };
export type { Messages };
