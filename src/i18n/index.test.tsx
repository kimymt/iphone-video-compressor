// V2: i18n core のテスト。
// - detectLocale / resolveLocale
// - t() の interpolation / fallback / missing key
// - Provider + useT の言語切替

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import {
  I18nProvider,
  useI18n,
  useT,
  detectLocale,
  resolveLocale,
} from './index';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('detectLocale', () => {
  it('navigator.language が ja-* なら ja', () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
    expect(detectLocale()).toBe('ja');
  });

  it('navigator.language が en-US なら en', () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    expect(detectLocale()).toBe('en');
  });

  it('navigator.language が zh-CN なら fallback で en', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    expect(detectLocale()).toBe('en');
  });

  it('navigator.language が空でも en にフォールバック', () => {
    Object.defineProperty(navigator, 'language', { value: '', configurable: true });
    expect(detectLocale()).toBe('en');
  });
});

describe('resolveLocale', () => {
  it("'ja' をそのまま返す", () => {
    expect(resolveLocale('ja')).toBe('ja');
  });

  it("'en' をそのまま返す", () => {
    expect(resolveLocale('en')).toBe('en');
  });

  it("'auto' は detectLocale() の結果", () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
    expect(resolveLocale('auto')).toBe('ja');
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
    expect(resolveLocale('auto')).toBe('en');
  });
});

function Probe({ paths, vars }: { paths: string[]; vars?: Record<string, string | number> }) {
  const t = useT();
  return (
    <ul>
      {paths.map((p) => (
        <li key={p} data-testid={`probe-${p}`}>
          {t(p, vars)}
        </li>
      ))}
    </ul>
  );
}

function LocaleProbe() {
  const { locale, preference } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="preference">{preference}</span>
    </div>
  );
}

describe('Provider + t()', () => {
  it("initialPreference='ja': ja.ts の値を返す", () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe paths={['app.title', 'status.queued']} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-app.title').textContent).toBe('動画圧縮');
    expect(screen.getByTestId('probe-status.queued').textContent).toBe('キュー待ち');
  });

  it("initialPreference='en': en.ts の値を返す", () => {
    render(
      <I18nProvider initialPreference="en">
        <Probe paths={['app.title', 'status.queued', 'status.done']} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-app.title').textContent).toBe('Video Compressor');
    expect(screen.getByTestId('probe-status.queued').textContent).toBe('Queued');
    expect(screen.getByTestId('probe-status.done').textContent).toBe('Done');
  });

  it('interpolation: {var} がプレースホルダ置換', () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe paths={['error.quotaExceeded']} vars={{ size: '120 MB' }} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-error.quotaExceeded').textContent).toBe(
      '容量が足りません。あと約 120 MB 必要です。',
    );
  });

  it('en + interpolation: 英訳でも置換', () => {
    render(
      <I18nProvider initialPreference="en">
        <Probe paths={['error.quotaExceeded']} vars={{ size: '120 MB' }} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-error.quotaExceeded').textContent).toBe(
      'Not enough storage. About 120 MB more is needed.',
    );
  });

  it('未定義の var はリテラルのまま残す (debug)', () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe paths={['error.quotaExceeded']} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-error.quotaExceeded').textContent).toBe(
      '容量が足りません。あと約 {size} 必要です。',
    );
  });

  it('深いキー (preset.standard-hevc.label) も引ける', () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe paths={['preset.standard-hevc.label', 'preset.standard-hevc.description']} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-preset.standard-hevc.label').textContent).toBe('標準 (HEVC)');
    expect(screen.getByTestId('probe-preset.standard-hevc.description').textContent).toBe(
      '長辺 1080px、3 Mbps / 128 kbps（既定）',
    );
  });

  it('未知キーは [missing: ...] (dev) もしくはキー文字列 (prod) を返す — UI を壊さない', () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe paths={['nonexistent.key']} />
      </I18nProvider>,
    );
    const text = screen.getByTestId('probe-nonexistent.key').textContent ?? '';
    // dev / prod どちらでも空文字や undefined にはならない
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/nonexistent\.key/);
  });

  it("setPreference で言語を切り替えできる ('ja' → 'en')", () => {
    function App() {
      const { locale, setPreference } = useI18n();
      const t = useT();
      return (
        <div>
          <span data-testid="loc">{locale}</span>
          <span data-testid="title">{t('app.title')}</span>
          <button data-testid="to-en" type="button" onClick={() => setPreference('en')}>
            EN
          </button>
        </div>
      );
    }
    render(
      <I18nProvider initialPreference="ja">
        <App />
      </I18nProvider>,
    );
    expect(screen.getByTestId('loc').textContent).toBe('ja');
    expect(screen.getByTestId('title').textContent).toBe('動画圧縮');
    act(() => {
      screen.getByTestId('to-en').click();
    });
    expect(screen.getByTestId('loc').textContent).toBe('en');
    expect(screen.getByTestId('title').textContent).toBe('Video Compressor');
  });

  it("preference='auto' の場合 navigator.language で解決", () => {
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
    render(
      <I18nProvider initialPreference="auto">
        <LocaleProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('preference').textContent).toBe('auto');
    expect(screen.getByTestId('locale').textContent).toBe('ja');
  });

  it('Provider 外で useI18n を呼ぶと ja fallback を返す (既存テスト互換)', () => {
    function NoProvider() {
      const { locale, t } = useI18n();
      return (
        <div>
          <span data-testid="loc">{locale}</span>
          <span data-testid="title">{t('app.title')}</span>
        </div>
      );
    }
    render(<NoProvider />);
    expect(screen.getByTestId('loc').textContent).toBe('ja');
    expect(screen.getByTestId('title').textContent).toBe('動画圧縮');
  });

  it('locale 変更で <html lang> が更新される', () => {
    function App() {
      const { setPreference } = useI18n();
      return (
        <button data-testid="to-en" type="button" onClick={() => setPreference('en')}>
          en
        </button>
      );
    }
    render(
      <I18nProvider initialPreference="ja">
        <App />
      </I18nProvider>,
    );
    expect(document.documentElement.lang).toBe('ja');
    act(() => {
      screen.getByTestId('to-en').click();
    });
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('Messages 型整合性', () => {
  it("en.ts は Messages 型を満たす (TS の satisfies で build 時に保証されているはずだが runtime も確認)", async () => {
    const ja = await import('./locales/ja');
    const en = await import('./locales/en');
    // ja のキー集合と en のキー集合が一致することを確認 (深いキーも見る)
    function flatten(obj: unknown, prefix = ''): string[] {
      if (obj === null || typeof obj !== 'object') return [prefix];
      const out: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object') out.push(...flatten(v, key));
        else out.push(key);
      }
      return out;
    }
    const jaKeys = flatten(ja.ja).sort();
    const enKeys = flatten(en.en).sort();
    expect(enKeys).toEqual(jaKeys);
  });
});

