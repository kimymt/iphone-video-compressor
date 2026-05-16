// V1.1: SettingsSheet のレンダリングと操作テスト。
//
// 検証範囲:
// - open/close と DOM 残存 (アニメ完了用の遅延 unmount)
// - プリセット一覧の表示 (HEVC 対応 / 非対応で個数が変わる)
// - プリセット選択 → settingsStore 反映
// - カメラ案内 dismiss
// - PWA インストールガイド (standalone で非表示、それ以外で表示)
// - バージョン表示
// - close ボタン / backdrop / ESC キーで onClose 呼び出し

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import SettingsSheet from './SettingsSheet';
import {
  useSettingsStore,
  _resetSettingsStoreForTest,
} from '../stores/settingsStore';
import type { EnvCheck } from '../lib/types';
import type { StorageInfo } from '../platform/storage';

const HEVC_ENV: EnvCheck = {
  videoEncoder: true,
  audioEncoder: true,
  webShareFiles: true,
  wakeLock: true,
  opfs: true,
  persistentStorage: true,
  hevcEncode: true,
  h264Encode: true,
  canRun: true,
};

const H264_ONLY_ENV: EnvCheck = {
  ...HEVC_ENV,
  hevcEncode: false,
};

const fakeStorage = async (): Promise<StorageInfo> => ({
  usage: 50 * 1024 * 1024,
  quota: 200 * 1024 * 1024,
  available: 150 * 1024 * 1024,
});

beforeEach(() => {
  _resetSettingsStoreForTest();
  useSettingsStore.getState().init(HEVC_ENV);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SettingsSheet — open / close', () => {
  it('open=false 初期: render しない', () => {
    render(
      <SettingsSheet
        open={false}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    expect(screen.queryByTestId('settings-sheet')).toBeNull();
  });

  it('open=true: data-state=open でレンダー', async () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const sheet = await screen.findByTestId('settings-sheet');
    expect(sheet.getAttribute('data-state')).toBe('open');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
  });

  it('閉じるボタンで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        onClose={onClose}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-sheet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop タップで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        onClose={onClose}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    fireEvent.click(screen.getByLabelText('設定を閉じる'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC キーで onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        onClose={onClose}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsSheet — プリセット', () => {
  it('HEVC 対応端末: 6 個のプリセットが radio として表示される', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    // V2: 言語ピッカーも radio なので、プリセットの radiogroup 内に絞って数える
    const presetGroup = screen.getByRole('radiogroup', { name: /圧縮プリセット/ });
    const radios = presetGroup.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(6);
  });

  it('HEVC 非対応端末: H.264 プリセット 2 個のみ表示 + 注釈テキスト', () => {
    _resetSettingsStoreForTest();
    useSettingsStore.getState().init(H264_ONLY_ENV);
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={H264_ONLY_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const presetGroup = screen.getByRole('radiogroup', { name: /圧縮プリセット/ });
    const radios = presetGroup.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(2);
    expect(screen.getByText(/HEVC が利用できない端末/)).toBeTruthy();
  });

  it('プリセット選択で settingsStore.preset が更新される', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    fireEvent.click(screen.getByTestId('settings-preset-light-hevc'));
    expect(useSettingsStore.getState().preset).toBe('light-hevc');
    expect(screen.getByTestId('settings-preset-light-hevc').getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('既定 (standard-hevc) が初期で checked になっている', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    expect(
      screen.getByTestId('settings-preset-standard-hevc').getAttribute('aria-checked'),
    ).toBe('true');
  });
});

describe('SettingsSheet — ストレージ', () => {
  it('ストレージ情報を取得して表示する', async () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    // bar の aria-valuenow が確定するまで待つ (storage 取得完了の指標)
    const bar = await screen.findByTestId('settings-storage-bar');
    await act(async () => {
      await Promise.resolve();
    });
    // 50/200 → 25% の progressbar
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    // usage 数値が表示されていること (`50.0 MB` を font-medium span に表示)
    const usageSpan = screen.getByText('50.0 MB', { selector: 'span.font-medium' });
    expect(usageSpan).toBeTruthy();
    // 空き表示
    expect(screen.getByText(/空き: 150\.0 MB/)).toBeTruthy();
  });

  it('quota=0 (取得不能) なら警告メッセージ', async () => {
    const zero = async (): Promise<StorageInfo> => ({ usage: 0, quota: 0, available: 0 });
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={zero}
      />,
    );
    const msg = await screen.findByText(/使用量を取得できません/);
    expect(msg).toBeTruthy();
  });
});

describe('SettingsSheet — カメラ案内', () => {
  it('cameraTipDismissed=false なら表示、dismiss ボタンで非表示になる', () => {
    const { rerender } = render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    expect(screen.getByTestId('settings-camera-dismiss')).toBeTruthy();

    fireEvent.click(screen.getByTestId('settings-camera-dismiss'));
    rerender(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    expect(screen.queryByTestId('settings-camera-dismiss')).toBeNull();
    expect(useSettingsStore.getState().cameraTipDismissed).toBe(true);
  });
});

describe('SettingsSheet — PWA インストールガイド', () => {
  it('isStandaloneOverride=false なら表示', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
        isStandaloneOverride={false}
      />,
    );
    // セクションの heading (h3) で識別 (本文の<strong>「ホーム画面に追加」</strong>と区別)
    expect(screen.getByRole('heading', { name: /ホーム画面に追加/ })).toBeTruthy();
  });

  it('isStandaloneOverride=true なら非表示', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
        isStandaloneOverride={true}
      />,
    );
    expect(screen.queryByRole('heading', { name: /ホーム画面に追加/ })).toBeNull();
  });
});

