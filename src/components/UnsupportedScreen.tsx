// Phase 1: iOS 26 capability check に失敗した端末向け screen。
// V2: i18n 化 (見出し / 説明文 / feature ラベル を t() 経由)。

import { useT } from '../i18n';
import type { EnvCheck } from '../lib/types';

type Props = {
  envCheck: EnvCheck;
};

// canRun に影響する API と、影響しない情報 API を分けて表示。
// canRun の AND は videoEncoder && audioEncoder && h264Encode。
const CORE_KEYS: ReadonlyArray<keyof EnvCheck> = ['videoEncoder', 'audioEncoder', 'h264Encode'];
const OPTIONAL_KEYS: ReadonlyArray<keyof EnvCheck> = [
  'hevcEncode',
  'webShareFiles',
  'wakeLock',
  'opfs',
  'persistentStorage',
];

export default function UnsupportedScreen({ envCheck }: Props) {
  const t = useT();

  const missingCore = CORE_KEYS.filter((k) => !envCheck[k]).map((k) => ({
    key: k,
    label: t(`unsupported.feature.${k}`),
  }));
  const missingOptional = OPTIONAL_KEYS.filter((k) => !envCheck[k]).map((k) => ({
    key: k,
    label: t(`unsupported.feature.${k}`),
  }));

  return (
    <main
      className="app flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] px-6 text-center text-[var(--label)]"
      role="alert"
    >
      <h1 className="title text-2xl font-bold leading-tight sm:text-3xl">
        {t('unsupported.title')}
      </h1>
      <p className="mt-4 max-w-md text-sm text-[var(--label-secondary)]">
        {t('unsupported.body')}
      </p>

      {missingCore.length > 0 && (
        <section className="mt-8 max-w-md text-left text-sm">
          <h2 className="font-semibold text-[var(--label)]">{t('unsupported.coreHeading')}</h2>
          <ul className="mt-2 list-disc pl-6 text-[var(--label-secondary)]">
            {missingCore.map(({ key, label }) => (
              <li key={key}>{label}</li>
            ))}
          </ul>
        </section>
      )}

      {missingOptional.length > 0 && (
        <details className="mt-6 max-w-md text-left text-sm text-[var(--label-tertiary)]">
          <summary className="cursor-pointer">{t('unsupported.detailsSummary')}</summary>
          <p className="mt-2">{t('unsupported.optionalHeading')}</p>
          <ul className="mt-1 list-disc pl-6">
            {missingOptional.map(({ key, label }) => (
              <li key={key}>{label}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
