// V2: viewTransition helper のテスト。
//
// jsdom には `document.startViewTransition` も `matchMedia` も無いので、
// 各テストで明示的に注入して fallback / 本筋の両パスを検証する。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  withViewTransition,
  isViewTransitionAvailable,
  type ViewTransitionLike,
} from './viewTransition';

type GlobalWithVT = typeof globalThis & {
  matchMedia?: ((q: string) => MediaQueryList) | undefined;
};

const docAny = document as unknown as {
  startViewTransition?: (cb: () => void | Promise<void>) => ViewTransitionLike;
};

beforeEach(() => {
  // 既存の startViewTransition を退避 / クリア
  // TS strict: delete を optional property に対して使うのが厳しめに評価されるため
  // Reflect.deleteProperty で削除する (動作は等価)
  Reflect.deleteProperty(document, 'startViewTransition');
  // jsdom には matchMedia が無いことがあるので明示的に未定義へ
  Reflect.deleteProperty(globalThis, 'matchMedia');
});

afterEach(() => {
  // TS strict: delete を optional property に対して使うのが厳しめに評価されるため
  // Reflect.deleteProperty で削除する (動作は等価)
  Reflect.deleteProperty(document, 'startViewTransition');
  Reflect.deleteProperty(globalThis, 'matchMedia');
  vi.restoreAllMocks();
});

describe('withViewTransition — fallback', () => {
  it('API 不在: callback を即時実行して Promise を返す', async () => {
    const cb = vi.fn();
    const p = withViewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    await expect(p).resolves.toBeUndefined();
  });

  it('async callback も await できる', async () => {
    let done = false;
    await withViewTransition(async () => {
      await Promise.resolve();
      done = true;
    });
    expect(done).toBe(true);
  });

  it('Reduced Motion ON: startViewTransition があっても fallback', async () => {
    const startVT = vi.fn().mockImplementation((cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => undefined,
      };
    });
    docAny.startViewTransition = startVT;
    (globalThis as GlobalWithVT).matchMedia = ((q: string) =>
      ({
        matches: q === '(prefers-reduced-motion: reduce)',
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as GlobalWithVT['matchMedia'];

    const cb = vi.fn();
    await withViewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(startVT).not.toHaveBeenCalled();
  });

  it('VT 不在 + Reduced Motion ON (両方 true): || で短絡、matchMedia は呼ばれない', async () => {
    // V2.x MINOR #7: 旧テストは 2 つの fallback 条件を別々にカバーしていたが、
    // 両方 true のときの挙動 (短絡評価で matchMedia 例外が起きない) を保証する
    // テストがなかった。Firefox + Reduced Motion ON 等の組み合わせでの regression
    // 防止。
    delete docAny.startViewTransition;
    const matchMediaSpy = vi.fn().mockImplementation(() => {
      throw new Error('matchMedia should not be called when VT is absent');
    });
    (globalThis as GlobalWithVT).matchMedia = matchMediaSpy as unknown as GlobalWithVT['matchMedia'];

    const cb = vi.fn();
    await withViewTransition(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    // 短絡評価で matchMedia は呼ばれない (`typeof startViewTransition !== 'function'` が先に true)
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });
});

describe('withViewTransition — API present', () => {
  it('startViewTransition があれば呼び出される', async () => {
    let captured: (() => void | Promise<void>) | undefined;
    const startVT = vi.fn().mockImplementation((cb: () => void | Promise<void>) => {
      captured = cb;
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => undefined,
      };
    });
    docAny.startViewTransition = startVT;

    const cb = vi.fn();
    await withViewTransition(cb);
    expect(startVT).toHaveBeenCalledTimes(1);
    expect(captured).toBe(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('updateCallbackDone の reject は黙って吸収する (UI が止まらないように)', async () => {
    docAny.startViewTransition = vi.fn().mockImplementation((cb: () => void) => {
      cb();
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.reject(new Error('VT failed')),
        skipTransition: () => undefined,
      };
    });
    // reject でも resolve として完走するはず
    await expect(withViewTransition(() => {})).resolves.toBeUndefined();
  });
});

describe('isViewTransitionAvailable', () => {
  it('API 不在なら false', () => {
    expect(isViewTransitionAvailable()).toBe(false);
  });

  it('API ありかつ Reduced Motion OFF なら true', () => {
    docAny.startViewTransition = vi.fn() as unknown as DocumentWithVTStartFn;
    (globalThis as GlobalWithVT).matchMedia = ((q: string) =>
      ({
        matches: false,
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as GlobalWithVT['matchMedia'];
    expect(isViewTransitionAvailable()).toBe(true);
  });

  it('API ありでも Reduced Motion ON なら false', () => {
    docAny.startViewTransition = vi.fn() as unknown as DocumentWithVTStartFn;
    (globalThis as GlobalWithVT).matchMedia = ((q: string) =>
      ({
        matches: q === '(prefers-reduced-motion: reduce)',
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList) as GlobalWithVT['matchMedia'];
    expect(isViewTransitionAvailable()).toBe(false);
  });
});

type DocumentWithVTStartFn = (cb: () => void | Promise<void>) => ViewTransitionLike;