describe('SettingsSheet — バージョン表示', () => {
  it('__APP_VERSION__ の値が data-testid=settings-version に表示される', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const version = screen.getByTestId('settings-version');
    // vitest.config.ts (もしくは vite define) で __APP_VERSION__ が注入される。
    // テスト時は文字列が含まれることだけ確認 (具体値は package.json 依存)。
    expect(version.textContent).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('GitHub リンクが存在する', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const link = screen.getByText(/ソースコード \(GitHub\)/);
    const anchor = link.closest('a');
    expect(anchor?.getAttribute('href')).toContain('github.com/kimymt/iphone-video-compressor');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

describe('SettingsSheet — drag-to-dismiss', () => {
  it('100px 以上下方向にドラッグ→離す で onClose が呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        onClose={onClose}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const handle = screen.getByTestId('settings-sheet-handle');
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 220 }] });
    fireEvent.touchEnd(handle, {});
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('小さなドラッグ (< 100px) では onClose は呼ばれない (spring back)', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        onClose={onClose}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const handle = screen.getByTestId('settings-sheet-handle');
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 130 }] });
    fireEvent.touchEnd(handle, {});
    expect(onClose).not.toHaveBeenCalled();
  });

  it('上方向のドラッグは無視される (translateY 0 のまま)', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet
        open={true}
        onClose={onClose}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const handle = screen.getByTestId('settings-sheet-handle');
    fireEvent.touchStart(handle, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 50 }] });
    fireEvent.touchEnd(handle, {});
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SettingsSheet — V2: HEVC ベンチマーク', () => {
  it('HEVC 対応端末: bench セクションが表示される + 未実行時は "未計測"', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const status = screen.getByTestId('settings-hevc-bench-status');
    // ja locale で「未計測」が含まれる
    expect(status.textContent).toMatch(/未計測/);
    // 実行ボタンが表示される
    const button = screen.getByTestId('settings-hevc-bench-run');
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('HEVC 非対応端末: bench セクション自体が表示されない', () => {
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={H264_ONLY_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    expect(screen.queryByTestId('settings-hevc-bench-status')).toBeNull();
    expect(screen.queryByTestId('settings-hevc-bench-run')).toBeNull();
  });

  it('bench record があるとき: speedup と並列度が表示される (slowdown=false → 並列 2)', () => {
    act(() => {
      useSettingsStore.getState().setHevcBench({
        speedup: 1.85,
        slowdown: false,
        serialMs: 1000,
        parallelMs: 1081,
        ranAt: Date.now() - 5 * 60 * 1000,
        frameCount: 60,
        width: 1280,
        height: 720,
      });
    });
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const status = screen.getByTestId('settings-hevc-bench-status');
    expect(status.textContent).toContain('1.85');
    expect(status.textContent).toMatch(/最大並列|完全並列/);
    // 再実行ボタンが表示される (rerunButton)
    expect(screen.getByTestId('settings-hevc-bench-run').textContent).toMatch(/再実行/);
  });

  it('bench record で slowdown=true なら 並列 1 を表示', () => {
    act(() => {
      useSettingsStore.getState().setHevcBench({
        speedup: 1.0,
        slowdown: true,
        serialMs: 1000,
        parallelMs: 2000,
        ranAt: Date.now(),
        frameCount: 60,
        width: 1280,
        height: 720,
      });
    });
    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    const status = screen.getByTestId('settings-hevc-bench-status');
    expect(status.textContent).toContain('1.00');
    expect(status.textContent).toMatch(/直列化|HEVC を/);
  });

  it('run ボタンタップ: bench が実行され store と toast が更新される', async () => {
    const benchMock = vi.fn(async () => ({
      speedup: 1.95,
      slowdown: false,
      serialMs: 800,
      parallelMs: 820,
      ranAt: Date.now(),
      frameCount: 60,
      width: 1280,
      height: 720,
    }));
    const setHevcBench = vi.fn();
    const setHevcBenchSlowdown = vi.fn(async () => {});

    render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
        hevcBenchDeps={{ bench: benchMock, setHevcBench, setHevcBenchSlowdown }}
      />,
    );

    const button = screen.getByTestId('settings-hevc-bench-run');
    await act(async () => {
      fireEvent.click(button);
      // bench promise が resolve + finally の setBenchRunning(false) が flush するまで待つ
      // (microtask 2 段: bench resolve → setHevcBench → setHevcBenchSlowdown → finally)
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(benchMock).toHaveBeenCalledTimes(1);
    expect(setHevcBench).toHaveBeenCalledTimes(1);
    expect(setHevcBenchSlowdown).toHaveBeenCalledWith(false);
  });
});

describe('SettingsSheet — open=false 後の DOM 残存', () => {
  it('open=true → false で即時には消えない (アニメ用に DOM 残す)', async () => {
    const { rerender } = render(
      <SettingsSheet
        open={true}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    expect(screen.getByTestId('settings-sheet')).toBeTruthy();
    rerender(
      <SettingsSheet
        open={false}
        onClose={() => {}}
        envCheck={HEVC_ENV}
        fetchStorageInfo={fakeStorage}
      />,
    );
    // 直後はまだ DOM がある (アニメ完了まで)
    const sheet = screen.getByTestId('settings-sheet');
    expect(sheet.getAttribute('data-state')).toBe('closed');
  });
});
