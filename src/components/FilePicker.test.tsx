import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilePicker from './FilePicker';
import { _resetSharedAudioCtxForTest } from '../platform/audio';
import { wakeLockManager } from '../platform/wakeLock';
import {
  useQueueStore,
  _resetQueueStoreForTest,
  _setWorkerImplsForTest,
  _resetWorkerImplsForTest,
} from '../stores/queueStore';
import type {
  TranscodeJobOptions,
  TranscodeJobResult,
} from '../workers/compressor-client';
import { _resetDbCacheForTest } from '../db/indexeddb';
import { installMockOpfs, resetMockOpfs } from '../../tests/helpers/mock-opfs';

async function resetAll(opts: { quotaBytes?: number } = {}) {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new (indexedDB.constructor as new () => IDBFactory)(),
    configurable: true,
    writable: true,
  });
  _resetDbCacheForTest();
  installMockOpfs();
  const storageBase = (globalThis as unknown as { navigator: { storage: Record<string, unknown> } }).navigator.storage;
  if (opts.quotaBytes !== undefined) {
    storageBase['estimate'] = () =>
      Promise.resolve({ usage: 0, quota: opts.quotaBytes } as StorageEstimate);
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: storageBase,
      hardwareConcurrency: 4,
    },
    configurable: true,
    writable: true,
  });
  _resetQueueStoreForTest();
  _resetSharedAudioCtxForTest();
  // Worker spawn を noop に差し替え (JSDOM に Worker 無し、テストは UI のみ検証)
  _setWorkerImplsForTest(
    () =>
      ({
        terminate: () => {},
        postMessage: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as Worker,
    // ジョブは resolve しない (queued/starting で固定、テストの assertion 通過後にリーク)
    (_w: Worker, _o: TranscodeJobOptions) => new Promise<TranscodeJobResult>(() => {}),
  );
}

describe('FilePicker', () => {
  beforeEach(async () => {
    await resetAll();
    await useQueueStore.getState().init();
  });

  afterEach(() => {
    cleanup();
    resetMockOpfs();
    _resetWorkerImplsForTest();
    vi.unstubAllGlobals();
  });

  it('「動画を選択」ボタンを描画する', () => {
    render(<FilePicker preset="standard-hevc" />);
    expect(screen.getByRole('button', { name: '動画を選択' })).toBeInTheDocument();
  });

  it('ボタンタップでファイル選択 → queueStore.add される', async () => {
    const user = userEvent.setup();
    render(<FilePicker preset="standard-hevc" />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    const file = new File(['hello'], 'IMG_1.mov', { type: 'video/quicktime' });
    await user.upload(input, file);

    await waitFor(() => {
      expect(useQueueStore.getState().items).toHaveLength(1);
    });
    const items = useQueueStore.getState().items;
    expect(items[0]?.fileName).toBe('IMG_1.mov');
    expect(items[0]?.preset).toBe('standard-hevc');
  });

  it('複数ファイル選択を受け付ける (multiple 属性 + add 呼び出し)', async () => {
    render(<FilePicker preset="light-hevc" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const f1 = new File(['a'], 'a.mov');
    const f2 = new File(['b'], 'b.mp4');
    // userEvent.upload はマルチファイルで JSDOM のイベント転送が安定しないため fireEvent を使う
    fireEvent.change(input, { target: { files: [f1, f2] } });

    await waitFor(
      () => {
        expect(useQueueStore.getState().items).toHaveLength(2);
      },
      { timeout: 5000 },
    );
    const items = useQueueStore.getState().items;
    expect(items.map((i) => i.fileName).sort()).toEqual(['a.mov', 'b.mp4']);
    expect(items.every((i) => i.preset === 'light-hevc')).toBe(true);
  });

  it('quota 不足エラーで onResult callback が呼ばれる', async () => {
    // resetAll の段階で quota を小さく
    await resetAll({ quotaBytes: 10 });
    await useQueueStore.getState().init();

    const onResult = vi.fn();
    render(<FilePicker preset="standard-hevc" onResult={onResult} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello world'], 'big.mov');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(
      () => {
        expect(onResult).toHaveBeenCalledOnce();
      },
      { timeout: 5000 },
    );
    const result = onResult.mock.calls[0]?.[0];
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quota-exceeded');
  });

  it('disabled で操作不可', () => {
    render(<FilePicker preset="standard-hevc" disabled />);
    const button = screen.getByRole('button', { name: '動画を選択' });
    expect(button).toBeDisabled();
  });

  it('accept 属性が iPhone Photos 互換', () => {
    render(<FilePicker preset="standard-hevc" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('video/mp4,video/quicktime,video/*');
  });

  it('Phase 7 post-v0.9.0: onChange で wakeLockManager.acquire が await の前に呼ばれる', async () => {
    // FilePicker.handleChange は defensive acquire を行う (handleClick 経由で既に
    // acquire 済みでも no-op になる前提)。OPFS の await を挟む前に呼ばれることを検証。
    const acquireSpy = vi
      .spyOn(wakeLockManager, 'acquire')
      .mockResolvedValue(undefined);

    render(<FilePicker preset="standard-hevc" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'IMG_1.mov', { type: 'video/quicktime' });
    fireEvent.change(input, { target: { files: [file] } });

    // handleChange が同期的に acquire を呼ぶことの確認 (await 前に発火)
    expect(acquireSpy).toHaveBeenCalledTimes(1);

    // add() の完了も待ってから後始末
    await waitFor(() => {
      expect(useQueueStore.getState().items).toHaveLength(1);
    });
  });

  it('Phase 7 post-v0.9.1: ボタンタップ (click event) で wakeLockManager.acquire が先に呼ばれる', async () => {
    // iOS Safari の `change` イベントは transient user activation を持たないため
    // (実機で NotAllowedError を観測)、`click` イベントの user activation を使う。
    // handleClick の先頭 (await unlockAudio の前) で acquire が同期実行されることを検証。
    const acquireSpy = vi
      .spyOn(wakeLockManager, 'acquire')
      .mockResolvedValue(undefined);

    render(<FilePicker preset="standard-hevc" />);
    fireEvent.click(screen.getByRole('button', { name: '動画を選択' }));

    // handleClick は async だが先頭の void wakeLockManager.acquire() は同期で発火
    expect(acquireSpy).toHaveBeenCalledTimes(1);
  });

  it('Phase 7 post-v0.9.1: 60s 経過後に release が呼ばれる (キャンセル検出)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const releaseSpy = vi
      .spyOn(wakeLockManager, 'release')
      .mockResolvedValue(undefined);
    vi.spyOn(wakeLockManager, 'acquire').mockResolvedValue(undefined);

    try {
      render(<FilePicker preset="standard-hevc" />);
      fireEvent.click(screen.getByRole('button', { name: '動画を選択' }));
      expect(releaseSpy).not.toHaveBeenCalled();
      // 60 秒以内 (59 秒) では release されない
      vi.advanceTimersByTime(59_999);
      expect(releaseSpy).not.toHaveBeenCalled();
      // 60 秒で release
      vi.advanceTimersByTime(1);
      expect(releaseSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Phase 7 post-v0.9.1: 60s 内に change が来ればキャンセル検出は走らない', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const releaseSpy = vi
      .spyOn(wakeLockManager, 'release')
      .mockResolvedValue(undefined);
    vi.spyOn(wakeLockManager, 'acquire').mockResolvedValue(undefined);

    try {
      render(<FilePicker preset="standard-hevc" />);
      fireEvent.click(screen.getByRole('button', { name: '動画を選択' }));
      // 30 秒経過後に change イベント (file 選択完了) を発火 → タイマー停止
      vi.advanceTimersByTime(30_000);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'a.mov')] } });
      // さらに 60 秒経っても release は呼ばれない
      vi.advanceTimersByTime(60_000);
      expect(releaseSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Phase 7 post-v0.9.1: change with 0 files (まれ) でも release で leak 防止', async () => {
    const releaseSpy = vi
      .spyOn(wakeLockManager, 'release')
      .mockResolvedValue(undefined);
    render(<FilePicker preset="standard-hevc" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    await waitFor(() => expect(releaseSpy).toHaveBeenCalled());
  });
});
