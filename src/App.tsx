import { useEffect, useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import UnsupportedScreen from './components/UnsupportedScreen';
import FilePicker from './components/FilePicker';
import QueueList from './components/QueueList';
import SettingsSheet from './components/SettingsSheet';
import ToastStack from './components/Toast';
import WakeLockIndicator from './components/WakeLockIndicator';
import { verifyEnvironment, isDevOverrideActive } from './platform/capability';
import { ensurePersistent } from './platform/storage';
import { useQueueStore, type AddResult } from './stores/queueStore';
import { useSettingsStore } from './stores/settingsStore';
import { installSideEffects } from './stores/sideEffects';
import { useToastStore } from './stores/toastStore';
import { useI18n } from './i18n';
import { formatBytes } from './lib/format';
import { defaultPresetKey } from './lib/presets';
import type { EnvCheck } from './lib/types';
import { maybeAutoRunHevcBench } from './pipeline/hevcBenchOrchestrator';

// Phase 4b: 6 ステータス対応の QueueItem + QueueList に統合。
// Phase 4c: retry + clearCompleted、Phase 5: ShareButton + WakeLock + 完了サウンド。
// Phase 6: PWA 化。Phase 7: グローバル ToastStack に一元化。
// Phase 7 post-v0.9.0: WakeLockIndicator (実機で「画面 ON 維持」を見える化)。
// V1.1: SettingsSheet (歯車アイコンから bottom sheet)。
// V2: i18n (useT で全文言を翻訳、settingsStore.language を I18nProvider にプッシュ)。

export default function App() {
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const items = useQueueStore((s) => s.items);
  const init = useQueueStore((s) => s.init);
  const initialized = useQueueStore((s) => s.initialized);
  const isProcessing = useQueueStore((s) => s.isProcessing);

  const settingsPreset = useSettingsStore((s) => s.preset);
  const settingsLanguage = useSettingsStore((s) => s.language);
  const settingsInit = useSettingsStore((s) => s.init);
  const settingsInitialized = useSettingsStore((s) => s.initialized);
  const settingsHevcBench = useSettingsStore((s) => s.hevcBench);

  const { t, preference: i18nPreference, setPreference: setI18nPreference } = useI18n();

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
        useToastStore.getState().show(t('app.queueRestoreFailed'), { kind: 'error' });
      });
      ensurePersistent().catch(() => {
        // 失敗しても致命的でない、UI でストレージ状態を表示するだけ。
      });
    }
    // settingsStore も同じタイミングで初期化 (envCheck 依存のため canRun を待つ必要がある)。
    if (envCheck?.canRun && !settingsInitialized) {
      settingsInit(envCheck);
    }
  }, [envCheck?.canRun, envCheck, initialized, init, settingsInitialized, settingsInit, t]);

  // V2: settingsStore.language の値を I18nProvider に反映。
  // settings 初期化後 + ユーザが SettingsSheet で言語を切替えた時の両方で同期される。
  useEffect(() => {
    if (settingsInitialized && settingsLanguage !== i18nPreference) {
      setI18nPreference(settingsLanguage);
    }
  }, [settingsInitialized, settingsLanguage, i18nPreference, setI18nPreference]);

  // Phase 5: WakeLock + 完了サウンドの side effect を install。
  // initialized 後に 1 度だけ。queueStore の状態遷移を subscribe する。
  useEffect(() => {
    if (!initialized) return;
    const unsubscribe = installSideEffects();
    return () => {
      unsubscribe();
    };
  }, [initialized]);

  // V2: HEVC 並列ベンチを自動実行 (1 回だけ、shouldRunBench が true のとき)。
  // 条件:
  //   - envCheck.hevcEncode === true (非 HEVC 端末は不要)
  //   - settingsInitialized (hevcBench record が読み込まれている)
  //   - キューが処理中でない (orchestrator が 'queue-busy' で skip。bench が
  //     実 transcode と VideoToolbox を取り合うと計測が歪むため)
  //   - shouldRunBench(record) === true (未実行 or 90 日以上経過)
  //   - in-flight ロックが空 (orchestrator 内部で管理)
  // isProcessing を deps に含めることで、起動時にキュー復元 → 自動再開で skip
  // されても、処理完了 (isProcessing false) のタイミングで再評価される。
  // 失敗は console.warn のみで握り潰す (致命的でない、次回起動で再試行)。
  useEffect(() => {
    if (!envCheck?.canRun) return;
    if (!envCheck.hevcEncode) return;
    if (!settingsInitialized) return;
    if (isProcessing) return;
    const result = maybeAutoRunHevcBench(
      { hevcEncode: envCheck.hevcEncode },
      settingsHevcBench,
    );
    if (result.status === 'started') {
      result.promise.catch(() => {
        // orchestrator が console.warn を出すので追加処理は不要
      });
    }
    // settingsHevcBench の参照が変わった時 (= bench 完了で record 更新時) と
    // isProcessing の遷移時のみ再評価。それ以外は in-flight ロックで spam を防ぐ。
  }, [envCheck, settingsInitialized, settingsHevcBench, isProcessing]);

  // dev mode (?dev=1) で E2E から store にアクセスできるよう window に露出。
  // __movieCompresserStore: 現在の state スナップショット (items / actions)。items 変更で再代入。
  // __movieCompresserSetState: zustand の setState 関数。Phase 4c E2E で terminal アイテムを
  // OPFS / IndexedDB を介さずに直接 seed するため (WebKit headless で OPFS が transient に
  // 失敗するケースを回避)。
  // isDevOverrideActive はクエリだけでなくビルドフラグ (DEV / VITE_ALLOW_DEV_OVERRIDE)
  // も要求するため、本番ビルドでは ?dev=1 を付けても露出しない。
  useEffect(() => {
    if (!initialized) return;
    if (typeof window === 'undefined') return;
    if (!isDevOverrideActive()) return;
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
      toast.show(t('error.quotaExceeded', { size: formatBytes(result.required) }), {
        kind: 'error',
      });
    } else if (result.reason === 'opfs-write-failed') {
      toast.show(t('error.writeFailed', { error: result.error }), { kind: 'error' });
    }
  };

  if (envCheck === null) {
    return (
      <main
        className="app flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--label-secondary)]"
        aria-busy="true"
        aria-label={t('app.loadingAria')}
      >
        <span>{t('app.loading')}</span>
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
          <div className="min-w-0 flex-1">
            <h1 className="title text-3xl font-bold">{t('app.title')}</h1>
            {/* V2.x: iOS 26+ 専用シグナル。ヘッダの 2 段組で目立たせず、しかし常に見える。 */}
            <p
              data-testid="app-subtitle"
              className="tabular pt-0.5 text-xs text-[var(--label-secondary)]"
            >
              {t('app.subtitle')}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <WakeLockIndicator />
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t('settings.openAria')}
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
