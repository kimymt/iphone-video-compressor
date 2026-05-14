import { describe, it, expectTypeOf } from 'vitest';
import type { PresetKey, QueueItem, EnvCheck } from './types';

// Phase 0 型レベルテスト: types.ts が strict mode で正しく型を表現することの確認。
// 実行時のランタイムテストは Phase 2 以降のストア / ピペライン側で行う。
describe('types.ts', () => {
  it('PresetKey に 6 個の値のみが含まれ、custom は含まない', () => {
    expectTypeOf<PresetKey>().toEqualTypeOf<
      | 'best-hevc'
      | 'high-hevc'
      | 'standard-hevc'
      | 'light-hevc'
      | 'compat-h264'
      | 'min-h264'
    >();
  });

  it('QueueItem の failed status は error 必須', () => {
    // discriminated union: status === 'failed' なら error: string が必須
    const failedItem: QueueItem = {
      id: 'x',
      fileName: 'a.mov',
      inputSize: 100,
      inputOpfsPath: 'inputs/x.mov',
      progress: 50,
      preset: 'standard-hevc',
      addedAt: 0,
      status: 'failed',
      error: '失敗の理由',
    };
    expectTypeOf(failedItem).toMatchTypeOf<QueueItem>();
  });

  it('QueueItem の done status は error フィールドを持たない', () => {
    const doneItem: QueueItem = {
      id: 'y',
      fileName: 'b.mov',
      inputSize: 100,
      inputOpfsPath: '',
      outputOpfsPath: 'outputs/y.mp4',
      outputSize: 30,
      progress: 100,
      preset: 'standard-hevc',
      addedAt: 0,
      status: 'done',
    };
    expectTypeOf(doneItem).toMatchTypeOf<QueueItem>();
  });

  it('EnvCheck の全フィールドが boolean', () => {
    expectTypeOf<EnvCheck>().toHaveProperty('videoEncoder').toBeBoolean();
    expectTypeOf<EnvCheck>().toHaveProperty('canRun').toBeBoolean();
    expectTypeOf<EnvCheck>().toHaveProperty('hevcEncode').toBeBoolean();
  });
});
