// Vitest セットアップ: @testing-library/jest-dom の matcher を Vitest 用に拡張。
import '@testing-library/jest-dom/vitest';

// V2: jsdom (v25 時点) の Blob/File は `arrayBuffer()` / `stream()` が未実装。
// 本番 (iOS Safari 14+) では native 実装があるが、テストでは FileReader 経由で polyfill。
// queueStore.shareAllDone が share 前に arrayBuffer で memory buffer する race fix で必要。
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Blob.prototype as any).arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          reject(new Error('FileReader returned non-ArrayBuffer'));
        }
      };
      reader.onerror = (): void => reject(reader.error);
      reader.readAsArrayBuffer(this as Blob);
    });
  };
}
