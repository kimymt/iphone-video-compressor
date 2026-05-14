// Phase 7 post-v0.9.0: Wake Lock の取得状態を見える化する小さな badge。
// 実機で「画面が暗くならないか」を確認する際の検証材料。
//
// 表示ロジック:
// - isProcessing=false: 非表示
// - isProcessing=true & wakeLock active: Sun アイコン + 「画面 ON」 (warning カラー)
// - isProcessing=true & wakeLock inactive: AlertTriangle + 「画面 ON 失敗」 (error カラー、
//   許可されなかった / システム release 後に再取得失敗のシナリオで出る)

import { useEffect, useState } from 'react';
import { Sun, AlertTriangle } from 'lucide-react';
import { useQueueStore } from '../stores/queueStore';
import { wakeLockManager, type WakeLockManager } from '../platform/wakeLock';

export interface WakeLockIndicatorProps {
  /** テストで別の WakeLockManager を注入できるよう拡張可。デフォルトは singleton。 */
  manager?: WakeLockManager;
}

export default function WakeLockIndicator({ manager }: WakeLockIndicatorProps = {}) {
  const mgr = manager ?? wakeLockManager;
  const isProcessing = useQueueStore((s) => s.isProcessing);
  const [active, setActive] = useState<boolean>(() => mgr.isActive());

  useEffect(() => {
    setActive(mgr.isActive());
    const unsub = mgr.onChange(setActive);
    return unsub;
  }, [mgr]);

  if (!isProcessing) return null;

  if (active) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label="圧縮中。画面が暗くならないよう Wake Lock を取得中"
        data-testid="wake-lock-indicator"
        data-state="active"
        title="Wake Lock 取得中 (画面が暗くなりません)"
        className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--label-secondary)]"
      >
        <Sun aria-hidden="true" size={14} className="text-[var(--warning)]" />
        <span>画面 ON</span>
      </span>
    );
  }

  // isProcessing だが lock が取れていない: 通知
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label="Wake Lock 取得に失敗しました。画面が暗くなる可能性があります"
      data-testid="wake-lock-indicator"
      data-state="inactive"
      title="Wake Lock 取得失敗: 画面が暗くなる可能性があります"
      className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--error)]"
    >
      <AlertTriangle aria-hidden="true" size={14} />
      <span>画面 ON 失敗</span>
    </span>
  );
}
