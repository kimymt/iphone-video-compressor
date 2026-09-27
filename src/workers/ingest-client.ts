import { extractExtension } from '../lib/format';

export type IngestOptions = { signal?: AbortSignal; onProgress?: (bytes: number) => void };
const JOURNAL = 'pending-ingests';
const LOCK = 'video-compressor-stream-ingest';

function spawn(): Worker {
  return new Worker(new URL('./ingest.worker.ts', import.meta.url), { type: 'module' });
}

function request(worker: Worker, id: string, stream: ReadableStream<Uint8Array>,
  path?: string, size?: number, options: IngestOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', fail);
      worker.removeEventListener('messageerror', fail);
      options.signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(new Error('ingest worker timeout')), path ? 60_000 : 3_000);
    };
    const abort = () => {
      try { worker.postMessage({ type: 'cancel', id }); } catch { /* terminal timeout below */ }
      clearTimeout(timer);
      timer = setTimeout(() => finish(new DOMException('Cancelled', 'AbortError')), 3_000);
    };
    const fail = () => finish(new Error('ingest worker failed'));
    const message = (event: MessageEvent<{ id: string; type: string; bytes: number; error: string }>) => {
      if (event.data.id !== id) return;
      if (event.data.type === 'progress') {
        if (!options.signal?.aborted) arm();
        try { options.onProgress?.(event.data.bytes); }
        catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      } else if (options.signal?.aborted) finish(new DOMException('Cancelled', 'AbortError'));
      else if (event.data.type === 'done') finish();
      else if (event.data.type === 'failed') finish(new Error(event.data.error));
    };
    worker.addEventListener('message', message);
    worker.addEventListener('error', fail);
    worker.addEventListener('messageerror', fail);
    options.signal?.addEventListener('abort', abort, { once: true });
    arm();
    if (options.signal?.aborted) { finish(new DOMException('Cancelled', 'AbortError')); return; }
    try { worker.postMessage({ type: path ? 'write' : 'probe', id, stream, path, size }, [stream]); }
    catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}

/** Tests the actual Worker boundary, not just constructor presence. */
export async function supportsStreamTransfer(): Promise<boolean> {
  if (!navigator.locks) return false;
  let worker: Worker | undefined;
  try {
    worker = spawn();
    await request(worker, 'probe', new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([73])); controller.close(); },
    }));
    return true;
  } catch { return false; }
  finally { worker?.terminate(); }
}

async function journal(path: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(JOURNAL, { create: true });
  const handle = await dir.getFileHandle(path.split('/')[1]!, { create: true });
  const writer = await handle.createWritable();
  try {
    await writer.write(path);
    await writer.close();
  } catch (error) {
    await writer.abort().catch(() => {});
    throw error;
  }
  return dir;
}

/** A failed deletion keeps its durable receipt for explicit recovery. */
async function recover(): Promise<string[]> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(JOURNAL, { create: true });
  const inputs = await root.getDirectoryHandle('inputs', { create: true });
  const failed: string[] = [];
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
    try {
      try { await inputs.removeEntry(name); }
      catch (e) { if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e; }
      await dir.removeEntry(name);
    } catch { failed.push(`inputs/${name}`); }
  }
  return failed;
}

/** Run recovery only after all active ingests have settled. */
export function recoverPendingIngests(): Promise<string[]> {
  return navigator.locks.request(LOCK, recover);
}

/** Serializes writes across callers. No retry after a write has started. */
export function ingestStream(file: File, id: string, options: IngestOptions = {}): Promise<string> {
  const run = async () => {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('invalid ingest id');
    const extension = extractExtension(file.name);
    const path = `inputs/${id}.${/^[a-z0-9]{1,16}$/.test(extension) ? extension : 'bin'}`;
    const root = await navigator.storage.getDirectory();
    const inputs = await root.getDirectoryHandle('inputs', { create: true });
    try {
      await inputs.getFileHandle(path.split('/')[1]!);
      throw new Error('input path already exists');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    const receipt = await journal(path);
    let worker: Worker | undefined;
    try {
      worker = spawn();
      await request(worker, id, file.stream(), path, file.size, options);
      await receipt.removeEntry(path.split('/')[1]!);
      return path;
    } catch (error) {
      worker?.terminate();
      const root = await navigator.storage.getDirectory();
      try {
        const inputs = await root.getDirectoryHandle('inputs', { create: true });
        try { await inputs.removeEntry(path.split('/')[1]!); }
        catch (e) { if (!(e instanceof DOMException && e.name === 'NotFoundError')) throw e; }
        await receipt.removeEntry(path.split('/')[1]!);
      } catch { throw new Error(`取り込み失敗。未削除ファイル: ${path}（pending-ingestsに記録済み）`, { cause: error }); }
      throw error;
    } finally { worker?.terminate(); }
  };
  // Web Locks already serialize across pages. A separate Promise queue would
  // delay delivery of AbortError until the preceding job completes.
  return navigator.locks.request(LOCK,
    options.signal ? { signal: options.signal } : {}, run);
}
