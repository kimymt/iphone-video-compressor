// Phase 7: 全体のトースト通知を一元管理する小さな Zustand store。
//
// 利用者 (App / ShareButton / main.tsx 等) は `show()` を呼ぶだけ。
// React ツリーの外 (main.tsx) からも `useToastStore.getState().show(...)` でアクセス可能。
// 自動 dismiss のタイマーは show 時に setTimeout で予約され、duration=0 なら手動 dismiss のみ。

import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** unix ms。表示開始時刻。a11y アナウンスや並び替えで使う。 */
  createdAt: number;
}

export interface ToastShowOptions {
  kind?: ToastKind;
  /** 自動 dismiss の遅延 ms。0 を渡すと手動 dismiss のみ。未指定でデフォルト。 */
  durationMs?: number;
}

interface ToastState {
  items: Toast[];
  show: (message: string, opts?: ToastShowOptions) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

/** 既定の自動 dismiss 遅延 (ms)。Reduced Motion なら Toast 側で 5 秒に延長する。 */
export const DEFAULT_TOAST_DURATION_MS = 3500;

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],

  show(message, opts = {}) {
    const id = nextId++;
    const kind = opts.kind ?? 'info';
    const toast: Toast = { id, kind, message, createdAt: Date.now() };
    set((state) => ({ items: [...state.items, toast] }));

    const duration = opts.durationMs ?? DEFAULT_TOAST_DURATION_MS;
    if (duration > 0) {
      setTimeout(() => {
        get().dismiss(id);
      }, duration);
    }
    return id;
  },

  dismiss(id) {
    set((state) => ({ items: state.items.filter((t) => t.id !== id) }));
  },

  clear() {
    set({ items: [] });
  },
}));

/** テスト用: store 状態と id カウンタをリセット。 */
export function _resetToastStoreForTest(): void {
  nextId = 1;
  useToastStore.setState({ items: [] });
}
