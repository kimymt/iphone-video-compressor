// Phase 0.5: mediabunny + WebCodecs HEVC mux の iOS 26 Safari 互換性検証。
// 720p / 30fps / 1秒のテストパターン動画を生成 → mediabunny で MP4 mux → 再生/ダウンロード。
// 完了後 (Phase 0.5 合格後) はこのディレクトリごと削除する想定。

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  EncodedVideoPacketSource,
  EncodedPacket,
} from 'mediabunny';

// 720p / 30fps / 1秒。HEVC Main Profile Level 3.1 (L93) に収まる。
const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION_SEC = 1;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const BITRATE = 3_000_000; // 3 Mbps、テストパターンには十分
const HEVC_CODEC_STRING = 'hvc1.1.6.L93.B0';

const logEl = document.getElementById('log') as HTMLPreElement;
const runBtn = document.getElementById('run') as HTMLButtonElement;
const videoEl = document.getElementById('preview') as HTMLVideoElement;
const downloadEl = document.getElementById('download') as HTMLAnchorElement;

let previousObjectUrl: string | null = null;

function log(msg: string, level: 'info' | 'ok' | 'err' | 'warn' | 'label' = 'info'): void {
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
  console.log(`[spike:${level}] ${msg}`);
}

async function checkHevcSupport(): Promise<VideoEncoderConfig> {
  log('▶ WebCodecs / HEVC encoder support check', 'label');
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('VideoEncoder API not available (need iOS 26+ Safari or Apple Silicon Mac)');
  }
  const desired: VideoEncoderConfig = {
    codec: HEVC_CODEC_STRING,
    width: WIDTH,
    height: HEIGHT,
    bitrate: BITRATE,
    framerate: FPS,
    hardwareAcceleration: 'prefer-hardware',
    latencyMode: 'quality',
    bitrateMode: 'variable',
  };
  const support = await VideoEncoder.isConfigSupported(desired);
  log(`  isConfigSupported.supported: ${support.supported}`);
  if (!support.supported || !support.config) {
    throw new Error(`HEVC encoder rejected the config. codec=${HEVC_CODEC_STRING}`);
  }
  const cfg = support.config as VideoEncoderConfig;
  log(`  decided codec: ${cfg.codec}`, 'ok');
  log(`  hardwareAcceleration: ${cfg.hardwareAcceleration ?? '(unset)'}`);
  return cfg;
}

