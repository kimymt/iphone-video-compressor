import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await inspect(file); continue; }
    assert(!/ingest\.worker|ios27-validation|ios27\.html/.test(entry.name), `Development artifact shipped: ${file}`);
    if (/\.(js|html)$/.test(entry.name)) {
      const content = await readFile(file, 'utf8');
      assert(!/experimental-stream-ingest|pending-ingests/.test(content), `Development ingestion code shipped: ${file}`);
    }
  }
}
await inspect('dist');
console.log('Production isolation passed');
