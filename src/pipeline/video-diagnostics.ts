import { VideoSampleSink } from 'mediabunny';
import { demuxInput } from './demux';

/** Bounded, local-only diagnostics. No pixels or filenames are retained. */
export async function inspectVideo(file: Blob, signal?: AbortSignal) {
  const dem = await demuxInput(file);
  let count = 0, reversed = 0, duplicates = 0;
  let first: number | null = null, previous: number | null = null;
  const colors = new Set<string>();
  const start = performance.now();
  try {
    const decoderConfig = await dem.videoTrack.getDecoderConfig();
    const videoRange = { startSec: await dem.videoTrack.getFirstTimestamp(), endSec: await dem.videoTrack.computeDuration() };
    const audioRange = dem.audioTrack ? {
      startSec: await dem.audioTrack.getFirstTimestamp(), endSec: await dem.audioTrack.computeDuration(),
    } : null;
    for await (const sample of new VideoSampleSink(dem.videoTrack).samples()) {
      try {
        signal?.throwIfAborted();
        const frame = sample.toVideoFrame();
        try {
          const timestamp = frame.timestamp;
          if (previous !== null) {
            if (timestamp < previous) reversed++;
            if (timestamp === previous) duplicates++;
          }
          first ??= timestamp;
          previous = timestamp;
          count++;
          if (colors.size < 16) colors.add(JSON.stringify(frame.colorSpace.toJSON()));
        } finally { frame.close(); }
      } finally { sample[Symbol.dispose](); }
    }
    return {
      frames: count, reversed, duplicates, firstTimestampUs: first, lastTimestampUs: previous,
      containerColor: dem.colorSpace, decoderColor: decoderConfig?.colorSpace,
      decodedColors: [...colors].map((value) => JSON.parse(value) as VideoColorSpaceInit),
      durationSec: dem.durationSec, rotation: dem.rotation, videoRange, audioRange,
      elapsedMs: performance.now() - start,
    };
  } finally { dem.input.dispose(); }
}
