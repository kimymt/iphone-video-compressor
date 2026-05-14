import type { EnvCheck } from '../lib/types';

type Props = {
  envCheck: EnvCheck;
};

// canRun に影響する API と、影響しない情報 API を分けて表示。
// canRun の AND は videoEncoder && audioEncoder && h264Encode。
const CORE_LABELS: Record<string, string> = {
  videoEncoder: 'VideoEncoder (WebCodecs)',
  audioEncoder: 'AudioEncoder (WebCodecs)',
  h264Encode: 'H.264 エンコード',
};

const OPTIONAL_LABELS: Record<string, string> = {
  hevcEncode: 'HEVC エンコード',
  webShareFiles: '共有 (navigator.share with files)',
  wakeLock: 'Wake Lock',
  opfs: 'OPFS ストレージ',
  persistentStorage: 'Persistent Storage',
};

export default function UnsupportedScreen({ envCheck }: Props) {
  const missingCore = Object.entries(CORE_LABELS)
    .filter(([key]) => !envCheck[key as keyof EnvCheck])
    .map(([, label]) => label);

  const missingOptional = Object.entries(OPTIONAL_LABELS)
    .filter(([key]) => !envCheck[key as keyof EnvCheck])
    .map(([, label]) => label);

  return (
    <main
      className="app flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] px-6 text-center text-[var(--label)]"
      role="alert"
    >
      <h1 className="title text-2xl font-bold leading-tight sm:text-3xl">
        このアプリは iOS 26 以降の Safari でお使いください
      </h1>
      <p className="mt-4 max-w-md text-sm text-[var(--label-secondary)]">
        動画圧縮には WebCodecs API が必要です。お使いのブラウザでは必須の機能が利用できません。
        iPhone を iOS 26 以降にアップデートして、Safari で開き直してください。
      </p>

      {missingCore.length > 0 && (
        <section className="mt-8 max-w-md text-left text-sm">
          <h2 className="font-semibold text-[var(--label)]">必須機能 (未サポート)</h2>
          <ul className="mt-2 list-disc pl-6 text-[var(--label-secondary)]">
            {missingCore.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </section>
      )}

      {missingOptional.length > 0 && (
        <details className="mt-6 max-w-md text-left text-sm text-[var(--label-tertiary)]">
          <summary className="cursor-pointer">詳細を表示</summary>
          <p className="mt-2">利用できない補助機能:</p>
          <ul className="mt-1 list-disc pl-6">
            {missingOptional.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
