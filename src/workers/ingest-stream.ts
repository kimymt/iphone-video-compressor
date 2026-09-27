/** One pipe, bounded by stream backpressure; close commits only after exact size validation. */
export async function writeIngestStream(
  input: ReadableStream<Uint8Array>, output: WritableStream<Uint8Array>, expectedSize: number,
  signal: AbortSignal, onProgress: (bytes: number) => void,
): Promise<void> {
  let bytes = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, sink) {
      bytes += chunk.byteLength;
      if (bytes > expectedSize) throw new Error('input size exceeded');
      sink.enqueue(chunk);
      onProgress(bytes);
    },
    flush() { if (bytes !== expectedSize) throw new Error('input size mismatch'); },
  });
  await input.pipeThrough(counter).pipeTo(output, { signal });
}
