// In-memory OPFS mock for Vitest. JSDOM には OPFS が無いため自前で実装。
// API surface は `src/db/opfs.ts` が使う最低限のみカバー:
//  - navigator.storage.getDirectory() → root dir
//  - dir.getDirectoryHandle(name, { create: true })
//  - dir.getFileHandle(name, { create?: true })
//  - dir.removeEntry(name)
//  - dir[Symbol.asyncIterator]() → [name, handle] のペアを返す
//  - file.createWritable()
//  - file.getFile()
//  - writable.write(data)、writable.close()

/** 任意の BlobPart を ArrayBuffer に変換 (JSDOM の nested Blob 不具合を回避) */
async function partToArrayBuffer(data: BlobPart): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).buffer as ArrayBuffer;
  }
  // Blob / File → FileReader 経由で arrayBuffer
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(data);
  });
}

function mergeBuffers(parts: ArrayBuffer[]): ArrayBuffer {
  const total = parts.reduce((s, p) => s + p.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(new Uint8Array(part), offset);
    offset += part.byteLength;
  }
  return merged.buffer;
}

class MockWritable {
  private parts: ArrayBuffer[] = [];
  private file: MockFile;
  closed = false;

  constructor(file: MockFile) {
    this.file = file;
  }

  async write(data: BlobPart): Promise<void> {
    if (this.closed) throw new DOMException('writable closed', 'InvalidStateError');
    const buf = await partToArrayBuffer(data);
    this.parts.push(buf);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.file.setData(mergeBuffers(this.parts));
  }
}

class MockFile {
  readonly kind = 'file';
  private data: ArrayBuffer = new ArrayBuffer(0);
  private modified = 0;

  constructor(public readonly name: string) {}

  setData(buf: ArrayBuffer): void {
    this.data = buf;
    this.modified = Date.now();
  }

  async createWritable(): Promise<MockWritable> {
    // OPFS の createWritable はデフォルトで既存内容を消す。
    this.data = new ArrayBuffer(0);
    return new MockWritable(this);
  }

  async getFile(): Promise<File> {
    return new File([this.data], this.name, { lastModified: this.modified });
  }
}

class MockDir {
  readonly kind = 'directory';
  private entries = new Map<string, MockDir | MockFile>();

  constructor(public readonly name: string) {}

  async getDirectoryHandle(name: string, opts: { create?: boolean } = {}): Promise<MockDir> {
    let entry = this.entries.get(name);
    if (entry instanceof MockFile) {
      throw new DOMException(`${name} は file`, 'TypeMismatchError');
    }
    if (!entry) {
      if (!opts.create) throw new DOMException(`${name} not found`, 'NotFoundError');
      entry = new MockDir(name);
      this.entries.set(name, entry);
    }
    return entry;
  }

  async getFileHandle(name: string, opts: { create?: boolean } = {}): Promise<MockFile> {
    let entry = this.entries.get(name);
    if (entry instanceof MockDir) {
      throw new DOMException(`${name} は directory`, 'TypeMismatchError');
    }
    if (!entry) {
      if (!opts.create) throw new DOMException(`${name} not found`, 'NotFoundError');
      entry = new MockFile(name);
      this.entries.set(name, entry);
    }
    return entry;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.has(name)) {
      throw new DOMException(`${name} not found`, 'NotFoundError');
    }
    this.entries.delete(name);
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<[string, MockDir | MockFile]> {
    for (const [name, handle] of this.entries) {
      yield [name, handle];
    }
  }

  // テスト用補助
  reset(): void {
    this.entries.clear();
  }

  countEntries(): number {
    return this.entries.size;
  }
}

const root = new MockDir('');

export function getMockRoot(): MockDir {
  return root;
}

export function resetMockOpfs(): void {
  root.reset();
}

export function installMockOpfs(): void {
  resetMockOpfs();
  // navigator.storage.getDirectory() を MockDir を返す関数に差し替える。
  // 既存の navigator object が無い場合は新規作成。
  const existing = (globalThis as unknown as { navigator?: Record<string, unknown> }).navigator;
  const storage = {
    getDirectory: () => Promise.resolve(root as unknown as FileSystemDirectoryHandle),
    estimate: () =>
      Promise.resolve({ usage: 0, quota: 1024 * 1024 * 1024 * 10 } as StorageEstimate),
    persist: () => Promise.resolve(true),
    persisted: () => Promise.resolve(true),
  };
  if (existing && typeof existing === 'object') {
    (existing as Record<string, unknown>).storage = storage;
  } else {
    Object.defineProperty(globalThis, 'navigator', {
      value: { storage },
      configurable: true,
      writable: true,
    });
  }
}
