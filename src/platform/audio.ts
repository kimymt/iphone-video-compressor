// Phase 5 + Phase 7 polish: audio unlock と完了チャイム。
// CLAUDE.md「主要モジュール仕様」では done.m4a を `<audio>` 経由で再生する想定だが、
// バイナリ素材を持たないで済むよう WebAudio API で軽い 2 音チャイムを合成する。
//
// iOS Safari の制約:
// 1. AudioContext は最初のユーザージェスチャー (タップ等) で resume されるまでサスペンド
// 2. unlock は AudioContext インスタンス単位。新規 ctx を作ると再度 unlock が必要
// 3. iPhone のサイレントスイッチ ON では WebAudio も無音になる (アプリ側で override 不可)
//
// 対策: モジュールスコープで AudioContext を 1 個だけ持つ (`sharedCtx`)。
// FilePicker タップ時の `unlockAudio()` が初期化 + resume + 無音サンプル再生。
// 完了時の `playDoneSound()` は同じ ctx に oscillator を繋いで鳴らす。
// 別々のインスタンスを作っていた v0.9.0 では実機で鳴らないケースが報告された。

type AudioContextCtor = new () => AudioContext;

let audioCtorOverride: AudioContextCtor | null = null;
let sharedCtx: AudioContext | null = null;

/** テスト用: AudioContext コンストラクタを差し替える。null でリセット + 共有 ctx も破棄。 */
export function _setAudioContextCtorForTest(ctor: AudioContextCtor | null): void {
  audioCtorOverride = ctor;
  sharedCtx = null;
}

/** テスト用: 共有 AudioContext だけリセット (コンストラクタは残す)。 */
export function _resetSharedAudioCtxForTest(): void {
  if (sharedCtx) {
    try {
      void sharedCtx.close();
    } catch {
      /* noop */
    }
  }
  sharedCtx = null;
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (audioCtorOverride) return audioCtorOverride;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * 共有 AudioContext を取得 (初回呼び出しで生成)。生成自体は user gesture 不要だが、
 * `state === 'suspended'` のまま帰ることがある。呼び出し側で `resume()` する。
 */
function getOrCreateSharedCtx(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  const Ctx = getAudioContextCtor();
  if (!Ctx) return null;
  try {
    sharedCtx = new Ctx();
  } catch {
    sharedCtx = null;
  }
  return sharedCtx;
}

/**
 * iOS Safari の audio unlock。FilePicker タップ等のユーザージェスチャーから呼ぶ。
 * 共有 AudioContext を生成 + resume + 1 サンプルの無音 BufferSource を再生して
 * 「サウンドアウトプット」をアクティブ化する。以降の `playDoneSound` は同じ ctx を使う。
 *
 * 失敗 (gesture 外 / 拒否 / Ctx 無し) は静かに諦める。
 */
export async function unlockAudio(): Promise<void> {
  const ctx = getOrCreateSharedCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* unlock 失敗は致命的でない。playDoneSound でも再度 resume 試行する。 */
  }
}

/**
 * 完了チャイムを再生する。共有 AudioContext を使い、suspended なら resume を試みる。
 * iPhone サイレントスイッチ ON では (resume 成功しても) 出力が無音になる。
 * 失敗時は無音で no-op。
 */
export async function playDoneSound(): Promise<void> {
  const ctx = getOrCreateSharedCtx();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') return; // gesture 外で resume 失敗 (返り値だけ running)
    playChime(ctx);
  } catch {
    /* チャイム失敗は致命的でない (リソース解放はアプリ teardown でまとめて行う) */
  }
}

/**
 * 2 音重ねの "ピロン" 風チャイム。A5 + E6 を約 450ms で減衰。
 * 音量は -15dBFS 程度 (gain=0.18) を上限に envelope で減衰させる。
 */
function playChime(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const duration = 0.45;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
  // 0 への ramp は exponentialRampToValueAtTime に渡せないので 0.001 まで
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = 880; // A5
  o1.connect(gain);
  o1.start(now);
  o1.stop(now + duration);

  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 1318.5; // E6 (完全 5 度上)
  o2.connect(gain);
  o2.start(now + 0.07);
  o2.stop(now + duration);
}
