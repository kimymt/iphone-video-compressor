import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueueStore, type AddResult } from '../stores/queueStore';
import { unlockAudio } from '../platform/audio';
import type { PresetKey } from '../lib/types';

// Phase 2 で audio unlock を導入、Phase 5 でチャイム実装、Phase 7 で audio.ts に統合。
// ボタンタップは user gesture → 共有 AudioContext を resume して以降の playDoneSound が
// 同じ ctx で鳴るようにする (CLAUDE.md ハマりどころ 25 + v0.9.0 実機検証で再発見)。

type Props = {
  preset: PresetKey;
  onResult?: (result: AddResult) => void;
  disabled?: boolean;
};

export default function FilePicker({ preset, onResult, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const add = useQueueStore((s) => s.add);

  const handleClick = async (): Promise<void> => {
    if (busy || disabled) return;
    // user gesture を逃さないよう同期的に呼ぶ。失敗してもピッカーは開く。
    await unlockAudio();
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? []);
    // input を即リセット (同じファイルを連続選択できるように)
    e.target.value = '';
    if (files.length === 0) return;

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
        aria-label="動画を選択"
      >
        <Plus size={20} aria-hidden="true" />
        <span>{busy ? '読み込み中…' : '動画を選択'}</span>
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
