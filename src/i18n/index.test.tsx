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

  it('navigator.language が ko-KR なら ko', () => {
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    expect(detectLocale()).toBe('ko');
  });

  it('navigator.language が zh-CN なら zh-CN (簡体)', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    expect(detectLocale()).toBe('zh-CN');
  });

  it('navigator.language が zh-Hans-* なら zh-CN', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-Hans-CN', configurable: true });
    expect(detectLocale()).toBe('zh-CN');
  });

  it('navigator.language が zh-TW なら zh-TW (繁体)', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-TW', configurable: true });
    expect(detectLocale()).toBe('zh-TW');
  });

  it('navigator.language が zh-HK なら zh-TW (香港 → 繁体)', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-HK', configurable: true });
    expect(detectLocale()).toBe('zh-TW');
  });

  it('navigator.language が zh-Hant-* なら zh-TW', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-Hant-TW', configurable: true });
    expect(detectLocale()).toBe('zh-TW');
  });

  it('navigator.language が zh (region なし) なら zh-CN default', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh', configurable: true });
    expect(detectLocale()).toBe('zh-CN');
  });

  it('navigator.language が fr-FR なら en fallback', () => {
    Object.defineProperty(navigator, 'language', { value: 'fr-FR', configurable: true });
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

describe('M4: rejectHtmlInterpolation guard (XSS 予防)', () => {
  // 旧実装は cameraTipHtml / pwaGuideHtml を dangerouslySetInnerHTML で描画していたが、
  // interpolate() が vars を受け取って string-replace するため、将来 user input が
  // vars に混ざる PR が出た瞬間 XSS 化する設計穴があった。
  // ガードは *Html 接尾辞のキーに vars が渡されたら dev で throw、prod で raw 返却。

  it('Html 接尾辞 + vars: dev (vitest run = DEV) では throw', () => {
    function Throws() {
      const t = useT();
      // 故意に Html キーに vars を渡す → ガードが throw
      expect(() => t('settings.cameraTipHtml', { user: 'EVIL<script>' })).toThrow(
        /Refusing to interpolate vars/,
      );
      return null;
    }
    render(
      <I18nProvider initialPreference="ja">
        <Throws />
      </I18nProvider>,
    );
  });

  it('Html 接尾辞 + vars 無し: 通常通り raw template を返す (`<strong>` 含む)', () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe paths={['settings.cameraTipHtml']} />
      </I18nProvider>,
    );
    const text = screen.getByTestId('probe-settings.cameraTipHtml').textContent ?? '';
    expect(text).toContain('<strong>');
    expect(text).toContain('高効率');
  });

  it('非 Html キー + vars: 通常通り補間する (regression 防止)', () => {
    render(
      <I18nProvider initialPreference="ja">
        <Probe
          paths={['status.processing']}
          vars={{ size: '120 MB', duration: '残り 30 秒' }}
        />
      </I18nProvider>,
    );
    // status.processing は ja で '処理中' (vars 無し) なので、vars が来ても影響なし。
    // このテストは「Html 以外のキーは vars を許容する」ことの sanity check。
    expect(screen.getByTestId('probe-status.processing').textContent).toBe('処理中');
  });
});

describe('Messages 型整合性 (全 locale)', () => {
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

  it('en / zh-CN / zh-TW / ko のキー集合が ja と一致 (TS satisfies の runtime 確認)', async () => {
    const ja = (await import('./locales/ja')).ja;
    const en = (await import('./locales/en')).en;
    const zhCN = (await import('./locales/zh-CN')).zhCN;
    const zhTW = (await import('./locales/zh-TW')).zhTW;
    const ko = (await import('./locales/ko')).ko;
    const jaKeys = flatten(ja).sort();
    expect(flatten(en).sort()).toEqual(jaKeys);
    expect(flatten(zhCN).sort()).toEqual(jaKeys);
    expect(flatten(zhTW).sort()).toEqual(jaKeys);
    expect(flatten(ko).sort()).toEqual(jaKeys);
  });

  it('全 locale で app.title / status.queued / preset.standard-hevc.label が空文字でない', async () => {
    const all = [
      (await import('./locales/ja')).ja,
      (await import('./locales/en')).en,
      (await import('./locales/zh-CN')).zhCN,
      (await import('./locales/zh-TW')).zhTW,
      (await import('./locales/ko')).ko,
    ];
    for (const msgs of all) {
      expect(msgs.app.title.length).toBeGreaterThan(0);
      expect(msgs.status.queued.length).toBeGreaterThan(0);
      expect(msgs.preset['standard-hevc'].label.length).toBeGreaterThan(0);
    }
  });
});

describe('Provider — 全 locale 切替', () => {
  it.each<['ja' | 'en' | 'zh-CN' | 'zh-TW' | 'ko', string]>([
    ['ja', '動画圧縮'],
    ['en', 'Video Compressor'],
    ['zh-CN', '视频压缩'],
    ['zh-TW', '影片壓縮'],
    ['ko', '동영상 압축'],
  ])('preference=%s で app.title が "%s"', (preference, expected) => {
    render(
      <I18nProvider initialPreference={preference}>
        <Probe paths={['app.title']} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('probe-app.title').textContent).toBe(expected);
  });
});

