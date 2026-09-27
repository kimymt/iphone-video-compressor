import { inspectVideo } from '../pipeline/video-diagnostics';
import { transcode } from '../pipeline/transcode';
import { findPreset } from '../lib/presets';
import { getOpfsWritable, readFromOpfs } from '../db/opfs';
import { ingestStream, supportsStreamTransfer, recoverPendingIngests } from '../workers/ingest-client';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let controller = new AbortController();
let busy = false;
const urls: string[] = [];
const show = (value: unknown) => { element('report').textContent = JSON.stringify(value, null, 2); };
const status = (value: string) => { element('status').textContent = value; };
async function remove(path: string) {
  const root = await navigator.storage.getDirectory();
  const [dir, name] = path.split('/');
  try { await (await root.getDirectoryHandle(dir!)).removeEntry(name!); }
  catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
      throw new Error(`削除失敗 ${path}: ${String(error)}`);
    }
  }
}
async function run(action: (file: File) => Promise<void>) {
  if (busy) return;
  const file = element<HTMLInputElement>('file').files?.[0];
  if (!file) { status('動画を選択してください'); return; }
  busy = true; controller = new AbortController();
  try { await action(file); status('完了'); }
  catch (error) { status(String(error)); }
  finally { busy = false; }
}
element('cancel').onclick = () => controller.abort();
element('recover').onclick = async () => {
  if (busy) return;
  busy = true;
  try { show({ remaining: await recoverPendingIngests() }); }
  catch (e) { status(String(e)); }
  finally { busy = false; }
};
element('inspect').onclick = () => void run(async (file) => {
  status('入力をデコードしています');
  const input = await inspectVideo(file, controller.signal);
  const path = `outputs/validation-${crypto.randomUUID()}.mp4`;
  try {
    status('圧縮しています');
    await transcode(file, await getOpfsWritable(path), {
      preset: findPreset('compat-h264')!, signal: controller.signal,
      onProgress: percent => status(`圧縮 ${Math.round(percent)}%`),
    });
    const outputFile = await readFromOpfs(path);
    const output = await inspectVideo(outputFile, controller.signal);
    // Snapshot before removing the OPFS file so previews remain available.
    const preview = new Blob([await outputFile.arrayBuffer()], { type: 'video/mp4' });
    urls.forEach(URL.revokeObjectURL); urls.length = 0;
    urls.push(URL.createObjectURL(file), URL.createObjectURL(preview));
    element<HTMLVideoElement>('original').src = urls[0]!;
    element<HTMLVideoElement>('compressed').src = urls[1]!;
    show({ userAgent: navigator.userAgent, input, output,
      frameCountEqual: input.frames === output.frames,
      note: 'Frame counts/timestamps do not prove visual order or color accuracy. Inspect numbered frames and gradients on the device.' });
  } finally { await remove(path); }
});
element('bench').onclick = () => void run(async (file) => {
  if (!await supportsStreamTransfer()) throw new Error('Streams転送は非対応');
  const rows: Array<{ mode: string; elapsedMs: number; maxTimerDelayMs: number; bytes: number }> = [];
  for (let round = 0; round < 5; round++) {
    for (const mode of round % 2 ? ['stream','baseline'] : ['baseline','stream']) {
      controller.signal.throwIfAborted();
      status(`${round + 1}/5 ${mode}`);
      let maxDelay = 0, last = performance.now();
      const timer = setInterval(() => {
        const now = performance.now(); maxDelay = Math.max(maxDelay, now-last-16); last = now;
      }, 16);
      const start = performance.now();
      let path = '';
      try {
        if (mode === 'stream') path = await ingestStream(file, crypto.randomUUID(), { signal: controller.signal });
        else {
          path = `inputs/validation-${crypto.randomUUID()}.mp4`;
          const writer = await getOpfsWritable(path);
          try { await writer.write(file); await writer.close(); }
          catch (error) { await writer.abort().catch(() => {}); throw error; }
        }
        const elapsedMs = performance.now()-start;
        // Let the final delayed timer run; exclude this yield from ingestion time.
        await new Promise(resolve => setTimeout(resolve, 0));
        const result = await readFromOpfs(path);
        rows.push({ mode, elapsedMs, maxTimerDelayMs: maxDelay, bytes: result.size });
        if (result.size !== file.size) throw new Error('保存サイズ不一致');
      } finally { clearInterval(timer); if (path) await remove(path); }
      show({ rows, note: 'Memory unavailable is not zero. Timer delay is a responsiveness proxy. Hash verification is in automated tests, outside benchmark timing.' });
    }
  }
});
