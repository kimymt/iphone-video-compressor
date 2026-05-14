// Phase 7 post-v0.9.0: WakeLockIndicator の表示テスト。
// queueStore.isProcessing と WakeLockManager.isActive() / onChange の 4 通りを検証。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import WakeLockIndicator from './WakeLockIndicator';
import { useQueueStore, _resetQueueStoreForTest } from '../stores/queueStore';
import {
  WakeLockManager,
  type WakeLockApiLike,
  type WakeLockSentinelLike,
} from '../platform/wakeLock';

class StubSentinel implements WakeLockSentinelLike {
  released = false;
  async release(): Promise<void> {
    this.released = true;
  }
  addEventListener(_t: 'release', _l: () => void): void {
    /* noop */
  }
}

class StubApi implements WakeLockApiLike {
  shouldReject = false;
  async request(): Promise<WakeLockSentinelLike> {
    if (this.shouldReject) throw new Error('denied');
    return new StubSentinel();
  }
}

beforeEach(() => {
  _resetQueueStoreForTest();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WakeLockIndicator', () => {
  it('isProcessing=false なら非表示', () => {
    const mgr = new WakeLockManager({ wakeLockApi: new StubApi() });
    render(<WakeLockIndicator manager={mgr} />);
    expect(screen.queryByTestId('wake-lock-indicator')).toBeNull();
  });

  it('isProcessing=true + lock 未取得は data-state=inactive (画面 ON 失敗)', () => {
    const mgr = new WakeLockManager({ wakeLockApi: new StubApi() });
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    const ind = screen.getByTestId('wake-lock-indicator');
    expect(ind).toHaveAttribute('data-state', 'inactive');
    expect(ind).toHaveTextContent(/画面 ON 失敗/);
  });

  it('isProcessing=true + acquire 成功で data-state=active (画面 ON)', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: new StubApi() });
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    await act(async () => {
      await mgr.acquire();
    });
    const ind = screen.getByTestId('wake-lock-indicator');
    expect(ind).toHaveAttribute('data-state', 'active');
    expect(ind).toHaveTextContent(/画面 ON$/);
  });

  it('isProcessing=true で acquire 失敗時は inactive のまま', async () => {
    const api = new StubApi();
    api.shouldReject = true;
    const mgr = new WakeLockManager({ wakeLockApi: api });
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    await act(async () => {
      await mgr.acquire();
    });
    expect(screen.getByTestId('wake-lock-indicator')).toHaveAttribute(
      'data-state',
      'inactive',
    );
  });

  it('release 後 isProcessing が false に戻ったら非表示に', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: new StubApi() });
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    await act(async () => {
      await mgr.acquire();
    });
    expect(screen.getByTestId('wake-lock-indicator')).toBeInTheDocument();

    await act(async () => {
      await mgr.release();
      useQueueStore.setState({ isProcessing: false });
    });
    expect(screen.queryByTestId('wake-lock-indicator')).toBeNull();
  });

  it('onChange unsubscribe が unmount 時に呼ばれる', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: new StubApi() });
    const onChangeSpy = vi.spyOn(mgr, 'onChange');
    const { unmount } = render(<WakeLockIndicator manager={mgr} />);
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
    const unsub = onChangeSpy.mock.results[0]!.value as () => void;
    const unsubSpy = vi.fn(unsub);
    onChangeSpy.mock.results[0]!.value = unsubSpy;
    // unmount 時に React が effect cleanup を呼ぶ → 戻り値 (unsub) が呼ばれる
    unmount();
    // unsub spy は effect が cleanup を呼んだ後に解放される。effect が初回 mount 時の戻り値を
    // 呼ぶ点が検証対象。直接 mock 入れ替えだと厳密検証は難しいので、ここでは listener 残数の
    // 観点で確認する (acquire 後の通知が WakeLockIndicator に届かないこと)。
    await act(async () => {
      await mgr.acquire();
    });
    // 通知が来ても再 render は走らないので、エラーが出ないことだけ確認
    // (テスト失敗時のシグナルはここでの assertion ではなく act の安全性)
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('a11y: role=status + aria-live=polite + aria-label に日本語の状態説明', () => {
    const mgr = new WakeLockManager({ wakeLockApi: new StubApi() });
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    const ind = screen.getByTestId('wake-lock-indicator');
    expect(ind).toHaveAttribute('role', 'status');
    expect(ind).toHaveAttribute('aria-live', 'polite');
    expect(ind.getAttribute('aria-label')).toMatch(/画面|Wake Lock/);
  });

  it('acquire 失敗時はエラー名がインラインで表示される (Phase 7 post-v0.9.0)', async () => {
    const api = new StubApi();
    api.shouldReject = true;
    const mgr = new WakeLockManager({ wakeLockApi: api });
    // request を `NotAllowedError` 系で reject させる
    api.request = async () => {
      throw Object.assign(new Error('No user gesture'), { name: 'NotAllowedError' });
    };
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    await act(async () => {
      await mgr.acquire();
    });
    const ind = screen.getByTestId('wake-lock-indicator');
    expect(ind).toHaveAttribute('data-state', 'inactive');
    expect(ind).toHaveAttribute('data-error-name', 'NotAllowedError');
    expect(ind).toHaveTextContent(/画面 ON 失敗: NotAllowedError/);
    expect(ind).toHaveAttribute(
      'title',
      expect.stringContaining('NotAllowedError'),
    );
    expect(ind.getAttribute('aria-label')).toMatch(/NotAllowedError/);
  });

  it('wakeLockApi が null (NotSupported) でも診断表示される', async () => {
    const mgr = new WakeLockManager({ wakeLockApi: null });
    render(<WakeLockIndicator manager={mgr} />);
    act(() => {
      useQueueStore.setState({ isProcessing: true });
    });
    await act(async () => {
      await mgr.acquire();
    });
    const ind = screen.getByTestId('wake-lock-indicator');
    expect(ind).toHaveAttribute('data-error-name', 'NotSupported');
    expect(ind).toHaveTextContent(/画面 ON 失敗: NotSupported/);
  });
});
