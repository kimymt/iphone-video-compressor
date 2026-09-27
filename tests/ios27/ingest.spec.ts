import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });
test('real stream transfer preserves bytes and leaves no receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite serves the source module in this development-only test.
    const api = await import('/src/workers/ingest-client.ts');
    const supported = await api.supportsStreamTransfer();
    const bytes = new Uint8Array(2 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    const id = crypto.randomUUID();
    const path = await api.ingestStream(new File([bytes], 'test.mp4'), id);
    const root = await navigator.storage.getDirectory();
    const inputs = await root.getDirectoryHandle('inputs');
    const output = await (await inputs.getFileHandle(path.split('/')[1])).getFile();
    const hash = async (b: BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).join(',');
    const equal = await hash(bytes) === await hash(await output.arrayBuffer());
    const receipts = await root.getDirectoryHandle('pending-ingests');
    let receiptExists = true;
    try { await receipts.getFileHandle(path.split('/')[1]); } catch { receiptExists = false; }
    await inputs.removeEntry(path.split('/')[1]);
    return { supported, equal, receiptExists };
  });
  expect(result).toEqual({ supported: true, equal: true, receiptExists: false });
});

test('mid-stream failure cleans partial data and permits next job', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const file = new File([new Uint8Array(100)], 'broken.mp4');
    file.stream = () => new ReadableStream({ pull(c) { c.error(new Error('read failed')); } });
    const id = crypto.randomUUID();
    let rejected = false;
    try { await api.ingestStream(file, id); } catch { rejected = true; }
    const root = await navigator.storage.getDirectory();
    const inputs = await root.getDirectoryHandle('inputs');
    let exists = true;
    try { await inputs.getFileHandle(`${id}.mp4`); } catch { exists = false; }
    const next = await api.ingestStream(new File(['next'], 'next.mp4'), crypto.randomUUID());
    await inputs.removeEntry(next.split('/')[1]);
    return { rejected, exists };
  });
  expect(result).toEqual({ rejected: true, exists: false });
});

test('cancellation stops an active stream and preserves queue availability', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const file = new File([new Uint8Array(100000)], 'cancel.mp4');
    file.stream = () => new ReadableStream({ async pull(c) {
      await new Promise(r => setTimeout(r, 20)); c.enqueue(new Uint8Array(100));
    } });
    const controller = new AbortController();
    const id = crypto.randomUUID();
    let error = '';
    try { await api.ingestStream(file, id, { signal: controller.signal, onProgress() { controller.abort(); } }); }
    catch (e) { error = (e as Error).name; }
    const root = await navigator.storage.getDirectory();
    const inputs = await root.getDirectoryHandle('inputs');
    let exists = true;
    try { await inputs.getFileHandle(`${id}.mp4`); } catch { exists = false; }
    return { error, exists };
  });
  expect(result).toEqual({ error: 'AbortError', exists: false });
});

test('numbered B-frame and VFR fixtures decode in presentation order', async ({ page }) => {
  const results = await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const { inspectVideo } = await import('/src/pipeline/video-diagnostics.ts');
    const results = [];
    for (const name of ['sdr-bframes', 'vfr']) {
      const response = await fetch(`/tests/fixtures/ios27/${name}.mp4`);
      results.push(await inspectVideo(await response.blob()));
    }
    return results;
  });
  expect(results.map(r => r.frames)).toEqual([60, 45]);
  for (const r of results) { expect(r.reversed).toBe(0); expect(r.duplicates).toBe(0); }
});

test('unsupported Worker transfer fails the probe safely', async ({ page }) => {
  expect(await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage() { throw new DOMException('unsupported', 'DataCloneError'); }
    };
    try { return await api.supportsStreamTransfer(); }
    finally { window.Worker = Original; }
  })).toBe(false);
});

test('Worker error after dispatch is rejected and journal cleanup runs', async ({ page }) => {
  expect(await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage() { queueMicrotask(() => this.dispatchEvent(new Event('error'))); }
    };
    try {
      try { await api.ingestStream(new File(['abc'], 'test.mp4'), crypto.randomUUID()); }
      catch { return (await api.recoverPendingIngests()).length === 0; }
      return false;
    } finally { window.Worker = Original; }
  })).toBe(true);
});

