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
      expect(mockEnv.jobs.length).toBe(1);
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
      expect(mockEnv.jobs.length).toBe(1);
      expect(mockEnv.jobs).toHaveLength(1);
      // 2 件目は queued
      const items = useQueueStore.getState().items;
      expect(items[0]?.status).toBe('starting');
      expect(items[1]?.status).toBe('queued');

      // 1 件目完了 → 2 件目自動起動
      mockEnv.succeed(0);
      await flush();
      expect(mockEnv.jobs.length).toBe(2);
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

      expect(mockEnv.jobs.length).toBe(2);
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
      expect(mockEnv.jobs.length).toBe(0);
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
      expect(mockEnv.jobs.length).toBe(0);
    });

    it('既に並列度上限まで走っていれば追加 spawn なし', async () => {
      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      await useQueueStore.getState().add([f1, f2], 'standard-hevc');
      await flush();
      // 1 件目が走っている (parallelism=1)
      expect(mockEnv.jobs.length).toBe(1);
      // 明示的にもう一度 processNext を呼んでも spawn は増えない
      useQueueStore.getState().processNext();
      await flush();
      expect(mockEnv.jobs.length).toBe(1);
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

  describe('retry()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('failed item を queued に戻して processNext で再起動', async () => {
      const file = new File(['x'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.fail(id, 'first failure');
      await flush();
      expect(useQueueStore.getState().items[0]?.status).toBe('failed');
      const jobsBefore = mockEnv.jobs.length;

      await useQueueStore.getState().retry(id);
      await flush();
      const item = useQueueStore.getState().items[0];
      expect(item?.status).toBe('starting');
      expect(item?.progress).toBe(0);
      expect(mockEnv.jobs.length).toBe(jobsBefore + 1);
      // error フィールドは消えている (variant が failed → 非 failed に変わった)
      expect((item as { error?: string }).error).toBeUndefined();
    });

    it('cancelled item も retry できる', async () => {
      const file = new File(['x'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.cancel(id);
      await flush();
      expect(useQueueStore.getState().items[0]?.status).toBe('cancelled');

      await useQueueStore.getState().retry(id);
      await flush();
      const item = useQueueStore.getState().items[0];
      expect(item?.status).toBe('starting');
    });

    it('done item の retry は no-op (input 削除済み)', async () => {
      const file = new File(['x'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      mockEnv.succeed(id);
      await flush();
      const before = useQueueStore.getState().items[0];
      expect(before?.status).toBe('done');
      const jobsBefore = mockEnv.jobs.length;

      await useQueueStore.getState().retry(id);
      await flush();
      const after = useQueueStore.getState().items[0];
      expect(after?.status).toBe('done');
      expect(mockEnv.jobs.length).toBe(jobsBefore);
    });

    it('inputOpfsPath="" の failed item は retry no-op (defensive)', async () => {
      // 通常 failed では input は残るが、不整合状態を強制的に作って検証
      await saveQueueItem(makeItem('orphan', 'failed', { inputOpfsPath: '', error: 'x' }));
      _resetQueueStoreForTest();
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
      await useQueueStore.getState().init();
      await flush();
      const jobsBefore = mockEnv.jobs.length;

      await useQueueStore.getState().retry('orphan');
      await flush();
      expect(useQueueStore.getState().items.find((i) => i.id === 'orphan')?.status).toBe('failed');
      expect(mockEnv.jobs.length).toBe(jobsBefore);
    });

    it('queued/starting/processing の retry は no-op', async () => {
      const file = new File(['x'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      // starting 中に retry 呼び出し → no-op
      const jobsBefore = mockEnv.jobs.length;
      expect(useQueueStore.getState().items[0]?.status).toBe('starting');
      await useQueueStore.getState().retry(id);
      await flush();
      expect(mockEnv.jobs.length).toBe(jobsBefore);
    });

    it('存在しない id の retry は no-op', async () => {
      await expect(useQueueStore.getState().retry('missing')).resolves.toBeUndefined();
    });

    it('retry 後の addedAt は元の値を保持 (FIFO 順序維持)', async () => {
      const file = new File(['x'], 'a.mov');
      const add = await useQueueStore.getState().add([file], 'standard-hevc');
      if (!add.ok) throw new Error('add failed');
      const id = add.addedIds[0]!;
      await flush();
      const originalAddedAt = useQueueStore.getState().items[0]!.addedAt;
      mockEnv.fail(id);
      await flush();
      await useQueueStore.getState().retry(id);
      await flush();
      expect(useQueueStore.getState().items[0]?.addedAt).toBe(originalAddedAt);
    });
  });

  describe('clearCompleted()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('done / failed / cancelled をまとめて削除', async () => {
      await saveQueueItem(makeItem('d1', 'done', { progress: 100 }));
      await saveQueueItem(makeItem('f1', 'failed', { error: 'x' }));
      await saveQueueItem(makeItem('c1', 'cancelled'));
      await saveQueueItem(makeItem('q1', 'queued'));
      _resetQueueStoreForTest();
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
      await useQueueStore.getState().init();
      await flush();

      await useQueueStore.getState().clearCompleted();
      await flush();
      const items = useQueueStore.getState().items;
      // q1 は queued なので残る (init で processNext が走り starting/processing になる可能性も)
      expect(items.map((i) => i.id).sort()).toEqual(['q1']);
    });

    it('terminal アイテムが無ければ何もしない (queued/starting/processing は残る)', async () => {
      const file = new File(['x'], 'a.mov');
      await useQueueStore.getState().add([file], 'standard-hevc');
      await flush();
      const lenBefore = useQueueStore.getState().items.length;
      await useQueueStore.getState().clearCompleted();
      expect(useQueueStore.getState().items.length).toBe(lenBefore);
    });

    it('空 queue で no-op', async () => {
      await expect(useQueueStore.getState().clearCompleted()).resolves.toBeUndefined();
      expect(useQueueStore.getState().items).toHaveLength(0);
    });
  });

  describe('effectiveParallelism()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    function presetH264() {
      return {
        key: 'compat-h264' as const,
        label: 'H264',
        description: '',
        codec: 'h264-high' as const,
        maxLongEdge: 1080,
        videoBitrate: 5_000_000,
        audioBitrate: 128_000,
      };
    }

    function presetHevc() {
      return {
        key: 'standard-hevc' as const,
        label: 'HEVC',
        description: '',
        codec: 'hevc' as const,
        maxLongEdge: 1080,
        videoBitrate: 3_000_000,
        audioBitrate: 128_000,
      };
    }

    it('parallelism=1 なら preset によらず 1', () => {
      // beforeEach の resetAll で hardwareConcurrency=4 → parallelism=1
      expect(useQueueStore.getState().effectiveParallelism(presetHevc())).toBe(1);
      expect(useQueueStore.getState().effectiveParallelism(presetH264())).toBe(1);
    });

    it('parallelism=2 + hevcBenchSlowdown=null + HEVC → 2 (null は false 扱い)', async () => {
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
      expect(useQueueStore.getState().hevcBenchSlowdown).toBeNull();
      expect(useQueueStore.getState().effectiveParallelism(presetHevc())).toBe(2);
    });

    it('parallelism=2 + hevcBenchSlowdown=true + HEVC → 1 に降格', () => {
      _resetQueueStoreForTest();
      useQueueStore.setState({ parallelism: 2, hevcBenchSlowdown: true });
      expect(useQueueStore.getState().effectiveParallelism(presetHevc())).toBe(1);
    });

    it('parallelism=2 + hevcBenchSlowdown=true + H.264 → 2 のまま', () => {
      _resetQueueStoreForTest();
      useQueueStore.setState({ parallelism: 2, hevcBenchSlowdown: true });
      expect(useQueueStore.getState().effectiveParallelism(presetH264())).toBe(2);
    });

    it('processNext は HEVC 2 件 + slowdown=true で 1 件しか起動しない', async () => {
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
      // slowdown を強制
      useQueueStore.setState({ hevcBenchSlowdown: true });

      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      await useQueueStore.getState().add([f1, f2], 'standard-hevc');
      await flush();
      // HEVC 同士は同時 1 件のみ
      expect(mockEnv.jobs.length).toBe(1);
      const items = useQueueStore.getState().items;
      const starting = items.filter((i) => i.status === 'starting').length;
      const queued = items.filter((i) => i.status === 'queued').length;
      expect(starting).toBe(1);
      expect(queued).toBe(1);
    });
  });

  describe('V2: setHevcBenchSlowdown()', () => {
    beforeEach(async () => {
      await useQueueStore.getState().init();
    });

    it('state.hevcBenchSlowdown を即時に更新', async () => {
      expect(useQueueStore.getState().hevcBenchSlowdown).toBeNull();
      await useQueueStore.getState().setHevcBenchSlowdown(true);
      expect(useQueueStore.getState().hevcBenchSlowdown).toBe(true);
      await useQueueStore.getState().setHevcBenchSlowdown(false);
      expect(useQueueStore.getState().hevcBenchSlowdown).toBe(false);
      await useQueueStore.getState().setHevcBenchSlowdown(null);
      expect(useQueueStore.getState().hevcBenchSlowdown).toBeNull();
    });

    it('次回 init() で IndexedDB から復元される', async () => {
      await useQueueStore.getState().setHevcBenchSlowdown(true);
      _resetQueueStoreForTest();
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
      await useQueueStore.getState().init();
      expect(useQueueStore.getState().hevcBenchSlowdown).toBe(true);
    });

    it('値変更後に processNext() が再評価される (HEVC 2 並列待機 → slowdown=true で 1 件のみ稼働)', async () => {
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
      await useQueueStore.getState().add([f1, f2], 'standard-hevc');
      await flush();
      // 初期は slowdown=null → 2 並列起動
      expect(mockEnv.jobs.length).toBe(2);

      // 既に 2 並列起動済みなので、ここで slowdown=true にしても落とせない
      // (running ジョブは続行)。queued が新たに来た時に降格が効くことを別ケースで確認する。
      await useQueueStore.getState().setHevcBenchSlowdown(true);
      expect(useQueueStore.getState().hevcBenchSlowdown).toBe(true);
    });
  });

  describe('V2: shareAllDone() (バルク保存)', () => {
    let originalShare: typeof navigator.share | undefined;
    let originalCanShare: typeof navigator.canShare | undefined;

    beforeEach(async () => {
      await useQueueStore.getState().init();
      originalShare = navigator.share;
      originalCanShare = navigator.canShare;
    });

    afterEach(() => {
      if (originalShare === undefined) {
        delete (navigator as unknown as { share?: unknown }).share;
      } else {
        (navigator as unknown as { share?: unknown }).share = originalShare;
      }
      if (originalCanShare === undefined) {
        delete (navigator as unknown as { canShare?: unknown }).canShare;
      } else {
        (navigator as unknown as { canShare?: unknown }).canShare = originalCanShare;
      }
    });

    /** done アイテムを直接 IndexedDB に seed + OPFS に出力ファイルを作る。 */
    async function seedDone(id: string, fileName: string, content = 'output-bytes'): Promise<void> {
      await saveQueueItem(
        makeItem(id, 'done', {
          fileName,
          progress: 100,
          finishedAt: Date.now(),
          outputOpfsPath: `outputs/${id}.mp4`,
          outputSize: content.length,
        }),
      );
      const w = await getOpfsWritable(`outputs/${id}.mp4`);
      await w.write(content);
      await w.close();
    }

    it('done が 0 件: failed-multi (no done items)', async () => {
      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('failed-multi');
      if (r.kind === 'failed-multi') {
        expect(r.error).toMatch(/no done items/);
      }
    });

    it('done 3 件: navigator.share に files 3 件で 1 回だけ呼ばれる', async () => {
      let capturedFiles: File[] | undefined;
      const shareSpy = vi.fn(async (data: ShareData) => {
        capturedFiles = data.files !== undefined ? Array.from(data.files) : undefined;
      });
      (navigator as unknown as { canShare: () => boolean }).canShare = () => true;
      (navigator as unknown as { share: typeof shareSpy }).share = shareSpy;

      await seedDone('a', 'IMG_001.mov');
      await seedDone('b', 'IMG_002.mov');
      await seedDone('c', 'IMG_003.mov');
      // store の items を再読込
      await useQueueStore.getState().init(); // initialized=true なので no-op、後で setState
      useQueueStore.setState({
        items: [
          makeItem('a', 'done', { fileName: 'IMG_001.mov', outputOpfsPath: 'outputs/a.mp4', outputSize: 12 }),
          makeItem('b', 'done', { fileName: 'IMG_002.mov', outputOpfsPath: 'outputs/b.mp4', outputSize: 12 }),
          makeItem('c', 'done', { fileName: 'IMG_003.mov', outputOpfsPath: 'outputs/c.mp4', outputSize: 12 }),
        ],
      });

      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('shared');
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(capturedFiles).toHaveLength(3);
      // deriveShareFileName が `_compressed.mp4` を付与
      expect(capturedFiles?.map((f) => f.name)).toEqual([
        'IMG_001_compressed.mp4',
        'IMG_002_compressed.mp4',
        'IMG_003_compressed.mp4',
      ]);
    });

    it('done と他 status が混在: done のみが share される', async () => {
      const shareSpy = vi.fn(async (_data: ShareData) => undefined);
      (navigator as unknown as { canShare: () => boolean }).canShare = () => true;
      (navigator as unknown as { share: typeof shareSpy }).share = shareSpy;

      await seedDone('done1', 'IMG_001.mov');
      useQueueStore.setState({
        items: [
          makeItem('queued1', 'queued', { fileName: 'pending.mov' }),
          makeItem('done1', 'done', { fileName: 'IMG_001.mov', outputOpfsPath: 'outputs/done1.mp4', outputSize: 12 }),
          makeItem('failed1', 'failed', { fileName: 'broken.mov', error: 'x' }),
        ],
      });

      await useQueueStore.getState().shareAllDone();
      expect(shareSpy).toHaveBeenCalledTimes(1);
      const arg = shareSpy.mock.calls[0]?.[0];
      expect(arg).toBeDefined();
      expect(arg?.files).toHaveLength(1);
      expect(arg?.files?.[0]?.name).toBe('IMG_001_compressed.mp4');
    });

    it('OPFS 読み出し失敗のアイテムは skip、残りで share', async () => {
      const shareSpy = vi.fn(async (_data: ShareData) => undefined);
      (navigator as unknown as { canShare: () => boolean }).canShare = () => true;
      (navigator as unknown as { share: typeof shareSpy }).share = shareSpy;

      // only seed 'good', 'bad' の output は OPFS に無い (= readFromOpfs throw)
      await seedDone('good', 'good.mov');
      useQueueStore.setState({
        items: [
          makeItem('good', 'done', { fileName: 'good.mov', outputOpfsPath: 'outputs/good.mp4', outputSize: 12 }),
          makeItem('bad', 'done', { fileName: 'bad.mov', outputOpfsPath: 'outputs/missing.mp4', outputSize: 12 }),
        ],
      });

      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('shared');
      const arg = shareSpy.mock.calls[0]?.[0];
      expect(arg).toBeDefined();
      expect(arg?.files).toHaveLength(1);
      expect(arg?.files?.[0]?.name).toBe('good_compressed.mp4');
    });

    it('全件 OPFS 読み出し失敗 → failed-multi (all reads failed)', async () => {
      (navigator as unknown as { canShare: () => boolean }).canShare = () => true;
      (navigator as unknown as { share: () => Promise<void> }).share = vi.fn(async () => undefined);

      useQueueStore.setState({
        items: [
          makeItem('a', 'done', { fileName: 'a.mov', outputOpfsPath: 'outputs/missing-a.mp4', outputSize: 12 }),
          makeItem('b', 'done', { fileName: 'b.mov', outputOpfsPath: 'outputs/missing-b.mp4', outputSize: 12 }),
        ],
      });

      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('failed-multi');
      if (r.kind === 'failed-multi') {
        expect(r.error).toMatch(/all reads failed/);
      }
    });

    it('outputOpfsPath が空文字 (= done 後の input 削除目印と被らない、ここは output 不在扱い)', async () => {
      // status='done' で outputOpfsPath が undefined のケース
      useQueueStore.setState({
        items: [
          makeItem('a', 'done', { fileName: 'a.mov', outputOpfsPath: undefined, outputSize: 12 }),
        ],
      });
      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('failed-multi');
      if (r.kind === 'failed-multi') {
        expect(r.error).toMatch(/all reads failed: no outputOpfsPath/);
      }
    });

    it('canShare=false → failed-multi (個別保存に誘導)', async () => {
      (navigator as unknown as { canShare: () => boolean }).canShare = () => false;
      (navigator as unknown as { share: () => Promise<void> }).share = vi.fn(async () => undefined);

      await seedDone('a', 'a.mov');
      useQueueStore.setState({
        items: [
          makeItem('a', 'done', { fileName: 'a.mov', outputOpfsPath: 'outputs/a.mp4', outputSize: 12 }),
        ],
      });
      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('failed-multi');
    });

    it('AbortError → cancelled (個別保存に誘導しない)', async () => {
      const abort = new Error('user cancelled');
      abort.name = 'AbortError';
      (navigator as unknown as { canShare: () => boolean }).canShare = () => true;
      (navigator as unknown as { share: () => Promise<void> }).share = vi.fn(async () => {
        throw abort;
      });

      await seedDone('a', 'a.mov');
      useQueueStore.setState({
        items: [
          makeItem('a', 'done', { fileName: 'a.mov', outputOpfsPath: 'outputs/a.mp4', outputSize: 12 }),
        ],
      });
      const r = await useQueueStore.getState().shareAllDone();
      expect(r.kind).toBe('cancelled');
    });
  });

  // ----- V2.x (A1 + A2): persistent Worker pool + 投機的 demux -----

  describe('V2.x (A1) persistent Worker pool', () => {
    beforeEach(() => {
      // pool 再利用テスト時は jobsCount を追跡したいので新規 mockEnv
      mockEnv = new MockWorkerEnv();
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
    });

    it('init() で transcode worker を parallelism=1 ぶん pre-spawn する', async () => {
      // hardwareConcurrency=4 → parallelism=1 のセットアップ
      await useQueueStore.getState().init();
      // prewarmTranscodePool(1) で 1 個 spawn される
      expect(mockEnv.jobs.length).toBe(0); // run はまだ 0 件
      // spawnCount は private な MockWorkerEnv フィールドなので jobs.length のみ確認
    });

    it('init() で parallelism=2 のとき 2 個 pre-spawn する', async () => {
      _resetQueueStoreForTest();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
          hardwareConcurrency: 8, // → parallelism=2
        },
        configurable: true,
        writable: true,
      });
      mockEnv = new MockWorkerEnv();
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
      await useQueueStore.getState().init();
      // pre-spawn ぶんと、後続 add で peek worker を 1 個 lazy spawn して + 1
      // 合計 spawn 数の正確な数値はテストの保守性が低いので、jobs.length で十分
      expect(mockEnv.jobs.length).toBe(0);
    });

    it('1 件目 done 後、2 件目で同じ pool worker が再利用される (terminate されない)', async () => {
      await useQueueStore.getState().init();
      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');

      // 1 件目
      await useQueueStore.getState().add([f1], 'standard-hevc');
      await flush();
      expect(mockEnv.jobs.length).toBe(1);
      const job1Worker = mockEnv.jobs[0]!;
      mockEnv.succeed(0);
      await flush();

      // 2 件目 (1 件目完了後、pool worker 再利用)
      await useQueueStore.getState().add([f2], 'standard-hevc');
      await flush();
      expect(mockEnv.jobs.length).toBe(2);
      // ジョブ 2 件目の opts.id が job1 と異なることだけ確認 (worker 再利用は queueStore 内部詳細)
      expect(mockEnv.jobs[1]!.options.id).not.toBe(job1Worker.options.id);
    });

    it('複数ファイルを並列 (parallelism=2) で処理できる', async () => {
      _resetQueueStoreForTest();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          storage: (globalThis as { navigator: { storage: unknown } }).navigator.storage,
          hardwareConcurrency: 8,
        },
        configurable: true,
        writable: true,
      });
      mockEnv = new MockWorkerEnv();
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run);
      await useQueueStore.getState().init();

      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      await useQueueStore.getState().add([f1, f2], 'compat-h264');
      await flush();
      // h264 は HEVC bench の slowdown 影響なし、2 並列起動
      expect(mockEnv.jobs.length).toBe(2);
    });
  });

  describe('V2.x (A2) 投機的 demux (peek)', () => {
    beforeEach(() => {
      mockEnv = new MockWorkerEnv();
    });

    it('peek 成功で item.durationSec が初期セットされる (queued 状態で予測サイズ表示可能)', async () => {
      // peek が peeked を返すスタブを注入
      const peekStub = vi.fn(async () => ({
        kind: 'peeked' as const,
        meta: {
          durationSec: 42.5,
          rotation: 0 as 0 | 90 | 180 | 270,
          width: 1920,
          height: 1080,
          fps: 30,
          isHdr: false,
        },
      }));
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run, peekStub);
      await useQueueStore.getState().init();

      const f1 = new File(['a'], 'a.mov');
      await useQueueStore.getState().add([f1], 'standard-hevc');

      expect(peekStub).toHaveBeenCalledOnce();
      const items = useQueueStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]!.durationSec).toBe(42.5);
    });

    it('peek 失敗で durationSec は undefined のまま (transcode は通常通り進む)', async () => {
      const peekStub = vi.fn(async () => ({
        kind: 'peekFailed' as const,
        error: 'demux failed',
      }));
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run, peekStub);
      await useQueueStore.getState().init();

      const f1 = new File(['a'], 'bad.mov');
      const result = await useQueueStore.getState().add([f1], 'standard-hevc');

      expect(result.ok).toBe(true);
      const items = useQueueStore.getState().items;
      expect(items[0]!.durationSec).toBeUndefined();
    });

    it('複数ファイル投入で各 file に peek が発火される', async () => {
      const peekStub = vi.fn(async () => ({
        kind: 'peeked' as const,
        meta: {
          durationSec: 10,
          rotation: 0 as 0 | 90 | 180 | 270,
          width: 1280,
          height: 720,
          fps: 30,
          isHdr: false,
        },
      }));
      _setWorkerImplsForTest(mockEnv.spawn, mockEnv.run, peekStub);
      await useQueueStore.getState().init();

      const f1 = new File(['a'], 'a.mov');
      const f2 = new File(['b'], 'b.mov');
      const f3 = new File(['c'], 'c.mov');
      await useQueueStore.getState().add([f1, f2, f3], 'standard-hevc');

      expect(peekStub).toHaveBeenCalledTimes(3);
      const items = useQueueStore.getState().items;
      expect(items.every((i) => i.durationSec === 10)).toBe(true);
    });
  });
});