function drawTestFrame(ctx: OffscreenCanvasRenderingContext2D, frameIdx: number): void {
  // 背景: フレームごとに HSL を回転、フレーム順序のズレを目視で検出できる
  const hue = (frameIdx / TOTAL_FRAMES) * 360;
  ctx.fillStyle = `hsl(${hue}, 65%, 28%)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 中央: 大きなフレーム番号
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 280px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(frameIdx + 1).padStart(2, '0'), WIDTH / 2, HEIGHT / 2);

  // 上ラベル
  ctx.font = '36px -apple-system, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('mediabunny iOS spike — 720p HEVC 1s', 32, 32);

  // 下ステータス
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const ms = ((frameIdx * 1000) / FPS).toFixed(0);
  ctx.fillText(`t=${ms}ms · ${frameIdx + 1}/${TOTAL_FRAMES}`, WIDTH - 32, HEIGHT - 32);
}

function hexHead(buffer: ArrayBuffer, n = 64): string {
  const head = new Uint8Array(buffer, 0, Math.min(n, buffer.byteLength));
  return Array.from(head, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function asciiFind(buffer: ArrayBuffer, needle: string, scanBytes = 4096): boolean {
  const view = new Uint8Array(buffer, 0, Math.min(scanBytes, buffer.byteLength));
  const ascii = Array.from(view, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
  return ascii.includes(needle);
}

async function runSpike(): Promise<void> {
  const config = await checkHevcSupport();

  // OffscreenCanvas でテストフレームを描画
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2d context not available');

  // mediabunny: Mp4 + BufferTarget で in-memory に mux。fastStart='in-memory' で moov を先頭に。
  log('▶ mediabunny Output setup', 'label');
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new EncodedVideoPacketSource('hevc');
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  log('  output.start() done', 'ok');

  // WebCodecs encoder
  log('▶ VideoEncoder configure', 'label');
  type ChunkRecord = { chunk: EncodedVideoChunk; metadata: EncodedVideoChunkMetadata | undefined };
  const chunks: ChunkRecord[] = [];
  let firstDecoderConfigSeen = false;
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      chunks.push({ chunk, metadata });
      if (!firstDecoderConfigSeen && metadata?.decoderConfig) {
        firstDecoderConfigSeen = true;
        const dc = metadata.decoderConfig;
        log(`  first decoderConfig.codec: ${dc.codec}`, 'ok');
        log(`  decoderConfig.description.length: ${dc.description ? (dc.description as ArrayBuffer).byteLength : 0} bytes`);
      }
    },
    error: (e) => {
      encoderError = e instanceof Error ? e : new Error(String(e));
      log(`  encoder error: ${encoderError.message}`, 'err');
    },
  });
  encoder.configure(config);
  log(`  configured: ${WIDTH}x${HEIGHT} @ ${FPS}fps, ${(BITRATE / 1_000_000).toFixed(1)} Mbps`, 'ok');

  // フレーム生成 + エンコード
  log('▶ Encoding frames', 'label');
  const t0 = performance.now();
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (encoderError) throw encoderError;
    drawTestFrame(ctx, i);
    const timestampUs = Math.round((i * 1_000_000) / FPS);
    const durationUs = Math.round(1_000_000 / FPS);
    const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
    encoder.encode(frame, { keyFrame: i === 0 });
    frame.close();
  }
  log(`  submitted ${TOTAL_FRAMES} frames (${(performance.now() - t0).toFixed(0)}ms)`);

  await encoder.flush();
  if (encoderError) throw encoderError;
  encoder.close();
  log(`  flush done, got ${chunks.length} chunks`, 'ok');

  if (!firstDecoderConfigSeen) {
    throw new Error('Encoder did not provide decoderConfig metadata — cannot mux');
  }

  // mediabunny に流し込む
  log('▶ Muxing via mediabunny', 'label');
  for (const [i, { chunk, metadata }] of chunks.entries()) {
    const packet = EncodedPacket.fromEncodedChunk(chunk);
    // 初回は必ず metadata 必要。以降も渡しておけば encoder が config 変更を post してきても対応できる
    await source.add(packet, metadata);
    if (i === 0) {
      log(`  added first packet (keyframe=${chunk.type === 'key'})`);
    }
  }
  await output.finalize();
  log(`  finalize done`, 'ok');

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('BufferTarget produced null buffer');
  const sizeKB = (buffer.byteLength / 1024).toFixed(1);
  log(`  output size: ${sizeKB} KB (${buffer.byteLength} bytes)`, 'ok');

  // 構造サニティチェック
  log('▶ Container sanity check', 'label');
  log(`  first 64 bytes (hex):\n  ${hexHead(buffer, 64)}`);
  const hasFtyp = asciiFind(buffer, 'ftyp');
  const hasMoov = asciiFind(buffer, 'moov');
  const hasHvc1 = asciiFind(buffer, 'hvc1');
  const hasHev1 = asciiFind(buffer, 'hev1');
  log(`  ftyp box: ${hasFtyp ? '✓' : '✗ MISSING'}`, hasFtyp ? 'ok' : 'err');
  log(`  moov box: ${hasMoov ? '✓' : '✗ MISSING'}`, hasMoov ? 'ok' : 'err');
  log(`  hvc1 box: ${hasHvc1 ? '✓ (iOS Photos compatible)' : '✗ MISSING'}`, hasHvc1 ? 'ok' : 'err');
  log(`  hev1 box: ${hasHev1 ? '⚠ FOUND (iOS Photos may reject)' : 'not found ✓'}`, hasHev1 ? 'warn' : 'ok');

  // インライン再生 + ダウンロード
  log('▶ Setting up inline preview + download', 'label');
  if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
  const blob = new Blob([buffer], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  previousObjectUrl = url;
  videoEl.src = url;
  videoEl.style.display = 'block';
  downloadEl.href = url;
  downloadEl.textContent = `↓ Download spike-hevc-720p-1s.mp4 (${sizeKB} KB)`;
  downloadEl.style.display = 'block';
  log('  inline <video> and download link ready', 'ok');

  log('▶ DONE — Safari で再生 + Files 保存 → Photos でも再生できれば合格', 'label');
}

runBtn.addEventListener('click', () => {
  logEl.replaceChildren();
  videoEl.style.display = 'none';
  downloadEl.style.display = 'none';
  runBtn.disabled = true;
  log(`▶ Run started @ ${new Date().toLocaleTimeString()}`, 'label');
  runSpike()
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ FAIL: ${msg}`, 'err');
      // eslint-disable-next-line no-console
      console.error(e);
    })
    .finally(() => {
      runBtn.disabled = false;
    });
});

// 静かな初期メッセージ
log('Ready. Tap "Run spike" to generate a 720p HEVC test clip.', 'label');