test('existing input is never overwritten by a duplicate job id', async ({ page }) => {
  expect(await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const id = crypto.randomUUID();
    await api.ingestStream(new File(['original'], 'test.mp4'), id);
    let rejected = false;
    try { await api.ingestStream(new File(['replacement'], 'test.mp4'), id); } catch { rejected = true; }
    const root = await navigator.storage.getDirectory();
    const inputs = await root.getDirectoryHandle('inputs');
    const text = await (await (await inputs.getFileHandle(`${id}.mp4`)).getFile()).text();
    await inputs.removeEntry(`${id}.mp4`);
    return rejected && text === 'original';
  })).toBe(true);
});

test('validation page transcodes numbered SDR and reports matching counts', async ({ page }, testInfo) => {
  // Headless Chromium has no hardware H.264 encoder. This adapter only changes
  // the test's acceleration preference; Safari production config stays unchanged.
  await page.addInitScript(() => {
    const Original = window.VideoEncoder;
    window.VideoEncoder = class extends Original {
      configure(config: VideoEncoderConfig) { super.configure({ ...config, hardwareAcceleration: 'prefer-software' }); }
    };
  });
  await page.goto('/tests/ios27.html');
  await page.locator('#file').setInputFiles('tests/fixtures/ios27/sdr-bframes.mp4');
  await page.locator('#inspect').click();
  await expect(page.locator('#status')).toHaveText('完了', { timeout: 30000 });
  const report = JSON.parse(await page.locator('#report').innerText());
  await testInfo.attach('sdr-validation.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.input.frames).toBe(60);
  expect(report.output.frames).toBe(60);
  expect(report.output.reversed).toBe(0);
  expect(report.output.duplicates).toBe(0);
});

test('failed cleanup retains a durable receipt and recovery retries it', async ({ page }) => {
  expect(await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const id = crypto.randomUUID();
    const name = `${id}.mp4`;
    const original = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = async function(entry, options) {
      if (this.name === 'inputs' && entry === name) throw new DOMException('locked', 'NoModificationAllowedError');
      return original.call(this, entry, options);
    };
    const file = new File(['abc'], 'test.mp4');
    file.stream = () => new ReadableStream({ pull(c) { c.error(new Error('read failed')); } });
    let retained = false;
    try {
      try { await api.ingestStream(file, id); } catch { /* expected */ }
      const root = await navigator.storage.getDirectory();
      const journal = await root.getDirectoryHandle('pending-ingests');
      retained = await (await (await journal.getFileHandle(name)).getFile()).text() === `inputs/${name}`;
      const failed = await api.recoverPendingIngests();
      retained = retained && failed.includes(`inputs/${name}`);
    } finally { FileSystemDirectoryHandle.prototype.removeEntry = original; }
    return retained && (await api.recoverPendingIngests()).length === 0;
  })).toBe(true);
});

test('development benchmark runs both paths and records desktop baseline', async ({ page }, testInfo) => {
  await page.goto('/tests/ios27.html');
  await page.locator('#file').setInputFiles({ name: 'synthetic.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(8 * 1024 * 1024, 37) });
  await page.locator('#bench').click();
  await expect(page.locator('#status')).toHaveText('完了');
  const report = JSON.parse(await page.locator('#report').innerText());
  expect(report.rows).toHaveLength(10);
  expect(report.rows.every((r: { bytes: number }) => r.bytes === 8 * 1024 * 1024)).toBe(true);
  await testInfo.attach('desktop-ingestion-baseline.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});

test('recovery in another tab waits for an active ingestion', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/');
  await page.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    const file = new File([new Uint8Array(200)], 'slow.mp4');
    let count = 0;
    file.stream = () => new ReadableStream({ async pull(c) {
      if (count++ === 0) c.enqueue(new Uint8Array(100));
      else { await new Promise(r => setTimeout(r, 500)); c.enqueue(new Uint8Array(100)); c.close(); }
    } });
    // Expose only in this isolated test page.
    const state = window as unknown as { started: boolean; job: Promise<string> };
    state.job = api.ingestStream(file, crypto.randomUUID(), { onProgress() { state.started = true; } });
  });
  await page.waitForFunction(() => (window as unknown as { started: boolean }).started);
  const pending = await other.evaluate(async () => {
    // @ts-expect-error Vite runtime import.
    const api = await import('/src/workers/ingest-client.ts');
    return api.recoverPendingIngests();
  });
  expect(pending).toEqual([]);
  expect(await page.evaluate(async () => {
    const path = await (window as unknown as { job: Promise<string> }).job;
    const root = await navigator.storage.getDirectory();
    const inputs = await root.getDirectoryHandle('inputs');
    const file = await (await inputs.getFileHandle(path.split('/')[1]!)).getFile();
    const size = file.size;
    await inputs.removeEntry(path.split('/')[1]!);
    return size;
  })).toBe(200);
  await other.close();
});
