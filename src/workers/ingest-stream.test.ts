import { describe, it, expect, vi } from 'vitest';
import { writeIngestStream } from './ingest-stream';

function input(size: number) {
  return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(size)); c.close(); } });
}
describe('stream write lifecycle', () => {
  it('does not commit a truncated input', async () => {
    const close = vi.fn(), abort = vi.fn();
    await expect(writeIngestStream(input(3), new WritableStream({ close, abort }), 4,
      new AbortController().signal, () => {})).rejects.toThrow('size mismatch');
    expect(close).not.toHaveBeenCalled();
    expect(abort).toHaveBeenCalledOnce();
  });
  it('does not write oversized input', async () => {
    const write = vi.fn(), close = vi.fn();
    await expect(writeIngestStream(input(5), new WritableStream({ write, close }), 4,
      new AbortController().signal, () => {})).rejects.toThrow('size exceeded');
    expect(write).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('propagates quota failure instead of committing', async () => {
    const close = vi.fn();
    const error = new DOMException('full', 'QuotaExceededError');
    await expect(writeIngestStream(input(4), new WritableStream({ write() { throw error; }, close }), 4,
      new AbortController().signal, () => {})).rejects.toBe(error);
    expect(close).not.toHaveBeenCalled();
  });
  it('awaits storage writes before committing', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const close = vi.fn();
    const started = vi.fn();
    const done = writeIngestStream(input(4), new WritableStream({ async write() { started(); await gate; }, close }),
      4, new AbortController().signal, () => {});
    await vi.waitFor(() => expect(started).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    release(); await done;
    expect(close).toHaveBeenCalledOnce();
  });
});
