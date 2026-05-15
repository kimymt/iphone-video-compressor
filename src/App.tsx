import { useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import UnsupportedScreen from './components/UnsupportedScreen';
import FilePicker from './components/FilePicker';
import QueueList from './components/QueueList';
import SettingsSheet from './components/SettingsSheet';
import ToastStack from './components/Toast';
import WakeLockIndicator from './components/WakeLockIndicator';
import { verifyEnvironment } from './platform/capability';
import { ensurePersistent } from './platform/storage';
import { useQueueStore, type AddResult } from './stores/queueStore';
import { useSettingsStore } from './stores/settingsStore';
import { installSideEffects } from './stores/sideEffects';
import { useToastStore } from './stores/toastStore';
import { formatBytes } from './lib/format';
import { defaultPresetKey } from './lib/presets';
import type { EnvCheck } from './lib/types';

// Phase 4b: 6 ステータス対応の QueueItem + QueueList に統合。
// Phase 4c: retry + clearCompleted、Phase 5: ShareButton + WakeLock + 完了サウンド。
// Phase 6: PWA 化。Phase 7: グローバル ToastStack に一元化。
// Phase 7 post-v0.9.0: WakeLockIndicator (実機で「画面 ON 維持」を見える化)。
// V1.1: SettingsSheet (歯車アイコンから bottom sheet)。

export default function App() {
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const items = useQueueStore((s) => s.items);
  const init = useQueueStore((s) => s.init);
  const initialized = useQueueStore((s) => s.initialized);

  const settingsPreset = useSettingsStore((s) => s.preset);
  const settingsInit = useSettingsStore((s) => s.init);
  const settingsInitialized = useSettingsStore((s) => s.initialized);

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

  // canRun になったら init() + Persistent Storage 要求 + settingsStore 初期化
  useEffect(() => {
    if (envCheck?.canRun && !initialized) {
      init().catch((err) => {
        console.error('queueStore.init failed:', err);
        useToastStore.getState().show(
          'キューの復元に失敗しました。アプリを再起動してください。',
          { kind: 'error' },
        );
      });
      ensurePersistent().catch(() => {
        // 失敗しても致命的でない、UI でストレージ状態を表示するだけ。
      });
    }
    // settingsStore も同じタイミングで初期化 (envCheck 依存のため canRun を待つ必要がある)。
    if (envCheck?.canRun && !settingsInitialized) {
      settingsInit(envCheck);
    }
  }, [envCheck?.canRun, envCheck, initialized, init, settingsInitialized, settingsInit]);

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

  /**
   * add 失敗時の文言を Phase 7 の統一エラーメッセージに揃える。
   * - quota-exceeded → 「容量が足りません」+「あと約 {X} 必要です」(S9)
   * - opfs-write-failed → 「書き込みに失敗しました」(S10 相当の add-side)
   */
  const handleAddResult = (result: AddResult): void => {
    if (result.ok) return;
    const toast = useToastStore.getState();
    if (result.reason === 'quota-exceeded') {
      toast.show(`容量が足りません。あと約 ${formatBytes(result.required)} 必要です。`, {
        kind: 'error',
      });
    } else if (result.reason === 'opfs-write-failed') {
      toast.show(`書き込みに失敗しました: ${result.error}`, { kind: 'error' });
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

  // FilePicker に渡すプリセット。settingsStore が未初期化なら defaultPresetKey で fallback。
  const activePreset = settingsPreset ?? defaultPresetKey(envCheck);

  return (
    <main className="app min-h-dvh bg-[var(--bg)] text-[var(--label)]">
      <ToastStack />

      {/* CLAUDE.md「UI 仕様 > レスポンシブ」: コンテンツは max-width 393px (iPhone 標準) で
          中央寄せ。Pro Max (430px) や desktop / iPad で full-width に広がらないようにする。
          SettingsSheet は fixed なのでこのコンテナの外。 */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[393px] flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)]">
          <h1 className="title text-3xl font-bold">動画圧縮</h1>
          <div className="flex items-center gap-2">
            <WakeLockIndicator />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="設定を開く"
              data-testid="open-settings"
              className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--label)] transition-opacity active:opacity-60"
            >
              <SettingsIcon aria-hidden="true" size={22} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <QueueList items={items} />
        </div>

        <FilePicker preset={activePreset} onResult={handleAddResult} />
      </div>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        envCheck={envCheck}
      />
    </main>
  );
}
