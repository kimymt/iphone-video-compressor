// Phase 5: ShareButton のレンダリング + クリック動作テスト。
// Phase 7: onResult prop 廃止、結果は toastStore に push されることを検証。
// readFromOpfs と shareFile は vi.mock で stub する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ShareButton, { deriveShareFileName } from './ShareButton';
import { useToastStore, _resetToastStoreForTest } from '../stores/toastStore';

vi.mock('../db/opfs', () => ({
  readFromOpfs: vi.fn(),
}));
vi.mock('../platform/share', async () => {
  // shareFile は mock したいが、deriveShareFileName / sanitizeFileName は
  // 本物を維持する (ShareButton から re-export されてテストで使うため)。
  const actual = await vi.importActual<typeof import('../platform/share')>('../platform/share');
  return {
    ...actual,
    shareFile: vi.fn(),
  };
});

import { readFromOpfs } from '../db/opfs';
import { shareFile } from '../platform/share';

const readFromOpfsMock = readFromOpfs as unknown as ReturnType<typeof vi.fn>;
const shareFileMock = shareFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readFromOpfsMock.mockReset();
  shareFileMock.mockReset();
  _resetToastStoreForTest();
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

  it('クリックで readFromOpfs → shareFile が呼ばれる、shared は silent (toast なし)', async () => {
    readFromOpfsMock.mockResolvedValueOnce(
      new File(['mp4'], 'inner.mp4', { type: 'video/mp4' }),
    );
    shareFileMock.mockResolvedValueOnce({ kind: 'shared' });
    render(<ShareButton outputOpfsPath="outputs/abc.mp4" fileName="orig.MOV" />);
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => {
      expect(readFromOpfsMock).toHaveBeenCalledWith('outputs/abc.mp4');
      expect(shareFileMock).toHaveBeenCalledTimes(1);
    });
    const [, sharedFileName] = shareFileMock.mock.calls[0]!;
    expect(sharedFileName).toBe('orig_compressed.mp4');
    expect(useToastStore.getState().items).toHaveLength(0);
  });

  it('downloaded は success トースト', async () => {
    readFromOpfsMock.mockResolvedValueOnce(new File(['x'], 'x.mp4'));
    shareFileMock.mockResolvedValueOnce({ kind: 'downloaded' });
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" />);
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => expect(useToastStore.getState().items).toHaveLength(1));
    const t = useToastStore.getState().items[0]!;
    expect(t.kind).toBe('success');
    expect(t.message).toContain('ダウンロードを開始しました');
  });

  it('cancelled は info トースト「共有がキャンセルされました」', async () => {
    readFromOpfsMock.mockResolvedValueOnce(new File(['x'], 'x.mp4'));
    shareFileMock.mockResolvedValueOnce({ kind: 'cancelled' });
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" />);
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => expect(useToastStore.getState().items).toHaveLength(1));
    const t = useToastStore.getState().items[0]!;
    expect(t.kind).toBe('info');
    expect(t.message).toBe('共有がキャンセルされました');
  });

  it('shareFile.failed は error トースト + エラーメッセージ', async () => {
    readFromOpfsMock.mockResolvedValueOnce(new File(['x'], 'x.mp4'));
    shareFileMock.mockResolvedValueOnce({ kind: 'failed', error: 'no permission' });
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" />);
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => expect(useToastStore.getState().items).toHaveLength(1));
    const t = useToastStore.getState().items[0]!;
    expect(t.kind).toBe('error');
    expect(t.message).toContain('共有に失敗しました');
    expect(t.message).toContain('no permission');
  });

  it('readFromOpfs が throw → read-failed の error トースト', async () => {
    readFromOpfsMock.mockRejectedValueOnce(new Error('not found'));
    render(<ShareButton outputOpfsPath="outputs/x.mp4" fileName="x.mov" />);
    fireEvent.click(screen.getByTestId('share-button'));
    await waitFor(() => expect(useToastStore.getState().items).toHaveLength(1));
    const t = useToastStore.getState().items[0]!;
    expect(t.kind).toBe('error');
    expect(t.message).toContain('出力ファイルの読み込みに失敗しました');
    expect(t.message).toContain('not found');
    expect(shareFileMock).not.toHaveBeenCalled();
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
    resolveRead?.(new File(['x'], 'x.mp4', { type: 'video/mp4' }));
    shareFileMock.mockResolvedValueOnce({ kind: 'shared' });
    await waitFor(() => expect(btn).not.toBeDisabled());
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
