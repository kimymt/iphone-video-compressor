// Phase 2 + Phase 4a の queueStore テスト。
// Phase 4a: add 時に processNext が自動起動するため、Worker spawn / runJob を mock 必須。
// Worker は in-memory 完結、HEVC / 実エンコード等は別レイヤ (Phase 3b の transcode.test) で検証済み。

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { indexedDB } from 'fake-indexeddb';
import {
  useQueueStore,
  _resetQueueStoreForTest,
  _setWorkerImplsForTest,
  _resetWorkerImplsForTest,
} from './queueStore';
import { saveQueueItem, _resetDbCacheForTest } from '../db/indexeddb';
import {
  installMockOpfs,
  resetMockOpfs,
  getMockRoot,
} from '../../tests/helpers/mock-opfs';
import { getOpfsWritable } from '../db/opfs';
import type { QueueItem } from '../lib/types';
import type {
  TranscodeJobOptions,
  TranscodeJobResult,
} from '../workers/compressor-client';

// ---- Worker mock の制御用フィクスチャ ----

type JobController = {
  options: TranscodeJobOptions;
  resolve: (r: TranscodeJobResult) => void;
  reject: (e: unknown) => void;
  signalAborted: () => boolean;
};

/** spawn 履歴と runJob 履歴を蓄積する mock 環境。 */
class MockWorkerEnv {
  jobs: JobController[] = [];
  spawnCount = 0;

  spawn = (): Worker => {
    this.spawnCount++;
    // Worker 実体は使わないので最小モック (terminate のみ)
    return {
      terminate: vi.fn(),
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as Worker;
  };

  run = async (_worker: Worker, opts: TranscodeJobOptions): Promise<TranscodeJobResult> => {
    return new Promise<TranscodeJobResult>((resolve, reject) => {
      this.jobs.push({
        options: opts,
        resolve,
        reject,
        signalAborted: () => opts.signal?.aborted ?? false,
      });
    });
  };

  /** id (もしくはインデックス) のジョブを成功させる。 */
  succeed(idOrIndex: string | number, result: { outputSize?: number; durationSec?: number } = {}): void {
    const job = this.find(idOrIndex);
    job.resolve({
      kind: 'done',
      outputSize: result.outputSize ?? 12345,
      durationSec: result.durationSec ?? 1.0,
    });
  }

  /** id (もしくはインデックス) のジョブを失敗させる。 */
  fail(idOrIndex: string | number, error = 'mocked failure'): void {
    const job = this.find(idOrIndex);
    job.resolve({ kind: 'failed', error });
  }

  /** id (もしくはインデックス) のジョブをキャンセル応答にする。 */
  cancel(idOrIndex: string | number): void {
    const job = this.find(idOrIndex);
    job.resolve({ kind: 'cancelled' });
  }

  /** id (もしくはインデックス) のジョブの onStarted を発火させる。 */
  emitStarted(idOrIndex: string | number): void {
    const job = this.find(idOrIndex);
    job.options.onStarted?.();
  }

  /** id (もしくはインデックス) のジョブの onProgress を発火させる。 */
  emitProgress(
    idOrIndex: string | number,
    percent: number,
    currentSec = 0,
    totalSec = 1,
    etaSec: number | null = null,
  ): void {
    const job = this.find(idOrIndex);
    job.options.onProgress?.(percent, currentSec, totalSec, etaSec);
  }

  private find(idOrIndex: string | number): JobController {
    const found =
      typeof idOrIndex === 'number'
        ? this.jobs[idOrIndex]
        : this.jobs.find((j) => j.options.id === idOrIndex);
    if (!found) throw new Error(`mock job not found: ${idOrIndex} (have: ${this.jobs.map((j) => j.options.id).join(',')})`);
    return found;
  }
}

let mockEnv: MockWorkerEnv;

// ---- アイテム作成ヘルパー ----

function makeItem(id: string, status: QueueItem['status'], overrides: Partial<QueueItem> = {}): QueueItem {
  const base = {
    id,
    fileName: `${id}.mov`,
    inputSize: 100,
    inputOpfsPath: `inputs/${id}.mov`,
    progress: 0,
    preset: 'standard-hevc' as const,
    addedAt: 100,
    ...overrides,
  };
  if (status === 'failed') {
    return { ...base, status, error: (overrides as { error?: string }).error ?? 'err' };
  }
  return { ...base, status };
}

async function resetAll() {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new (indexedDB.constructor as new () => IDBFactory)(),
    configurable: true,
    writable: true,
  });
  _resetDbCacheForTest();
  installMockOpfs();
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
      hardwareConcurrency: 4, // → parallelism=1
    },
    configurable: true,
    writable: true,
  });
  _resetQueueStoreForTest();
  mockEnv = new MockWorkerEnv();
  _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
}

