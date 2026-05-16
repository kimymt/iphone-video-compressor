import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueueStore, type AddResult } from '../stores/queueStore';
import { unlockAudio } from '../platform/audio';
import { wakeLockManager } from '../platform/wakeLock';
import { useT } from '../i18n';
import type { PresetKey } from '../lib/types';

// Phase 2 で audio unlock を導入、Phase 5 でチャイム実装、Phase 7 で audio.ts に統合。
// ボタンタップは user gesture → 共有 AudioContext を resume して以降の playDoneSound が
// 同じ ctx で鳴るようにする (CLAUDE.md ハマりどころ 25 + v0.9.0 実機検証で再発見)。
//
// Wake Lock の eager acquire (v0.9.0 実機 → NotAllowedError を観測した後の対応):
// click ハンドラの先頭 (await の前) で wakeLockManager.acquire() を呼ぶ。
// iOS Safari は `change` イベントで transient user activation を持たない (もしくは
// その前の await で消費される) ため、`change` 経由の acquire は NotAllowedError になる。
// `click` イベントは確実に user activation を持つので、ここで request を発火する。
//
// v1.2.3: `<input type=file>.click()` も同じ user activation 制約を持つ。
// 以前は `await unlockAudio()` の後に `inputRef.current?.click()` を呼んでいたが、
// iOS Safari は await を挟むと file picker が silent drop される (CLAUDE.md ハマりどころ #34)。
// click を await の前に同期発火し、unlockAudio は fire-and-forget に切り替えた。
// 加えて、前回値が残っていると iOS Safari は picker 再表示を skip するので、
// click の直前に `input.value = ''` でリセットする。
//
// キャンセル検出: file picker をキャンセルした場合、change イベントは発火しないので
// Wake Lock が leak する。60 秒タイムアウトで isProcessing=false なら release する。

const CANCEL_DETECT_MS = 60_000;

type Props = {
  preset: PresetKey;
  onResult?: (result: AddResult) => void;
  disabled?: boolean;
};

export default function FilePicker({ preset, onResult, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelTimerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const add = useQueueStore((s) => s.add);
  const t = useT();

  const clearCancelTimer = (): void => {
    if (cancelTimerRef.current !== null) {
      clearTimeout(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
  };

  // unmount 時はタイマーをクリーンアップ
  useEffect(() => clearCancelTimer, []);

  const scheduleCancelDetect = (): void => {
    clearCancelTimer();
    cancelTimerRef.current = window.setTimeout(() => {
      cancelTimerRef.current = null;
      // 処理開始してなければユーザが file picker をキャンセルしたとみなして release
      if (!useQueueStore.getState().isProcessing) {
        void wakeLockManager.release();
      }
    }, CANCEL_DETECT_MS);
  };

  const handleClick = (): void => {
    if (busy || disabled) return;

    // iOS Safari の transient user activation は await を挟むと消費されるため、
    // user-activation を必要とする API はすべて click event 同期で発火する:
    //   1. navigator.wakeLock.request('screen')  (wakeLockManager.acquire 内で同期 call)
    //   2. <input type=file>.click()              (file picker を開く)
    //   3. AudioContext.resume()                  (unlockAudio 内で同期 call)
    // unlockAudio を await すると 3 は成功するが、その後の 2 が「user gesture 切れ」で
    // silent drop される (v1.2.3 で実機 iPhone から再現報告)。
    void wakeLockManager.acquire();
    scheduleCancelDetect();

    // CLAUDE.md ハマりどころ #34: 前回値が残っていると iOS Safari は picker 再表示を
    // skip する (同じファイル選択でも change が発火しない既知の挙動と同根)。click 前に
    // 必ず value='' でリセットする。
    const input = inputRef.current;
    if (input) {
      input.value = '';
      input.click();
    }

    // AudioContext.resume() は呼び出し時点で sticky activation 内なので、await せず
    // fire-and-forget でも成功する。完了サウンドは別 tick の playDoneSound が再 resume
    // を試行するので、unlock を待つ必要はない。
    void unlockAudio();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    // change が発火 = キャンセルではない → タイマー停止
    clearCancelTimer();

    const files = Array.from(e.target.files ?? []);
    // input を即リセット (同じファイルを連続選択できるように)
    e.target.value = '';
    if (files.length === 0) {
      // iOS Safari は通常キャンセル時 change を発火しないが、defensive に release
      if (!useQueueStore.getState().isProcessing) {
        void wakeLockManager.release();
      }
      return;
    }

    // 念のため再度 acquire (既取得なら WakeLockManager 側で no-op)。
    // click でうまくいっていればここでの request は実行されない。
    void wakeLockManager.acquire();

    setBusy(true);
    try {
      const result = await add(files, preset);
      onResult?.(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sticky bottom-0 w-full bg-[var(--bg)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-base font-semibold text-white shadow-lg transition-opacity active:opacity-80 disabled:opacity-50"
        aria-label={t('filePicker.aria')}
      >
        <Plus size={20} aria-hidden="true" />
        <span>{busy ? t('filePicker.loading') : t('filePicker.cta')}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/*"
        multiple
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
      />
    </div>
  );
}
