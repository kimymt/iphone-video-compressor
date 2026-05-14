// Phase 3b core 手動検証用 spike。
// Worker 外 (メインスレッド) で src/pipeline/transcode を直接呼び、
// 1 ファイル変換が動くことを Mac Safari / iPhone Safari で確認する。
// CLAUDE.md「まず Worker 外で 1 ファイル H.264 出力ができることを確認」に対応。
// Phase 4 着手前に削除予定。

import { transcode, TranscodeCancelledError } from '../src/pipeline/transcode';
import { PRESETS, findPreset } from '../src/lib/presets';
import type { PresetKey } from '../src/lib/types';
import {
  spawnTranscodeWorker,
  runTranscodeJob,
  type TranscodeJobResult,
} from '../src/workers/compressor-client';
import {
  writeInputToOpfs,
  readFromOpfs,
  deleteFromOpfs,
  outputPath as opfsOutputPath,
} from '../src/db/opfs';

const fileInput = document.getElementById('file') as HTMLInputElement;
const presetSelect = document.getElementById('preset') as HTMLSelectElement;
const useWorkerCheckbox = document.getElementById('useWorker') as HTMLInputElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement;
const progressEl = document.getElementById('progress') as HTMLProgressElement;
const logEl = document.getElementById('log') as HTMLPreElement;
const videoEl = document.getElementById('preview') as HTMLVideoElement;
const downloadEl = document.getElementById('download') as HTMLAnchorElement;

let previousObjectUrl: string | null = null;
let currentController: AbortController | null = null;

// ---- プリセット一覧を <select> に流し込む ----
for (const p of PRESETS) {
  const opt = document.createElement('option');
  opt.value = p.key;
  opt.textContent = `${p.label} — ${p.description}`;
  if (p.key === 'standard-hevc') opt.selected = true;
  presetSelect.append(opt);
}

// ---- ログヘルパー ----
function log(msg: string, level: 'info' | 'ok' | 'err' | 'label' = 'info'): void {
  if (level === 'info') {
    logEl.append(msg + '\n');
  } else {
    const span = document.createElement('span');
    span.className = level;
    span.textContent = msg;
    logEl.append(span, '\n');
  }
  logEl.scrollTop = logEl.scrollHeight;
  // eslint-disable-next-line no-console
  console.log(`[transcode-spike:${level}] ${msg}`);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ---- OPFS の一時出力ファイル作成 (spike 専用) ----
async function createTempOutputWritable(): Promise<{
  writable: FileSystemWritableFileStream;
  read: () => Promise<File>;
}> {
  const root = await navigator.storage.getDirectory();
  // 既存ファイルがあれば消しておく
  try {
    await root.removeEntry('spike-transcode-output.mp4');
  } catch {
    /* 無ければ無視 */
  }
  const fileHandle = await root.getFileHandle('spike-transcode-output.mp4', { create: true });
  const writable = await fileHandle.createWritable();
  return {
    writable,
    read: async () => fileHandle.getFile(),
  };
}

// ---- 進捗ハンドラ (両パス共通) ----
function onProgress(percent: number, currentSec: number, totalSec: number, etaSec: number | null): void {
  progressEl.value = percent;
  const etaStr = etaSec === null ? '推定中' : `${Math.max(0, Math.round(etaSec))}s`;
  log(`  ${percent}% (${currentSec.toFixed(2)}/${totalSec.toFixed(2)}s, ETA ${etaStr})`);
}

// ---- メイン: run ----
async function run(): Promise<void> {
  const file = fileInput.files?.[0];
  if (!file) {
    log('ファイルを選択してください', 'err');
    return;
  }
  const presetKey = presetSelect.value as PresetKey;
  const preset = findPreset(presetKey);
  if (!preset) {
    log(`unknown preset: ${presetKey}`, 'err');
    return;
  }
  const useWorker = useWorkerCheckbox.checked;

  runBtn.disabled = true;
  cancelBtn.style.display = 'block';
  progressEl.value = 0;
  videoEl.style.display = 'none';
  downloadEl.style.display = 'none';
  logEl.replaceChildren();
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);

  log(`▶ Input: ${file.name} (${formatBytes(file.size)})`, 'label');
  log(`▶ Preset: ${preset.label} (codec=${preset.codec}, maxLongEdge=${preset.maxLongEdge ?? 'null'}, vBitrate=${preset.videoBitrate / 1_000_000} Mbps)`);
  log(`▶ Path: ${useWorker ? 'Worker (compressor-client → compressor.worker)' : 'main thread (direct transcode call)'}`);

  currentController = new AbortController();
  const startMs = performance.now();

  try {
    if (useWorker) {
      await runViaWorker(file, preset, startMs);
    } else {
      await runDirect(file, preset, startMs);
    }
  } catch (e) {
    if (e instanceof TranscodeCancelledError) {
      log('✗ Cancelled', 'err');
    } else if (e instanceof Error) {
      log(`✗ FAILED: ${e.name}: ${e.message}`, 'err');
      // eslint-disable-next-line no-console
      console.error(e);
    } else {
      log(`✗ FAILED: ${String(e)}`, 'err');
    }
  } finally {
    runBtn.disabled = false;
    cancelBtn.style.display = 'none';
    currentController = null;
  }
}

