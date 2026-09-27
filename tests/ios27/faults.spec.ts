import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('queued cancellation rejects while the previous ingestion is still running', async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const firstController = new AbortController();
    const secondController = new AbortController();
    const file = new File(['ab'], 'blocked.mp4');
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    file.stream = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); } });
    const first = api.ingestStream(file, crypto.randomUUID(), {
      signal: firstController.signal, onProgress: started,
    }).catch((e: Error) => e.name);
    await ready;
    const second = api.ingestStream(new File(['next'], 'next.mp4'), crypto.randomUUID(), {
      signal: secondController.signal,
    }).catch((e: Error) => e.name);
    secondController.abort();
    const result = await Promise.race([second, new Promise(resolve => setTimeout(() => resolve('still queued'), 150))]);
    firstController.abort();
    await Promise.all([first, second]);
    return result;
  });
  expect(outcome).toBe('AbortError');
});

for (const fault of ['messageerror', 'timeout'] as const) {
  test(`${fault} releases worker and permits a subsequent ingestion`, async ({ page }) => {
    const result = await page.evaluate(async (fault) => {
      // @ts-expect-error Vite runtime import.
      const api = await import('/src/workers/ingest-client.ts');
      const OriginalWorker = window.Worker;
      const originalTimeout = window.setTimeout;
      let terminated = 0;
      window.Worker = class extends OriginalWorker {
        postMessage() {
          if (fault === 'messageerror') queueMicrotask(() => this.dispatchEvent(new Event('messageerror')));
        }
        terminate() { terminated++; super.terminate(); }
      };
      // Advance only the module's deadline, without changing production values.
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
        originalTimeout(handler, timeout === 60000 || timeout === 3000 ? 30 : timeout, ...args)) as typeof window.setTimeout;
      let error = '';
      try {
        try { await api.ingestStream(new File(['abc'], 'test.mp4'), crypto.randomUUID()); }
        catch (e) { error = (e as Error).message; }
      } finally { window.Worker = OriginalWorker; window.setTimeout = originalTimeout; }
      const remaining = await api.recoverPendingIngests();
      const path = await api.ingestStream(new File(['next'], 'next.mp4'), crypto.randomUUID());
      const root = await navigator.storage.getDirectory();
      const inputs = await root.getDirectoryHandle('inputs');
      await inputs.removeEntry(path.split('/')[1]);
      return { error, terminated: terminated > 0, remaining };
    }, fault);
    expect(result.error).toContain(fault === 'timeout' ? 'timeout' : 'worker failed');
    expect(result.terminated).toBe(true);
    expect(result.remaining).toEqual([]);
  });
}

test('reload leaves a recoverable receipt for an interrupted ingestion', async ({ page }) => {
  const id = await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const id = crypto.randomUUID();
    const file = new File(['ab'], 'reload.mp4');
    file.stream = () => new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); } });
    await new Promise<void>((resolve, reject) => {
      void api.ingestStream(file, id, { onProgress: () => resolve() }).catch(reject);
    });
    return id;
  });
  await page.reload();
  const result = await page.evaluate(async (id) => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const root = await navigator.storage.getDirectory();
    const receipts = await root.getDirectoryHandle('pending-ingests');
    const receipt = await (await (await receipts.getFileHandle(`${id}.mp4`)).getFile()).text();
    const remaining = await api.recoverPendingIngests();
    const inputs = await root.getDirectoryHandle('inputs');
    const exists = async (dir: FileSystemDirectoryHandle) => {
      try { await dir.getFileHandle(`${id}.mp4`); return true; }
      catch (e) { if ((e as Error).name === 'NotFoundError') return false; throw e; }
    };
    return { receipt, remaining, inputExists: await exists(inputs), receiptExists: await exists(receipts) };
  }, id);
  expect(result).toEqual({ receipt: `inputs/${id}.mp4`, remaining: [], inputExists: false, receiptExists: false });
});
