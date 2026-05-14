import { useEffect, useState } from 'react';
import { Trash2, Video } from 'lucide-react';
import UnsupportedScreen from './components/UnsupportedScreen';
import FilePicker from './components/FilePicker';
import { verifyEnvironment } from './platform/capability';
import { ensurePersistent } from './platform/storage';
import { useQueueStore, type AddResult } from './stores/queueStore';
import { formatBytes } from './lib/format';
import type { EnvCheck, QueueItem } from './lib/types';

// Phase 2: capability check → init() → 最小キュー UI (TitleBar + QueueList + FilePicker)。
// Phase 4 で QueueItem の UI を 6 ステータス対応に、Phase 6 で SettingsSheet を追加。

function statusLabel(status: QueueItem['status']): string {
  switch (status) {
    case 'queued': return 'キュー待ち';
    case 'starting': return '開始中…';
    case 'processing': return '処理中';
    case 'done': return '完了';
    case 'failed': return 'エラー';
    case 'cancelled': return 'キャンセル済み';
  }
}

function ToastError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed left-1/2 top-[max(env(safe-area-inset-top),16px)] z-50 -translate-x-1/2 rounded-xl bg-[var(--error)] px-4 py-3 text-sm text-white shadow-xl"
    >
      {message}
    </div>
  );
}

export default function App() {
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const items = useQueueStore((s) => s.items);
  const init = useQueueStore((s) => s.init);
  const remove = useQueueStore((s) => s.remove);
  const initialized = useQueueStore((s) => s.initialized);

  // 起動時 capability check
  useEffect(() => {
    let cancelled = false;
    verifyEnvironment()
      .then((result) => {
        if (!cancelled) setEnvCheck(result);
      })
      .catch((err) => {
        console.error('verifyEnvironment failed:', err);
        if (!cancelled) {
          setEnvCheck({
            videoEncoder: false,
            audioEncoder: false,
            webShareFiles: false,
            wakeLock: false,
            opfs: false,
            persistentStorage: false,
            hevcEncode: false,
            h264Encode: false,
            canRun: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // canRun になったら init() + Persistent Storage 要求
  useEffect(() => {
    if (envCheck?.canRun && !initialized) {
      init().catch((err) => {
        console.error('queueStore.init failed:', err);
      });
      ensurePersistent().catch(() => {
        // 失敗しても致命的でない、UI でストレージ状態を表示するだけ。
      });
    }
  }, [envCheck?.canRun, initialized, init]);

  // dev mode (?dev=1) で E2E から store にアクセスできるよう window に露出。
  // 本番では実行されない (capability.ts の dev override と同じガード)。
  useEffect(() => {
    if (!initialized) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') !== '1') return;
    (window as unknown as Record<string, unknown>).__movieCompresserStore = useQueueStore.getState();
  }, [initialized, items]);

  const handleAddResult = (result: AddResult) => {
    if (result.ok) return;
    if (result.reason === 'quota-exceeded') {
      setToast(`容量が足りません。あと約 ${formatBytes(result.required)} 必要です。`);
    } else if (result.reason === 'opfs-write-failed') {
      setToast(`書き込みに失敗しました: ${result.error}`);
    }
  };

  if (envCheck === null) {
    return (
      <main
        className="app flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--label-secondary)]"
        aria-busy="true"
        aria-label="環境を確認中"
      >
        <span>確認中…</span>
      </main>
    );
  }

  if (!envCheck.canRun) {
    return <UnsupportedScreen envCheck={envCheck} />;
  }

  return (
    <main className="app flex min-h-dvh flex-col bg-[var(--bg)] text-[var(--label)]">
      {toast && <ToastError message={toast} onDismiss={() => setToast(null)} />}

      <header className="px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
        <h1 className="title text-3xl font-bold">動画圧縮</h1>
      </header>

      <ul
        role="list"
        aria-label="圧縮キュー"
        className="flex-1 overflow-y-auto px-4"
        data-testid="queue-list"
      >
        {items.length === 0 ? (
          <li className="flex flex-col items-center gap-3 py-16 text-center text-[var(--label-secondary)]">
            <Video size={48} aria-hidden="true" />
            <p className="font-semibold text-[var(--label)]">まだ何もありません</p>
            <p className="text-sm">下の「動画を選択」から始められます</p>
          </li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              role="listitem"
              aria-label={`${item.fileName}、${statusLabel(item.status)}、進捗 ${item.progress}%`}
              className="flex items-center justify-between border-b border-[var(--separator)] py-3"
              data-testid="queue-item"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.fileName}</p>
                <p className="tabular text-xs text-[var(--label-secondary)]">
                  {formatBytes(item.inputSize)} · {statusLabel(item.status)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="ml-3 flex h-11 w-11 items-center justify-center rounded-full text-[var(--label-secondary)] hover:bg-[var(--surface)]"
                aria-label={`${item.fileName} を削除`}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>

      <FilePicker preset="standard-hevc" onResult={handleAddResult} />
    </main>
  );
}
