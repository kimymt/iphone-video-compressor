// Phase 7 post-v0.9.0: Wake Lock の取得状態を見える化する小さな badge。
// 実機で「画面が暗くならないか」を確認する際の検証材料。
// V2: i18n 化 (badge 文言 / title / aria-label を t() 経由)。
//
// 表示ロジック:
// - isProcessing=false: 非表示
// - isProcessing=true & wakeLock active: Sun アイコン + 「画面 ON」 (warning カラー)
// - isProcessing=true & wakeLock inactive: AlertTriangle + 「画面 ON 失敗」 (error カラー、
//   許可されなかった / システム release 後に再取得失敗のシナリオで出る)

import { useEffect, useState } from 'react';
import { Sun, AlertTriangle } from 'lucide-react';
import { useQueueStore } from '../stores/queueStore';
import { useT } from '../i18n';
import {
  wakeLockManager,
  type WakeLockManager,
  type WakeLockError,
} from '../platform/wakeLock';

export interface WakeLockIndicatorProps {
  /** テストで別の WakeLockManager を注入できるよう拡張可。デフォルトは singleton。 */
  manager?: WakeLockManager;
}

export default function WakeLockIndicator({ manager }: WakeLockIndicatorProps = {}) {
  const mgr = manager ?? wakeLockManager;
  const isProcessing = useQueueStore((s) => s.isProcessing);
  const [active, setActive] = useState<boolean>(() => mgr.isActive());
  const [error, setError] = useState<WakeLockError | null>(() => mgr.getLastError());
  const t = useT();

  useEffect(() => {
    setActive(mgr.isActive());
    setError(mgr.getLastError());
    const unsub = mgr.onChange((a) => {
      setActive(a);
      setError(mgr.getLastError());
    });
    return unsub;
  }, [mgr]);

  if (!isProcessing) return null;

  if (active) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-label={t('wakeLock.activeAria')}
        data-testid="wake-lock-indicator"
        data-state="active"
        title={t('wakeLock.activeTitle')}
        className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--label-secondary)]"
      >
        <Sun aria-hidden="true" size={14} className="text-[var(--warning)]" />
        <span>{t('wakeLock.activeLabel')}</span>
      </span>
    );
  }

  // isProcessing だが lock が取れていない: 通知。エラー名があれば併記して診断材料に。
  const errLabel = error ? t('wakeLock.errSuffix', { errorName: error.name }) : '';
  const errTitle = error
    ? t('wakeLock.failedTitleWithError', { errorName: error.name, errorMessage: error.message })
    : t('wakeLock.failedTitleNoError');
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={t('wakeLock.failedAria', { errLabel })}
      data-testid="wake-lock-indicator"
      data-state="inactive"
      data-error-name={error?.name}
      title={errTitle}
      className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--error)]"
    >
      <AlertTriangle aria-hidden="true" size={14} />
      <span>
        {t('wakeLock.failedLabel')}
        {errLabel}
      </span>
    </span>
  );
}
