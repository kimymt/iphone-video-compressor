// ストレージ情報と Persistent Storage 要求。
// 仕様書 src/platform/storage.ts。

export type StorageInfo = {
  usage: number;
  quota: number;
  available: number;
};

/**
 * navigator.storage.persist() で永続化を要求。
 * iOS では PWA インストール後にしか true を返さないことがある。
 * 失敗時は false を返し、UI で「データが消える可能性」を案内する。
 */
export async function ensurePersistent(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * StorageEstimate から usage/quota/available を取り出す。
 * available = quota - usage。マイナスは 0 にクランプ。
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, available: 0 };
  }
  try {
    const est = await navigator.storage.estimate();
    const usage = est.usage ?? 0;
    const quota = est.quota ?? 0;
    const available = Math.max(0, quota - usage);
    return { usage, quota, available };
  } catch {
    return { usage: 0, quota: 0, available: 0 };
  }
}

/**
 * 入力サイズの 2.5 倍が available より小さいか。
 * 中間バッファ + 出力で入力サイズの 3 倍を一時占有する可能性があるため、
 * 安全マージンを取って 2.5 倍を境界とする。
 *
 * quota が取得不能 (=0) なら true を返す
 * （storage API 非対応端末でも処理は試行させる）。
 */
export async function hasEnoughQuota(inputSize: number): Promise<boolean> {
  const info = await getStorageInfo();
  if (info.quota === 0) return true;
  return inputSize * 2.5 < info.available;
}
