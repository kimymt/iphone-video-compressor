// Phase 6: Service Worker 登録の薄いラッパ。
// VitePWA の `virtual:pwa-register` から登録関数を受け取り、
// onOfflineReady / onNeedRefresh を UI に橋渡しする。
//
// registerType='autoUpdate' なので SW 自動更新を前提とする。
// アプリ進行中のジョブ中断回避は V2 (TODOS.md「V2: 自動アップデート時の進行中ジョブ復旧」)。

/** VitePWA の registerSW と同形のシグネチャ。テスト時に mock を渡せるよう型を切り出す。 */
export type RegisterSWFn = (options: {
  immediate?: boolean;
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
  onRegistered?: (reg: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (err: unknown) => void;
}) => (reload?: boolean) => Promise<void>;

export interface RegisterAppSWOptions {
  /** SW のアップデート待機が発生したとき (registerType=prompt のみ実質発火)。 */
  onNeedRefresh?: () => void;
  /** 初回 install + activate が完了し、オフラインで動かせる状態になったとき。 */
  onOfflineReady?: () => void;
  /** SW 登録エラー (HTTPS 要件 / iframe 内 / 非対応ブラウザなど)。 */
  onError?: (err: unknown) => void;
}

/**
 * アプリ用に SW を登録する。
 * 戻り値は VitePWA の updateSW 関数 (reload=true で即時反映)。
 *
 * 引数 registerSW は VitePWA の `virtual:pwa-register` から渡される。
 * Vitest では `virtual:` 解決ができないため mock を渡す。
 */
export function registerAppServiceWorker(
  registerSW: RegisterSWFn,
  opts: RegisterAppSWOptions = {},
): (reload?: boolean) => Promise<void> {
  return registerSW({
    immediate: true,
    onNeedRefresh: opts.onNeedRefresh,
    onOfflineReady: opts.onOfflineReady,
    onRegisterError: (err) => {
      // 失敗は致命的でない (HTTPS でないとき / ITP 厳格時など)。
      // eslint-disable-next-line no-console
      console.warn('Service Worker 登録に失敗:', err);
      opts.onError?.(err);
    },
  });
}
