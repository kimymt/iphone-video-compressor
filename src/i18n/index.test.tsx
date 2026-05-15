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

/** テストヘルパ: navigator.languages を上書きして単一言語をシミュレート。
 *  jsdom default の `['en-US']` が誤って先に match するのを防ぐ。 */
function setLanguages(...langs: string[]): void {
  Object.defineProperty(navigator, 'languages', { value: langs, configurable: true });
  Object.defineProperty(navigator, 'language', { value: langs[0] ?? '', configurable: true });
}

describe('detectLocale (single language)', () => {
  it('ja-* なら ja', () => {
    setLanguages('ja-JP');
    expect(detectLocale()).toBe('ja');
  });

  it('en-US なら en', () => {
    setLanguages('en-US');
    expect(detectLocale()).toBe('en');
  });

  it('ko-KR なら ko', () => {
    setLanguages('ko-KR');
    expect(detectLocale()).toBe('ko');
  });

  it('zh-CN なら zh-CN (簡体)', () => {
    setLanguages('zh-CN');
    expect(detectLocale()).toBe('zh-CN');
  });

  it('zh-Hans-* なら zh-CN', () => {
    setLanguages('zh-Hans-CN');
    expect(detectLocale()).toBe('zh-CN');
  });

  it('zh-TW なら zh-TW (繁体)', () => {
    setLanguages('zh-TW');
    expect(detectLocale()).toBe('zh-TW');
  });

  it('zh-HK なら zh-TW (香港 → 繁体)', () => {
    setLanguages('zh-HK');
    expect(detectLocale()).toBe('zh-TW');
  });

  it('zh-Hant-* なら zh-TW', () => {
    setLanguages('zh-Hant-TW');
    expect(detectLocale()).toBe('zh-TW');
  });

  it('zh (region なし) なら zh-CN default', () => {
    setLanguages('zh');
    expect(detectLocale()).toBe('zh-CN');
  });

  it('fr-FR なら en fallback', () => {
    setLanguages('fr-FR');
    expect(detectLocale()).toBe('en');
  });

  it('navigator.language も navigator.languages も空でも en fallback', () => {
    Object.defineProperty(navigator, 'languages', { value: [], configurable: true });
    Object.defineProperty(navigator, 'language', { value: '', configurable: true });
    expect(detectLocale()).toBe('en');
  });
});

