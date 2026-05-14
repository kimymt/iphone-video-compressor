// Phase 5: Screen Wake Lock 管理クラス。
// CLAUDE.md「主要モジュール仕様 > src/platform/wakeLock.ts」を反映。
//
// 挙動:
// - acquire() で navigator.wakeLock.request('screen') を試行 + visibilitychange リスナーを設置
// - iOS Safari は visibility=hidden で wakeLock を自動 release する
// - visibility=visible に戻ったとき wantAcquired=true なら再取得を試みる
// - release() で wantAcquired=false にしてリスナーを外し lock を解放
//
// テスト用に WakeLockApiLike / Document を constructor で注入できる。
// 本番は引数なしで navigator.wakeLock + document を読む singleton を使う。

export interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

export interface WakeLockApiLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

export interface WakeLockOptions {
  wakeLockApi?: WakeLockApiLike | null;
  doc?: Document | null;
}

export class WakeLockManager {
  private lock: WakeLockSentinelLike | null = null;
  private wantAcquired = false;
  private visibilityHandler: (() => void) | null = null;
  private wakeLockApi: WakeLockApiLike | null;
  private doc: Document | null;

  constructor(opts: WakeLockOptions = {}) {
    this.wakeLockApi =
      opts.wakeLockApi !== undefined
        ? opts.wakeLockApi
        : readDefaultWakeLock();
    this.doc = opts.doc !== undefined ? opts.doc : readDefaultDocument();
  }

  /**
   * Wake lock を取得し、以降 visibility=visible に戻る度に再取得する状態にする。
   * 既に取得済みなら no-op (visibility リスナーは多重設置しない)。
   * 失敗時は wantAcquired=true のままだが lock=null。次の visibilitychange で再挑戦する。
   */
  async acquire(): Promise<void> {
    this.wantAcquired = true;
    this.installVisibilityHandler();
    await this.requestLock();
  }

  /**
   * Wake lock を解放し、visibilitychange リスナーを外す。
   * acquire 中 (Promise が解決していない) でも次の requestLock は wantAcquired=false を見て
   * 即座に lock を release する。
   */
  async release(): Promise<void> {
    this.wantAcquired = false;
    this.removeVisibilityHandler();
    const lock = this.lock;
    this.lock = null;
    if (lock && !lock.released) {
      try {
        await lock.release();
      } catch {
        /* 既に解放済み等は無視 */
      }
    }
  }

  /** 現在 wake lock を保持しているか (released=true は false 扱い)。 */
  isActive(): boolean {
    return this.lock !== null && !this.lock.released;
  }

  /** 内部状態を覗くテスト補助。プロダクションコードからは使わない。 */
  _debugState(): { wantAcquired: boolean; hasLock: boolean; hasHandler: boolean } {
    return {
      wantAcquired: this.wantAcquired,
      hasLock: this.lock !== null && !this.lock.released,
      hasHandler: this.visibilityHandler !== null,
    };
  }

  private async requestLock(): Promise<void> {
    if (!this.wakeLockApi) return;
    if (this.lock && !this.lock.released) return;

    let lock: WakeLockSentinelLike;
    try {
      lock = await this.wakeLockApi.request('screen');
    } catch {
      // permission denied / 未対応 → 静かに諦める
      return;
    }

    if (!this.wantAcquired) {
      // request 中に release() が走っていた。即座に解放。
      await lock.release().catch(() => {});
      return;
    }

    this.lock = lock;
    lock.addEventListener('release', () => {
      // システム (例えば iOS の visibility=hidden) が解放した
      if (this.lock === lock) this.lock = null;
      // wantAcquired のままなら visibilitychange が再取得を試みる
    });
  }

  private installVisibilityHandler(): void {
    if (this.visibilityHandler || !this.doc) return;
    const doc = this.doc;
    this.visibilityHandler = () => {
      if (doc.visibilityState === 'visible' && this.wantAcquired) {
        void this.requestLock();
      }
    };
    doc.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private removeVisibilityHandler(): void {
    if (this.visibilityHandler && this.doc) {
      this.doc.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    this.visibilityHandler = null;
  }
}

function readDefaultWakeLock(): WakeLockApiLike | null {
  if (typeof navigator === 'undefined') return null;
  const n = navigator as { wakeLock?: WakeLockApiLike };
  return n.wakeLock ?? null;
}

function readDefaultDocument(): Document | null {
  if (typeof document === 'undefined') return null;
  return document;
}

/** モジュール singleton。App.tsx から acquire/release が呼ばれる。 */
export const wakeLockManager = new WakeLockManager();
