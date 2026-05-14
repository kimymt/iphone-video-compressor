// Phase 5: queueStore の状態遷移に応じた side effect を install する。
//
// - isProcessing false→true: wakeLockManager.acquire()
// - isProcessing true→false: wakeLockManager.release()
// - 任意 item の status が 'done' になった: playDoneSound()
//
// queueStore 自体は純粋に保つため subscribe で外側から effect を駆動する。
// App.tsx が mount 時に 1 回 installSideEffects() を呼ぶ想定。
// 依存はオプションで注入できる (テスト + 将来の差し替え可能性のため)。

import { useQueueStore } from './queueStore';
import { wakeLockManager } from '../platform/wakeLock';
import { playDoneSound } from '../platform/audio';

export interface SideEffectsDeps {
  /** WakeLock 取得ハンドラ。デフォルトは singleton wakeLockManager.acquire。 */
  wakeLockAcquire?: () => Promise<void> | void;
  /** WakeLock 解放ハンドラ。デフォルトは singleton wakeLockManager.release。 */
  wakeLockRelease?: () => Promise<void> | void;
  /** 完了サウンドハンドラ。デフォルトは audio.ts の playDoneSound。 */
  playDoneSound?: () => Promise<void> | void;
}

/**
 * Side effect を install する。
 * 戻り値は unsubscribe 関数。テストで cleanup したいときに使う。
 * App.tsx の useEffect から呼び出し、return で unsubscribe する。
 */
export function installSideEffects(deps: SideEffectsDeps = {}): () => void {
  const acquire = deps.wakeLockAcquire ?? (() => wakeLockManager.acquire());
  const release = deps.wakeLockRelease ?? (() => wakeLockManager.release());
  const sound = deps.playDoneSound ?? (() => playDoneSound());

  const initial = useQueueStore.getState();
  let lastIsProcessing = initial.isProcessing;
  let lastDoneIds = collectDoneIds(initial.items);

  const unsubscribe = useQueueStore.subscribe((state) => {
    // WakeLock 遷移
    if (!lastIsProcessing && state.isProcessing) {
      void acquire();
    } else if (lastIsProcessing && !state.isProcessing) {
      void release();
    }
    lastIsProcessing = state.isProcessing;

    // 新しく done になった item に対して 1 度だけサウンド
    const current = new Set<string>();
    for (const item of state.items) {
      if (item.status === 'done') {
        current.add(item.id);
        if (!lastDoneIds.has(item.id)) {
          void sound();
        }
      }
    }
    lastDoneIds = current;
  });

  return unsubscribe;
}

function collectDoneIds(items: readonly { id: string; status: string }[]): Set<string> {
  const s = new Set<string>();
  for (const item of items) {
    if (item.status === 'done') s.add(item.id);
  }
  return s;
}
