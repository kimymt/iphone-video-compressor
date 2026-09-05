import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  writeInputToOpfs,
  readFromOpfs,
  deleteFromOpfs,
  getOpfsWritable,
  listOutputs,
  outputPath,
} from './opfs';
import { installMockOpfs, resetMockOpfs, getMockRoot } from '../../tests/helpers/mock-opfs';

// JSDOM の File/Blob は .text() が無く、Response も nested Blob を扱えない。
// FileReader 経由で内容を読む。
async function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe('opfs.ts', () => {
  beforeEach(() => {
    installMockOpfs();
  });

  afterEach(() => {
    resetMockOpfs();
  });

  describe('writeInputToOpfs', () => {
    it('inputs/{id}.{ext} のパスで書き込み、元拡張子を保持', async () => {
      const file = new File(['hello'], 'IMG_4523.MOV', { type: 'video/quicktime' });
      const path = await writeInputToOpfs(file, 'abc-123');
      expect(path).toBe('inputs/abc-123.mov');
    });

    it('.mp4 拡張子を保持', async () => {
      const file = new File(['x'], 'video.mp4', { type: 'video/mp4' });
      const path = await writeInputToOpfs(file, 'xyz');
      expect(path).toBe('inputs/xyz.mp4');
    });

    it('拡張子なしファイルは .bin', async () => {
      const file = new File(['x'], 'noext', { type: 'video/mp4' });
      const path = await writeInputToOpfs(file, 'no');
      expect(path).toBe('inputs/no.bin');
    });

    it('書き込んだ内容が読み戻せる', async () => {
      const file = new File(['hello world'], 'a.mov');
      const path = await writeInputToOpfs(file, 'id-1');
      const restored = await readFromOpfs(path);
      const text = await fileToText(restored);
      expect(text).toBe('hello world');
    });
  });

  describe('deleteFromOpfs', () => {
    it('存在するファイルを削除', async () => {
      const file = new File(['x'], 'a.mov');
      const path = await writeInputToOpfs(file, 'id-2');
      await deleteFromOpfs(path);
      await expect(readFromOpfs(path)).rejects.toThrow();
    });

    it('存在しないファイルでも例外を投げない', async () => {
      await expect(deleteFromOpfs('inputs/missing.mov')).resolves.toBeUndefined();
      expect(getMockRoot().countEntries()).toBe(0);
    });

    it('ファイルロック等の削除失敗を呼び出し元に返し、実体を残す', async () => {
      const path = await writeInputToOpfs(new File(['private'], 'a.mov'), 'locked');
      const dir = await getMockRoot().getDirectoryHandle('inputs');
      const error = new DOMException('locked', 'NoModificationAllowedError');
      vi.spyOn(dir, 'removeEntry').mockRejectedValueOnce(error);
      await expect(deleteFromOpfs(path)).rejects.toBe(error);
      expect(await fileToText(await readFromOpfs(path))).toBe('private');
      await deleteFromOpfs(path);
      await expect(readFromOpfs(path)).rejects.toThrow();
    });

    it('不正パスは例外', async () => {
      await expect(deleteFromOpfs('badpath')).rejects.toThrow(/不正な OPFS パス/);
    });
  });

  describe('getOpfsWritable', () => {
    it('outputs/{id}.mp4 への書き込みハンドルを返す', async () => {
      const writable = await getOpfsWritable('outputs/job-1.mp4');
      await writable.write(new Blob(['chunk1']));
      await writable.write(new Blob(['chunk2']));
      await writable.close();
      const f = await readFromOpfs('outputs/job-1.mp4');
      expect(await fileToText(f)).toBe('chunk1chunk2');
    });
  });

  describe('listOutputs', () => {
    it('outputs/ 内のファイル名一覧', async () => {
      await getOpfsWritable('outputs/a.mp4').then((w) => w.close());
      await getOpfsWritable('outputs/b.mp4').then((w) => w.close());
      const names = await listOutputs();
      expect(names.sort()).toEqual(['a.mp4', 'b.mp4']);
    });

    it('outputs/ が空 or 未作成なら空配列', async () => {
      const names = await listOutputs();
      expect(names).toEqual([]);
    });
  });

  describe('outputPath', () => {
    it('id から outputs/{id}.mp4 を生成', () => {
      expect(outputPath('abc')).toBe('outputs/abc.mp4');
    });
  });

  it('inputs/outputs ディレクトリは create:true で自動作成される', async () => {
    expect(getMockRoot().countEntries()).toBe(0);
    const file = new File(['x'], 'a.mp4');
    await writeInputToOpfs(file, 'id-3');
    expect(getMockRoot().countEntries()).toBe(1);
    await getOpfsWritable('outputs/id-3.mp4').then((w) => w.close());
    expect(getMockRoot().countEntries()).toBe(2);
  });
});
