import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useQueueStore, type AddResult } from '../stores/queueStore';
import type { PresetKey } from '../lib/types';

let audioContextUnlocked = false;

/**
 * iOS Safari の audio unlock: 最初のユーザージェスチャーで AudioContext を resume し、
 * 1 サンプルの BufferSource を再生して 'unlocked' 状態にする。
 * Phase 5 で done.m4a を `<audio>` 経由で鳴らすときの前提条件。
 * 既に解除済みなら no-op。
 */
async function unlockAudio(): Promise<void> {
  if (audioContextUnlocked) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') await ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    audioContextUnlocked = true;
  } catch {
    // unlock 失敗は致命的でない。Phase 5 の done.m4a 再生時に再試行する。
  }
}

/** テスト用: unlock 状態リセット */
export function _resetAudioUnlockForTest(): void {
  audioContextUnlocked = false;
}

type Props = {
  preset: PresetKey;
  onResult?: (result: AddResult) => void;
  disabled?: boolean;
};

export default function FilePicker({ preset, onResult, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const add = useQueueStore((s) => s.add);

  const handleClick = async () => {
    if (busy || disabled) return;
    await unlockAudio();
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
