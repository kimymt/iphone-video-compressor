import { useEffect, useState } from 'react';
import UnsupportedScreen from './components/UnsupportedScreen';
import FilePicker from './components/FilePicker';
import QueueList from './components/QueueList';
import { verifyEnvironment } from './platform/capability';
import { ensurePersistent } from './platform/storage';
import { useQueueStore, type AddResult } from './stores/queueStore';
import { installSideEffects } from './stores/sideEffects';
import { formatBytes } from './lib/format';
import type { EnvCheck } from './lib/types';

// Phase 4b: 6 ステータス対応の QueueItem + QueueList に統合。
// Phase 4c: retry + clearCompleted、Phase 5: ShareButton + WakeLock + 完了サウンド。
// SettingsSheet (歯車) は Phase 6。

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

  // Phase 5: WakeLock + 完了サウンドの side effect を install。
  // initialized 後に 1 度だけ。queueStore の状態遷移を subscribe する。
  useEffect(() => {
    if (!initialized) return;
    const unsubscribe = installSideEffects();
    return () => {
      unsubscribe();
    };
  }, [initialized]);

  // dev mode (?dev=1) で E2E から store にアクセスできるよう window に露出。
  // __movieCompresserStore: 現在の state スナップショット (items / actions)。items 変更で再代入。
  // __movieCompresserSetState: zustand の setState 関数。Phase 4c E2E で terminal アイテムを
  // OPFS / IndexedDB を介さずに直接 seed するため (WebKit headless で OPFS が transient に
  // 失敗するケースを回避)。dev でのみ露出するので本番には影響しない。
  useEffect(() => {
    if (!initialized) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') !== '1') return;
    const w = window as unknown as Record<string, unknown>;
    w.__movieCompresserStore = useQueueStore.getState();
    w.__movieCompresserSetState = useQueueStore.setState;
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

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <QueueList items={items} />
      </div>

      <FilePicker preset="standard-hevc" onResult={handleAddResult} />
    </main>
  );
}
