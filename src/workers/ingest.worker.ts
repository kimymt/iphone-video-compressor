import { getOpfsWritable } from '../db/opfs';
import { writeIngestStream } from './ingest-stream';

let controller: AbortController | undefined;
self.onmessage = async (event: MessageEvent<{
  type: 'probe' | 'write' | 'cancel'; id: string;
  stream?: ReadableStream<Uint8Array>; path?: string; size?: number;
}>) => {
  const msg = event.data;
  if (msg.type === 'cancel') { controller?.abort(); return; }
  if (!msg.stream) return;
  try {
    if (msg.type === 'probe') {
      const reader = msg.stream.getReader();
      try {
        const first = await reader.read();
        const end = await reader.read();
        if (first.value?.[0] !== 73 || !end.done) throw new Error('invalid probe');
      } finally { reader.releaseLock(); }
    } else {
      controller = new AbortController();
      const output = await getOpfsWritable(msg.path!);
      await writeIngestStream(msg.stream, output, msg.size!, controller.signal,
        bytes => self.postMessage({ id: msg.id, type: 'progress', bytes }));
    }
    self.postMessage({ id: msg.id, type: 'done' });
  } catch (error) {
    self.postMessage({ id: msg.id, type: 'failed', error: String(error) });
  } finally { controller = undefined; }
};
