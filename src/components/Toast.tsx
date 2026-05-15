// Phase 7: グローバルトーストの描画コンポーネント。
// toastStore.items を購読し、kind に応じて role / aria-live / 配色を切り替える。
//
// 配置:
//   - position: fixed、top center、safe-area-inset-top を尊重
//   - 複数同時表示は縦に積む
// 操作:
//   - 自動 dismiss は toastStore 側のタイマー
//   - X ボタンで手動 dismiss も可能

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type Toast, type ToastKind } from '../stores/toastStore';
import { useT } from '../i18n';

const KIND_STYLES: Record<ToastKind, { bg: string; Icon: typeof Info }> = {
  info: { bg: 'bg-[var(--accent)]', Icon: Info },
  success: { bg: 'bg-[var(--success)]', Icon: CheckCircle2 },
  error: { bg: 'bg-[var(--error)]', Icon: AlertTriangle },
};

function ariaPropsFor(kind: ToastKind): { role: 'alert' | 'status'; live: 'assertive' | 'polite' } {
  return kind === 'error'
    ? { role: 'alert', live: 'assertive' }
    : { role: 'status', live: 'polite' };
}

export default function ToastStack() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  if (items.length === 0) return null;

  return (
    <div
      data-testid="toast-stack"
      className="pointer-events-none fixed left-1/2 top-[max(env(safe-area-inset-top),16px)] z-50 flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-3"
    >
      {items.map((t) => (
        <ToastBubble key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastBubble({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { bg, Icon } = KIND_STYLES[toast.kind];
  const { role, live } = ariaPropsFor(toast.kind);
  const t = useT();

  return (
    <div
      role={role}
      aria-live={live}
      data-testid="toast"
      data-kind={toast.kind}
      className={`pointer-events-auto flex w-full items-start gap-2 rounded-xl ${bg} px-4 py-3 text-sm text-white shadow-xl`}
    >
      <Icon aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
      <span className="flex-1 break-words leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        aria-label={t('toast.closeAria')}
      >
        <X aria-hidden="true" size={14} />
      </button>
    </div>
  );
}
