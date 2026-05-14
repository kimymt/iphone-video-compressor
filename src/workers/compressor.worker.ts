// Phase 3b worker entry: 薄い Web Worker のエントリポイント。
// JobRunner にすべてのロジックを委譲する。テストは compressor-runner.test.ts で
// JobRunner を直接叩いて検証するので、この entry ファイル自体には unit テストは
// 用意しない (Worker 内 `self` への副作用が中心で、テスト価値が低い)。

import { JobRunner } from './compressor-runner';
import { transcode } from '../pipeline/transcode';
import { readFromOpfs, getOpfsWritable } from '../db/opfs';
import type { WorkerRequest, WorkerResponse } from './messages';

const runner = new JobRunner({
  post: (msg: WorkerResponse) => {
    self.postMessage(msg);
  },
  readInput: readFromOpfs,
  openOutput: getOpfsWritable,
  runTranscode: transcode,
});

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  // handle は async だが Promise を漏らさない (JobRunner 内で catch 済み)。
  void runner.handle(event.data);
});

// 未捕捉エラーの最終フェイルセーフ。本来は JobRunner.handle 内で catch されるはずだが、
// 想定外の synchronous error / unhandled rejection を Worker クラッシュではなく
// メインスレッドに通知する。
self.addEventListener('error', (event) => {
  self.postMessage({
    type: 'failed',
    id: 'unknown',
    error: `worker uncaught: ${event.message}`,
  } satisfies WorkerResponse);
});

self.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  self.postMessage({
    type: 'failed',
    id: 'unknown',
    error: `worker unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
  } satisfies WorkerResponse);
});
