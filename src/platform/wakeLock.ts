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

export type WakeLockChangeListener = (active: boolean) => void;

/** 直近の WakeLock request 失敗を診断用に保持するための型。 */
export interface WakeLockError {
  /** DOMException.name (例: 'NotAllowedError' / 'NotSupportedError') もしくは独自タグ。 */
  name: string;
  /** ユーザ向け文言。詳細不明なら空でもよい。 */
  message: string;
}

export class WakeLockManager {
  private lock: WakeLockSentinelLike | null = null;
  private wantAcquired = false;
  private visibilityHandler: (() => void) | null = null;
  private wakeLockApi: WakeLockApiLike | null;
  private doc: Document | null;
  private listeners = new Set<WakeLockChangeListener>();
  /** 直近の request 失敗の原因。診断 UI から参照する。 */
  private lastError: WakeLockError | null = null;

  constructor(opts: WakeLockOptions = {}) {
    this.wakeLockApi =
      opts.wakeLockApi !== undefined
        ? opts.wakeLockApi
        : readDefaultWakeLock();
    this.doc = opts.doc !== undefined ? opts.doc : readDefaultDocument();
  }

  /**
   * lock 状態変化を購読する。
   * - acquire 成功時 (lock セット直後): listener(true)
   * - システム解除 (visibility=hidden 等): listener(false)
   * - visibility=visible での再取得成功: listener(true)
   * - 明示的 release(): listener(false)
   * 戻り値は unsubscribe 関数。
   * 購読時点の状態を即座に通知することはしない (React 側で `useState(() => isActive())` で初期化する)。
   */
  onChange(listener: WakeLockChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const active = this.isActive();
    for (const l of this.listeners) {
      try {
        l(active);
      } catch {
        /* listener 側の例外は無視 */
      }
    }
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
    this.lastError = null;
    const hadLock = this.lock !== null;
    const lock = this.lock;
    this.lock = null;
    if (lock && !lock.released) {
      try {
        await lock.release();
      } catch {
        /* 既に解放済み等は無視 */
      }
    }
    if (hadLock) this.notify();
  }

  /** 現在 wake lock を保持しているか (released=true は false 扱い)。 */
  isActive(): boolean {
    return this.lock !== null && !this.lock.released;
  }

  /** 直近の request 失敗を返す (取得成功後は null)。 */
  getLastError(): WakeLockError | null {
    return this.lastError;
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
    if (!this.wakeLockApi) {
      this.lastError = {
        name: 'NotSupported',
        message: 'navigator.wakeLock が利用できません',
      };
      // active 自体は変わらないが Indicator が lastError を再読み込みできるよう通知。
      this.notify();
      return;
    }
    if (this.lock && !this.lock.released) return;

    let lock: WakeLockSentinelLike;
    try {
      lock = await this.wakeLockApi.request('screen');
    } catch (err) {
      // 典型例: NotAllowedError (user gesture 期限切れ等)、SecurityError (HTTPS でない等)
      this.lastError = {
        name: err instanceof Error ? err.name : 'UnknownError',
        message: err instanceof Error ? err.message : String(err),
      };
      this.notify();
      return;
    }

    if (!this.wantAcquired) {
      // request 中に release() が走っていた。即座に解放。
      await lock.release().catch(() => {});
      return;
    }

    this.lock = lock;
    this.lastError = null; // 取得成功でエラー履歴をクリア
    this.notify();
    lock.addEventListener('release', () => {
      // システム (例えば iOS の visibility=hidden) が解放した
      const wasOurLock = this.lock === lock;
      if (wasOurLock) this.lock = null;
      // wantAcquired のままなら visibilitychange が再取得を試みる
      if (wasOurLock) this.notify();
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