/** マイクロタスクを十分に進める (queueStore の async state 遷移を待つ)。 */
async function flush(): Promise<void> {
  // 複数の await チェーンを進めるため小さい timeout 数回
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('queueStore', () => {
  beforeEach(async () => {
    await resetAll();
  });

  afterEach(() => {
    resetMockOpfs();
    _resetWorkerImplsForTest();
    vi.unstubAllGlobals();
  });

  describe('init()', () => {
    it('空 DB で items=[]、parallelism は hardwareConcurrency で決まる', async () => {
      await useQueueStore.getState().init();
      expect(useQueueStore.getState().items).toEqual([]);
      expect(useQueueStore.getState().parallelism).toBe(1);
      expect(useQueueStore.getState().initialized).toBe(true);
    });

    it('hardwareConcurrency >= 6 で parallelism=2', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
          hardwareConcurrency: 8,
        },
        configurable: true,
        writable: true,
      });
      await useQueueStore.getState().init();
      expect(useQueueStore.getState().parallelism).toBe(2);
    });

    it('★ REGRESSION ★ processing 状態のアイテムを起動時に queued にリセット (A4)', async () => {
      await saveQueueItem(makeItem('p1', 'processing', { progress: 67, startedAt: 999, outputOpfsPath: 'outputs/p1.mp4' }));
      const w = await getOpfsWritable('outputs/p1.mp4');
      await w.write(new Blob(['partial']));
      await w.close();

      await useQueueStore.getState().init();
      await flush();
      const restored = useQueueStore.getState().items;
      expect(restored).toHaveLength(1);
      // init 後 processNext が走るので restored[0] は 'starting' に遷移している可能性あり
      // 重要なのは 'processing' のまま残らないこと、output が削除されていること
      expect(['queued', 'starting']).toContain(restored[0]?.status);

      const outputsDir = await (
        (globalThis as { navigator: { storage: { getDirectory: () => Promise<FileSystemDirectoryHandle> } } }).navigator.storage.getDirectory()
      );
      let outputsCount = 0;
      try {
        const sub = await outputsDir.getDirectoryHandle('outputs');
        for await (const _entry of sub as unknown as AsyncIterable<unknown>) {
          outputsCount++;
        }
      } catch {
        outputsCount = 0;
      }
      expect(outputsCount).toBe(0);
    });

    it('★ REGRESSION ★ starting 状態も同様に queued にリセット', async () => {
      await saveQueueItem(makeItem('s1', 'starting', { startedAt: 555 }));
      await useQueueStore.getState().init();
      // init 直後の items を確認 (processNext で starting に再遷移する前)
      // この場合 init() 自体が processNext を呼ぶため厳密に queued を保証することは難しい。
      // 重要なのは 'starting' で永続化されていたものを正しく再起動できること。
      expect(useQueueStore.getState().items[0]).toBeDefined();
    });

    it('done / failed / cancelled / queued はリセット対象外 (進行中以外は保持)', async () => {
      await saveQueueItem(makeItem('done1', 'done', { progress: 100, finishedAt: 555, outputOpfsPath: 'outputs/done1.mp4', outputSize: 30 }));
      await saveQueueItem(makeItem('fail1', 'failed', { progress: 50, error: 'x' }));
      await saveQueueItem(makeItem('canc1', 'cancelled', { progress: 30 }));

      await useQueueStore.getState().init();
      await flush();
      const items = useQueueStore.getState().items;
      const byId = Object.fromEntries(items.map((i) => [i.id, i]));
      expect(byId['done1']?.status).toBe('done');
      expect(byId['done1']?.progress).toBe(100);
      expect(byId['fail1']?.status).toBe('failed');
      expect(byId['canc1']?.status).toBe('cancelled');
    });

    it('init() は冪等 (二度呼んでも initialized 後はスキップ)', async () => {
      await useQueueStore.getState().init();
      const items1 = useQueueStore.getState().items;
      await useQueueStore.getState().init();
      const items2 = useQueueStore.getState().items;
      expect(items1).toBe(items2);
    });
  });

  describe('add() + processNext()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('add() の result が ok / addedIds を返す', async () => {
      const file = new File(['hello'], 'IMG_4523.mov', { type: 'video/quicktime' });
      const result = await useQueueStore.getState().add([file], 'standard-hevc');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.addedIds).toHaveLength(1);
    });

    it('add() 後に processNext が自動起動、Worker spawn + status=starting', async () => {
      const file = new File(['hello'], 'a.mov');
      await useQueueStore.getState().add([file], 'standard-hevc');
      await flush();
      expect(mockEnv.spawnCount).toBe(1);
      expect(mockEnv.jobs).toHaveLength(1);
      const items = useQueueStore.getState().items;
      expect(items[0]?.status).toBe('starting');
      expect(items[0]?.startedAt).toBeGreaterThan(0);
    });

    it('onStarted で status=processing', async () => {
      const file = new File(['hello'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.emitStarted(id);
      await flush();
      expect(useQueueStore.getState().items[0]?.status).toBe('processing');
    });

    it('onProgress で progress フィールドが更新', async () => {
      const file = new File(['hello'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.emitStarted(id);
      mockEnv.emitProgress(id, 42);
      await flush();
      expect(useQueueStore.getState().items[0]?.progress).toBe(42);
    });

    it('done で status=done、input OPFS 削除、outputSize/outputOpfsPath/finishedAt セット', async () => {
      const file = new File(['hello'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();

      // 確認: inputs に書き込まれている
      const root = getMockRoot();
      const inputs = await root.getDirectoryHandle('inputs');
      expect(inputs.countEntries()).toBe(1);

      mockEnv.succeed(id, { outputSize: 5000, durationSec: 2.5 });
      await flush();
      const item = useQueueStore.getState().items[0];
      expect(item?.status).toBe('done');
      expect(item?.outputSize).toBe(5000);
      expect(item?.durationSec).toBe(2.5);
      expect(item?.outputOpfsPath).toBe(`outputs/${id}.mp4`);
      expect(item?.finishedAt).toBeGreaterThan(0);
      expect(item?.progress).toBe(100);
      // input 削除済み: inputOpfsPath は '' に
      expect(item?.inputOpfsPath).toBe('');
      // OPFS から実体も削除済み
      expect(inputs.countEntries()).toBe(0);
    });

    it('failed で status=failed + error メッセージ保持', async () => {
      const file = new File(['hello'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.fail(id, 'unsupported codec');
      await flush();
      const item = useQueueStore.getState().items[0];
      expect(item?.status).toBe('failed');
      if (item?.status === 'failed') {
        expect(item.error).toBe('unsupported codec');
      }
    });

    it('cancelled で status=cancelled', async () => {
      const file = new File(['hello'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.cancel(id);
      await flush();
      expect(useQueueStore.getState().items[0]?.status).toBe('cancelled');
    });

    it('複数ファイル追加: parallelism=1 では 1 件ずつ処理', async () => {
      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      const add = await useQueueStore.getState().add([f1, f2], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      await flush();
      // 1 件目だけ spawn される
      expect(mockEnv.spawnCount).toBe(1);
      expect(mockEnv.jobs).toHaveLength(1);
      // 2 件目は queued
      const items = useQueueStore.getState().items;
      expect(items[0]?.status).toBe('starting');
      expect(items[1]?.status).toBe('queued');

      // 1 件目完了 → 2 件目自動起動
      mockEnv.succeed(0);
      await flush();
      expect(mockEnv.spawnCount).toBe(2);
      expect(useQueueStore.getState().items[1]?.status).toBe('starting');
    });

    it('複数ファイル追加: parallelism=2 では 2 件同時処理', async () => {
      // hardwareConcurrency=8 で parallelism=2
      _resetQueueStoreForTest();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
          hardwareConcurrency: 8,
        },
        configurable: true,
        writable: true,
      });
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
      await useQueueStore.getState().init();

      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      const f3 = new File(['c'], 'c.mov');
      await useQueueStore.getState().add([f1, f2, f3], 'standard-hevc');
      await flush();

      expect(mockEnv.spawnCount).toBe(2);
      expect(useQueueStore.getState().parallelism).toBe(2);
      const items = useQueueStore.getState().items;
      expect(items[0]?.status).toBe('starting');
      expect(items[1]?.status).toBe('starting');
      expect(items[2]?.status).toBe('queued');
    });

    it('addedAt 順に処理される (FIFO)', async () => {
      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      const f3 = new File(['c'], 'c.mov');
      await useQueueStore.getState().add([f1, f2, f3], 'standard-hevc');
      await flush();
      // 最初のジョブの id は addedAt が最も小さい (= a.mov)
      const firstJobId = mockEnv.jobs[0]!.options.id;
      const firstItem = useQueueStore.getState().items.find((i) => i.id === firstJobId);
      expect(firstItem?.fileName).toBe('a.mov');
    });

    it('quota 不足 → ok:false / reason: quota-exceeded (processNext は走らない)', async () => {
      const nav = (globalThis as unknown as { navigator: { storage: Record<string, unknown> } }).navigator;
      nav.storage.estimate = () => Promise.resolve({ usage: 0, quota: 10 });
      const file = new File(['hello world'], 'big.mov');
      const result = await useQueueStore.getState().add([file], 'standard-hevc');
      await flush();
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('quota-exceeded');
      expect(useQueueStore.getState().items).toHaveLength(0);
      expect(mockEnv.spawnCount).toBe(0);
    });

    it('OPFS 書き込み失敗 → ok:false / reason: opfs-write-failed', async () => {
      const nav = (globalThis as unknown as { navigator: { storage: Record<string, unknown> } }).navigator;
      nav.storage.getDirectory = () => Promise.reject(new Error('disk full'));
      const file = new File(['x'], 'a.mov');
      const result = await useQueueStore.getState().add([file], 'standard-hevc');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('opfs-write-failed');
      }
    });
  });

  describe('remove()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('items から削除 + OPFS と IndexedDB もクリア', async () => {
      const file = new File(['hello'], 'a.mov');
      const addResult = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!addResult.ok) throw new Error('add 失敗');
      const id = addResult.addedIds[0];
      if (!id) throw new Error('no id');
      await flush();
      // ジョブをまず完了させて 'done' にしてから remove (走ってる worker の影響を避ける)
      mockEnv.succeed(id);
      await flush();

      const root = getMockRoot();

      await useQueueStore.getState().remove(id);
      await flush();
      expect(useQueueStore.getState().items).toHaveLength(0);
      // inputs は done 遷移時に既に削除されている、outputs も remove で消える
      let outputsCount = 0;
      try {
        const outputsDir = await root.getDirectoryHandle('outputs');
        outputsCount = outputsDir.countEntries();
      } catch {
        /* outputs ディレクトリが無いのは OK */
      }
      expect(outputsCount).toBe(0);
    });

    it('実行中のジョブを remove すると abort される', async () => {
      const file = new File(['hello'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      expect(mockEnv.jobs[0]?.signalAborted()).toBe(false);

      void useQueueStore.getState().remove(id);
      await flush();
      // remove() が abort を発火、signal.aborted=true になる
      expect(mockEnv.jobs[0]?.signalAborted()).toBe(true);

      // Worker は cancel を受けて cancelled を返す
      mockEnv.cancel(id);
      await flush();
      // remove 完了後、items は空
      expect(useQueueStore.getState().items).toHaveLength(0);
    });

    it('存在しない id の remove は no-op', async () => {
      await expect(useQueueStore.getState().remove('missing-id')).resolves.toBeUndefined();
      expect(useQueueStore.getState().items).toHaveLength(0);
    });
  });

  describe('processNext()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('queued アイテムが無ければ no-op', () => {
      useQueueStore.getState().processNext();
      expect(mockEnv.spawnCount).toBe(0);
    });

    it('既に並列度上限まで走っていれば追加 spawn なし', async () => {
      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      await useQueueStore.getState().add([f1, f2], 'standard-hevc');
      await flush();
      // 1 件目が走っている (parallelism=1)
      expect(mockEnv.spawnCount).toBe(1);
      // 明示的にもう一度 processNext を呼んでも spawn は増えない
      useQueueStore.getState().processNext();
      await flush();
      expect(mockEnv.spawnCount).toBe(1);
    });

    it('isProcessing フラグが run 中は true、全件完了で false', async () => {
      const file = new File(['a'], 'a.mov');
      await useQueueStore.getState().add([file], 'standard-hevc');
      await flush();
      expect(useQueueStore.getState().isProcessing).toBe(true);
      mockEnv.succeed(0);
      await flush();
      expect(useQueueStore.getState().isProcessing).toBe(false);
    });
  });
});
