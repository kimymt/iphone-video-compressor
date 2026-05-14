// Phase 5: ShareButton のレンダリング + クリック動作テスト。
// readFromOpfs と shareFile は vi.mock で stub する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ShareButton, { deriveShareFileName } from './ShareButton';

vi.mock('../db/opfs', () => ({
  readFromOpfs: vi.fn(),
}));
vi.mock('../platform/share', () => ({
  shareFile: vi.fn(),
}));

import { readFromOpfs } from '../db/opfs';
import { shareFile } from '../platform/share';

const readFromOpfsMock = readFromOpfs as unknown as ReturnType<typeof vi.fn>;
const shareFileMock = shareFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readFromOpfsMock.mockReset();
  shareFileMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('deriveShareFileName', () => {
  it('拡張子付きは stem + _compressed.mp4', () => {
    expect(deriveShareFileName('IMG_4523.MOV')).toBe('IMG_4523_compressed.mp4');
    expect(deriveShareFileName('a.mov')).toBe('a_compressed.mp4');
  });
  it('拡張子なしも _compressed.mp4', () => {
    expect(deriveShareFileName('clip')).toBe('clip_compressed.mp4');
  });
  it('複数ドットは最後のドット以前を stem 扱い', () => {
    expect(deriveShareFileName('a.b.c.mov')).toBe('a.b.c_compressed.mp4');
  });
});

describe('ShareButton', () => {
  it('Share アイコン + aria-label にファイル名 + 共有', () => {
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="IMG.mov" />);
    const btn = screen.getByTestId('share-button');
    expect(btn).toHaveAttribute('aria-label', 'IMG.mov を共有');
    expect(btn).not.toBeDisabled();
  });

  it('クリックで readFromOpfs → shareFile が呼ばれる', async () => {
    readFromOpfsMock.mockResolvedValueOnce(
      new File(['mp4'], 'inner.mp4', { type: 'video/mp4' }),
    );
    shareFileMock.mockResolvedValueOnce({ kind: 'shared' });
    const onResult = vi.fn();
    render(
      <ShareButton outputOpfsPath="outputs/abc.mp4" fileName="orig.MOV" onResult={onResult} />,
    );
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => {
      expect(readFromOpfsMock).toHaveBeenCalledWith('outputs/abc.mp4');
      expect(shareFileMock).toHaveBeenCalledTimes(1);
    });
    const [, sharedFileName] = shareFileMock.mock.calls[0]!;
    expect(sharedFileName).toBe('orig_compressed.mp4');
    expect(onResult).toHaveBeenCalledWith({ kind: 'shared' });
  });

  it('share 中は disabled + Loader (aria-busy=true)', async () => {
    let resolveRead: ((f: File) => void) | undefined;
    readFromOpfsMock.mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          resolveRead = resolve;
        }),
    );
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" />);
    const btn = screen.getByTestId('share-button');
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveAttribute('aria-busy', 'true');
    // 解決
    resolveRead?.(new File(['x'], 'x.mp4', { type: 'video/mp4' }));
    shareFileMock.mockResolvedValueOnce({ kind: 'shared' });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('readFromOpfs が throw したら onResult に read-failed を返す', async () => {
    readFromOpfsMock.mockRejectedValueOnce(new Error('not found'));
    const onResult = vi.fn();
    render(
      <ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" onResult={onResult} />,
    );
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult).toHaveBeenCalledWith({ kind: 'read-failed', error: 'not found' });
    expect(shareFileMock).not.toHaveBeenCalled();
  });

  it('shareFile が cancelled でも onResult はそのまま通知 (download fallback しない)', async () => {
    readFromOpfsMock.mockResolvedValueOnce(new File(['x'], 'x.mp4', { type: 'video/mp4' }));
    shareFileMock.mockResolvedValueOnce({ kind: 'cancelled' });
    const onResult = vi.fn();
    render(
      <ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" onResult={onResult} />,
    );
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ kind: 'cancelled' }));
  });

  it('busy 中の二重クリックは 1 度しか発火しない', async () => {
    let resolveRead: ((f: File) => void) | undefined;
    readFromOpfsMock.mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          resolveRead = resolve;
        }),
    );
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" />);
    const btn = screen.getByTestId('share-button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(readFromOpfsMock).toHaveBeenCalledTimes(1);
    resolveRead?.(new File(['x'], 'x.mp4'));
    shareFileMock.mockResolvedValueOnce({ kind: 'shared' });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('className prop でデフォルトのスタイルを上書きできる', () => {
    render(
      <ShareButton
        outputOpfsPath="outputs/x.mp4"
        fileName="x.mov"
        className="custom-btn-class"
      />,
    );
    const btn = screen.getByTestId('share-button');
    expect(btn).toHaveClass('custom-btn-class');
    expect(btn).not.toHaveClass('text-[var(--accent)]');
  });
});