// ---- メインスレッド直呼びパス (Phase 3b core 既存) ----
async function runDirect(
  file: File,
  preset: import('../src/lib/types').Preset,
  startMs: number,
): Promise<void> {
  const { writable, read } = await createTempOutputWritable();
  log('▶ OPFS output file ready', 'label');

  const result = await transcode(file, writable, {
    preset,
    onProgress,
    signal: currentController!.signal,
  });
  reportSuccess(result, file.size, startMs);

  const outputFile = await read();
  setupPreview(outputFile, result.outputSize);
}

// ---- Worker 経由パス (Phase 3b worker layer) ----
async function runViaWorker(
  file: File,
  preset: import('../src/lib/types').Preset,
  startMs: number,
): Promise<void> {
  const id = `spike-${Date.now()}`;
  log('▶ Writing input to OPFS...', 'label');
  const inputPath = await writeInputToOpfs(file, id);
  const outPath = opfsOutputPath(id);
  log(`  input: ${inputPath}`);
  log(`  output: ${outPath}`);

  log('▶ Spawning Worker...', 'label');
  const worker = spawnTranscodeWorker();

  log('▶ Running transcode job in Worker...', 'label');
  let result: TranscodeJobResult;
  try {
    result = await runTranscodeJob(worker, {
      id,
      inputPath,
      outputPath: outPath,
      preset,
      onStarted: () => log('  worker: started', 'ok'),
      onProgress,
      signal: currentController!.signal,
    });
  } finally {
    // 入力 OPFS ファイルは spike では即削除 (本番では done 時に queueStore が削除)
    try {
      await deleteFromOpfs(inputPath);
    } catch {
      /* 削除失敗は無視 */
    }
  }

  if (result.kind === 'failed') {
    throw new Error(result.error);
  }
  if (result.kind === 'cancelled') {
    throw new TranscodeCancelledError();
  }
  // done
  reportSuccess({ outputSize: result.outputSize, durationSec: result.durationSec }, file.size, startMs);
  const outputFile = await readFromOpfs(outPath);
  setupPreview(outputFile, result.outputSize);
}

// ---- 完了レポート ----
function reportSuccess(
  result: { outputSize: number; durationSec: number },
  inputSize: number,
  startMs: number,
): void {
  const elapsedMs = performance.now() - startMs;
  log(
    `▶ Done in ${(elapsedMs / 1000).toFixed(2)}s — output ${formatBytes(result.outputSize)} (input was ${formatBytes(inputSize)})`,
    'ok',
  );
  const ratio = ((result.outputSize / inputSize) * 100).toFixed(1);
  log(`  圧縮率: ${ratio}% (input → output、小さいほど圧縮されている)`);
}

// ---- インライン preview / download セットアップ ----
function setupPreview(outputFile: File, outputSize: number): void {
  const url = URL.createObjectURL(outputFile);
  previousObjectUrl = url;
  videoEl.src = url;
  videoEl.style.display = 'block';
  downloadEl.href = url;
  downloadEl.textContent = `↓ Download spike-transcoded.mp4 (${formatBytes(outputSize)})`;
  downloadEl.style.display = 'block';
}

runBtn.addEventListener('click', () => {
  void run();
});

cancelBtn.addEventListener('click', () => {
  if (currentController) {
    currentController.abort();
    log('▶ Cancel requested', 'label');
  }
});

log('Ready. ファイルを選択して Run を押す。', 'label');
