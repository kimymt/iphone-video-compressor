import { useEffect, useState } from 'react';
import UnsupportedScreen from './components/UnsupportedScreen';
import { verifyEnvironment } from './platform/capability';
import type { EnvCheck } from './lib/types';

// Phase 1: capability check → 分岐。
// canRun=false → UnsupportedScreen、canRun=true → Hello 画面 (Phase 2 で QueueList に置き換え)。
export default function App() {
  const [envCheck, setEnvCheck] = useState<EnvCheck | null>(null);

  useEffect(() => {
    let cancelled = false;
    verifyEnvironment()
      .then((result) => {
        if (!cancelled) setEnvCheck(result);
      })
      .catch((err) => {
        // capability check 自体が失敗した場合は未対応扱い。
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

  if (envCheck === null) {
    // capability check 中。
    // Phase 2 でスケルトン UI に置き換え予定 (UI 仕様 S8)。
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

  // Phase 2 以降で SettingsSheet + QueueList + FilePicker に置き換え。
  return (
    <main className="app flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--label)]">
      <h1 className="title text-3xl font-bold">Hello, 動画圧縮</h1>
    </main>
  );
}
