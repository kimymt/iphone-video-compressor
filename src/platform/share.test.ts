// Phase 5: share.ts のユニットテスト。
// - sanitizeFileName: `:` `/` `\` → `_`
// - shareFile: 1GB 超 → download / canShare=true → share / canShare=false → download /
//   AbortError → cancelled / その他 error → download fallback
// - downloadFallback: <a download> click のサイドエフェクト確認

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareFile, shareFiles, sanitizeFileName, downloadFallback, _internal } from './share';

const SIZE_LIMIT = _internal.SHARE_SIZE_LIMIT_BYTES;

describe('sanitizeFileName', () => {
  it('`:` `/` `\\` を `_` に置換', () => {
    expect(sanitizeFileName('a:b/c\\d.mov')).toBe('a_b_c_d.mov');
  });
  it('該当文字が無ければそのまま', () => {
    expect(sanitizeFileName('IMG_4523.mov')).toBe('IMG_4523.mov');
  });
  it('複数連続も全部置換', () => {
    expect(sanitizeFileName('://\\:')).toBe('_____');
  });
  it('空文字は空文字', () => {
    expect(sanitizeFileName('')).toBe('');
  });
});

describe('shareFile', () => {
  let originalShare: typeof navigator.share | undefined;
  let originalCanShare: typeof navigator.canShare | undefined;
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let clickSpy: ReturnType<typeof vi.fn>;
  let createdHrefs: string[];

  beforeEach(() => {
    originalShare = navigator.share;
    originalCanShare = navigator.canShare;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    createdHrefs = [];
    clickSpy = vi.fn();

    // HTMLAnchorElement.click を mock (jsdom デフォルトでは no-op だが明示)
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      value: clickSpy,
      configurable: true,
      writable: true,
    });
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:mock-${createdHrefs.length}-${blob.size}`;
      createdHrefs.push(url);
      return url;
    }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
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
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  function setShareApis(opts: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  }): void {
    if (opts.canShare !== undefined) {
      (navigator as unknown as { canShare: (d: ShareData) => boolean }).canShare = opts.canShare;
    } else {
      delete (navigator as unknown as { canShare?: unknown }).canShare;
    }
    if (opts.share !== undefined) {
      (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share = opts.share;
    } else {
      delete (navigator as unknown as { share?: unknown }).share;
    }
  }

  it('1GB 超は即 download フォールバック (share API は呼ばれない)', async () => {
    const shareSpy = vi.fn(async () => undefined);
    setShareApis({ canShare: () => true, share: shareSpy });
    // 1GB ちょうど + 1 のサイズを mock した Blob
    const big = new Blob([new Uint8Array(8)]);
    Object.defineProperty(big, 'size', { value: SIZE_LIMIT + 1, configurable: true });
    const result = await shareFile(big, 'huge.mp4');
    expect(result).toEqual({ kind: 'downloaded' });
    expect(shareSpy).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('canShare=true + share OK → kind: shared', async () => {
    const shareSpy = vi.fn(async () => undefined);
    setShareApis({ canShare: () => true, share: shareSpy });
    const blob = new Blob(['mock'], { type: 'video/mp4' });
    const result = await shareFile(blob, 'a.mp4');
    expect(result).toEqual({ kind: 'shared' });
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('canShare=true + AbortError → kind: cancelled', async () => {
    const abort = new Error('user cancelled');
    abort.name = 'AbortError';
    setShareApis({
      canShare: () => true,
      share: vi.fn(async () => {
        throw abort;
      }),
    });
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const result = await shareFile(blob, 'a.mp4');
    expect(result).toEqual({ kind: 'cancelled' });
    // cancel は fallback しない
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('canShare=true + AbortError 以外のエラー → download fallback', async () => {
    setShareApis({
      canShare: () => true,
      share: vi.fn(async () => {
        throw new Error('permission denied');
      }),
    });
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const result = await shareFile(blob, 'a.mp4');
    expect(result).toEqual({ kind: 'downloaded' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('canShare=false → download fallback', async () => {
    const shareSpy = vi.fn(async () => undefined);
    setShareApis({ canShare: () => false, share: shareSpy });
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const result = await shareFile(blob, 'a.mp4');
    expect(result).toEqual({ kind: 'downloaded' });
    expect(shareSpy).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('canShare 未実装 (navigator に share/canShare なし) → download fallback', async () => {
    setShareApis({});
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const result = await shareFile(blob, 'a.mp4');
    expect(result).toEqual({ kind: 'downloaded' });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('fileName が sanitize されて share に渡る', async () => {
    let captured: File | undefined;
    setShareApis({
      canShare: (data) => {
        captured = data.files?.[0];
        return true;
      },
      share: vi.fn(async () => undefined),
    });
    const blob = new Blob(['x'], { type: 'video/mp4' });
    await shareFile(blob, 'a:b/c\\d.mp4');
    expect(captured?.name).toBe('a_b_c_d.mp4');
  });

  // ---- V2: shareFiles (バルク保存) ----

  describe('shareFiles (V2 bulk save)', () => {
    function makeBlob(size = 1000): Blob {
      const b = new Blob(['x'], { type: 'video/mp4' });
      Object.defineProperty(b, 'size', { value: size, configurable: true });
      return b;
    }

    it('空配列は failed-multi (no files to share)', async () => {
      const result = await shareFiles([], []);
      expect(result.kind).toBe('failed-multi');
      if (result.kind === 'failed-multi') {
        expect(result.error).toMatch(/no files/);
      }
    });

    it('blobs と fileNames の長さ不一致は failed-multi', async () => {
      const result = await shareFiles([makeBlob(), makeBlob()], ['a.mp4']);
      expect(result.kind).toBe('failed-multi');
      if (result.kind === 'failed-multi') {
        expect(result.error).toMatch(/length mismatch/);
      }
    });

    it('合計サイズ 1GB 超は failed-multi (個別保存に誘導)', async () => {
      const big = makeBlob(SIZE_LIMIT / 2 + 1);
      const big2 = makeBlob(SIZE_LIMIT / 2 + 1);
      const result = await shareFiles([big, big2], ['a.mp4', 'b.mp4']);
      expect(result.kind).toBe('failed-multi');
      if (result.kind === 'failed-multi') {
        expect(result.error).toMatch(/total size .* exceeds/);
      }
    });

    it('canShare 未実装は failed-multi', async () => {
      setShareApis({});
      const result = await shareFiles([makeBlob()], ['a.mp4']);
      expect(result.kind).toBe('failed-multi');
    });

    it('canShare(files: [...]) が false → failed-multi', async () => {
      setShareApis({ canShare: () => false, share: vi.fn(async () => undefined) });
      const result = await shareFiles([makeBlob(), makeBlob()], ['a.mp4', 'b.mp4']);
      expect(result.kind).toBe('failed-multi');
      if (result.kind === 'failed-multi') {
        expect(result.error).toMatch(/canShare/);
      }
    });

    it('share 成功 → kind: shared (1 回呼び出し、files 配列で複数件)', async () => {
      let capturedFiles: File[] | undefined;
      const shareSpy = vi.fn(async (data: ShareData) => {
        capturedFiles = data.files !== undefined ? Array.from(data.files) : undefined;
      });
      setShareApis({ canShare: () => true, share: shareSpy });
      const result = await shareFiles(
        [makeBlob(), makeBlob(), makeBlob()],
        ['a.mp4', 'b.mp4', 'c.mp4'],
      );
      expect(result).toEqual({ kind: 'shared' });
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(capturedFiles).toHaveLength(3);
      expect(capturedFiles?.map((f) => f.name)).toEqual(['a.mp4', 'b.mp4', 'c.mp4']);
    });

    it('share AbortError → kind: cancelled (個別保存に誘導しない)', async () => {
      const abort = new Error('user cancelled');
      abort.name = 'AbortError';
      setShareApis({
        canShare: () => true,
        share: vi.fn(async () => {
          throw abort;
        }),
      });
      const result = await shareFiles([makeBlob()], ['a.mp4']);
      expect(result).toEqual({ kind: 'cancelled' });
    });

    it('share の AbortError 以外のエラー → failed-multi (個別保存に誘導)', async () => {
      setShareApis({
        canShare: () => true,
        share: vi.fn(async () => {
          throw new Error('permission denied');
        }),
      });
      const result = await shareFiles([makeBlob()], ['a.mp4']);
      expect(result.kind).toBe('failed-multi');
      if (result.kind === 'failed-multi') {
        expect(result.error).toMatch(/permission denied/);
      }
    });

    it('fileName が全件 sanitize されて File に変換される', async () => {
      let capturedFiles: File[] | undefined;
      setShareApis({
        canShare: (data) => {
          capturedFiles = data.files !== undefined ? Array.from(data.files) : undefined;
          return true;
        },
        share: vi.fn(async () => undefined),
      });
      await shareFiles(
        [makeBlob(), makeBlob()],
        ['a:b/c.mp4', 'normal.mp4'],
      );
      expect(capturedFiles?.map((f) => f.name)).toEqual(['a_b_c.mp4', 'normal.mp4']);
    });
  });

  it('downloadFallback は a.download に sanitized 名を設定', () => {
    let downloadAttr: string | undefined;
    const origCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'download', {
          set(v) {
            downloadAttr = v;
          },
          configurable: true,
        });
      }
      return el;
    });
    const blob = new Blob(['x'], { type: 'video/mp4' });
    const result = downloadFallback(blob, 'sanitized.mp4');
    expect(result).toEqual({ kind: 'downloaded' });
    expect(downloadAttr).toBe('sanitized.mp4');
    createSpy.mockRestore();
  });
});
