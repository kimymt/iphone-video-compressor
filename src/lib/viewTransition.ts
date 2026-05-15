// V2: View Transitions API ラッパー。
//
// `document.startViewTransition(callback)` は iOS 26 Safari / Chrome 111+ /
// Safari 18+ で利用可能。Firefox 等の未対応ブラウザ + Reduced Motion 設定では
// callback を即時実行して fallback する。
//
// 用途: queueStore の add / remove / retry / clearCompleted の state mutation を
// この関数でラップすることで、リストの挿入・削除・並び替えが滑らかにアニメする。
// 各 QueueItem に `view-transition-name: queue-item-{id}` を付けると、
// ブラウザが旧・新の snapshot を比較して per-item の morph を行う。
//
// CLAUDE.md「ハマりどころ 6」: startViewTransition 未定義の可能性。MVP では
// 使用しないと方針したが、V2 で polish として導入。

/** ViewTransition インターフェースの構造的型定義 (TS 5.6 の DOM lib に依存しないため)。 */
export interface ViewTransitionLike {
  finished: Promise<void>;
  ready: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition: () => void;
}

// TS 5.6 の lib.dom.d.ts には ViewTransition が定義されているが、戻り値の互換性
// (こちらは Promise<void>、lib は Promise<undefined>) で型衝突するので
// Document を extend せず、structural 型で別途宣言する。
interface DocumentWithVT {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransitionLike;
}

/** matchMedia 安全呼び出し (jsdom 等で未実装の場合に false を返す)。 */
function prefersReducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * View Transition を発火させて DOM 変更を smooth にアニメする。
 *
 * - API 不在 (Firefox 等) → callback を即時実行
 * - Reduced Motion ON → callback を即時実行 (アニメをスキップ)
 * - それ以外 → `document.startViewTransition(callback)` を呼び、
 *   `updateCallbackDone` (DOM 更新完了) で resolve する Promise を返す
 *
 * `finished` ではなく `updateCallbackDone` を待つので、アニメ完了を待たずに
 * 呼び出し側の処理が進む (アニメは裏で再生される)。
 *
 * @param callback DOM 変更を行う関数。同期 or async どちらでも可。
 * @returns 状態変更完了時に resolve する Promise (アニメ完了は待たない)。
 */
export function withViewTransition(callback: () => void | Promise<void>): Promise<void> {
  // SSR / Node 環境
  if (typeof document === 'undefined') {
    return Promise.resolve(callback() as Promise<void> | void).then(() => undefined);
  }
  const doc = document as unknown as DocumentWithVT;
  // API 不在 or Reduced Motion → 即時実行
  if (typeof doc.startViewTransition !== 'function' || prefersReducedMotion()) {
    return Promise.resolve(callback() as Promise<void> | void).then(() => undefined);
  }
  // View Transition 発火
  const transition = doc.startViewTransition(callback);
  // updateCallbackDone: DOM 更新が完了したら resolve (アニメ完了を待たない)
  // 例外は飲み込んで undefined を返す (UI 表示が止まらないように)
  return transition.updateCallbackDone.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * View Transitions API が現在の環境で利用可能か (Reduced Motion を含めて) を判定。
 * テストや UI からの可用性チェックに使う。
 */
export function isViewTransitionAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as unknown as DocumentWithVT;
  return typeof doc.startViewTransition === 'function' && !prefersReducedMotion();
}