describe('detectLocale (multi-language preference: navigator.languages[])', () => {
  // V2.x MINOR #2: iOS の言語と地域設定で複数言語を順序付けて並べているユーザを
  // 取りこぼさないよう、navigator.languages[] を順次マッチする。
  // navigator.language (単一) のみだったときは「先頭の OS 優先言語」しか見れず、
  // 例えば ['de', 'en', 'ja'] のユーザは 'de' が未対応な瞬間 'en' fallback だった。

  it('最初の対応 candidate を返す: [ja, en] → ja', () => {
    setLanguages('ja-JP', 'en-US');
    expect(detectLocale()).toBe('ja');
  });

  it('未対応 candidate は skip: [de, en, ja] → en (ユーザは de を最優先、次に en を ja より上位に置いている)', () => {
    setLanguages('de-DE', 'en-US', 'ja-JP');
    expect(detectLocale()).toBe('en');
  });

  it('未対応のみ: [de, fr] → en fallback', () => {
    setLanguages('de-DE', 'fr-FR');
    expect(detectLocale()).toBe('en');
  });

  it('中国語の繁体 / 簡体は順序順に正しく分類: [zh-TW, ja] → zh-TW', () => {
    setLanguages('zh-TW', 'ja-JP');
    expect(detectLocale()).toBe('zh-TW');
  });

  it('navigator.languages が undefined のときは navigator.language に fallback', () => {
    // navigator.languages を未定義にして navigator.language のみで動くか確認
    // (古い browser / 非標準環境のシミュレーション)
    Object.defineProperty(navigator, 'languages', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'language', { value: 'ko-KR', configurable: true });
    expect(detectLocale()).toBe('ko');
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
    Object.defineProperty(navigator, 'languages', { value: ['ja-JP'], configurable: true });
    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
    expect(resolveLocale('auto')).toBe('ja');
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true });
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

  it("preference='auto' の場合 navigator.languages で解決", () => {
    // V2.x: navigator.languages[] を優先するようになった (#2)
    Object.defineProperty(navigator, 'languages', { value: ['ja-JP'], configurable: true });
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

  /** 値からプレースホルダ名のセットを抽出。`{var}` 形式 (named only)。 */
  function extractPlaceholders(value: string): Set<string> {
    const names = new Set<string>();
    const re = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(value)) !== null) {
      if (match[1] !== undefined) names.add(match[1]);
    }
    return names;
  }

  /** 巾乱対称差: 2 つのセットが完全一致しないとき、両方のセットを返す。 */
  function symmetricDiff<T>(a: Set<T>, b: Set<T>): { onlyInA: T[]; onlyInB: T[] } {
    const onlyInA = [...a].filter((x) => !b.has(x));
    const onlyInB = [...b].filter((x) => !a.has(x));
    return { onlyInA, onlyInB };
  }

  it('全 locale で同一キーの placeholder 集合が一致する (翻訳ミスを CI で検出)', async () => {
    // V2.x: キー集合の drift は前段のテストで検出できるが、placeholder の drift
    // (例: ja で `'残り {duration}'`、zh-TW で `'剩餘 {time}'`) はキー一致だけ
    // ではすり抜けてしまう。各キーの value から `{name}` を抽出して set 比較する。
    const ja = (await import('./locales/ja')).ja;
    const locales = {
      en: (await import('./locales/en')).en,
      'zh-CN': (await import('./locales/zh-CN')).zhCN,
      'zh-TW': (await import('./locales/zh-TW')).zhTW,
      ko: (await import('./locales/ko')).ko,
    } as const;

    // 全 leaf キーを ja から列挙し、各 locale の同キー value と placeholder set を比較
    type AnyMessages = Record<string, unknown>;
    function walk(prefix: string, jaObj: AnyMessages, others: Record<string, AnyMessages>): void {
      for (const [k, jaVal] of Object.entries(jaObj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof jaVal === 'string') {
          const jaPh = extractPlaceholders(jaVal);
          for (const [localeName, otherObj] of Object.entries(others)) {
            const otherVal = otherObj[k];
            // キー drift は前段で検出済みなので、ここは undefined を許容しない
            expect(
              typeof otherVal,
              `[${localeName}] expected string at ${path}, got ${typeof otherVal}`,
            ).toBe('string');
            const otherPh = extractPlaceholders(otherVal as string);
            // 集合の対称差を取り、空でなければ詳細エラー文を出す
            const diff = symmetricDiff(jaPh, otherPh);
            if (diff.onlyInA.length > 0 || diff.onlyInB.length > 0) {
              throw new Error(
                `Placeholder drift at "${path}" (${localeName}): ` +
                  `ja=[${[...jaPh].join(',')}] vs ${localeName}=[${[...otherPh].join(',')}] ` +
                  `(only_in_ja=[${diff.onlyInA.join(',')}], only_in_${localeName}=[${diff.onlyInB.join(',')}])`,
              );
            }
          }
        } else if (jaVal !== null && typeof jaVal === 'object') {
          const nestedOthers: Record<string, AnyMessages> = {};
          for (const [localeName, otherObj] of Object.entries(others)) {
            const nested = otherObj[k];
            expect(
              typeof nested,
              `[${localeName}] expected nested object at ${path}, got ${typeof nested}`,
            ).toBe('object');
            nestedOthers[localeName] = nested as AnyMessages;
          }
          walk(path, jaVal as AnyMessages, nestedOthers);
        }
      }
    }

    walk('', ja as unknown as AnyMessages, locales as unknown as Record<string, AnyMessages>);
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

