// Phase 5: 完了チャイム生成。
// CLAUDE.md「主要モジュール仕様」では done.m4a を `<audio>` 経由で再生する想定だが、
// バイナリ素材を持たないで済むよう WebAudio API で軽い 2 音チャイムを合成する。
// FilePicker タップ時の audio unlock (Phase 2) で AudioContext が unlock 済みの前提。
//
// iOS は新規 AudioContext の作成にもユーザージェスチャーを要求する場合があるため、
// 失敗時は静かに諦める (例外は握り潰す)。

type AudioContextCtor = new () => AudioContext;

let audioCtorOverride: AudioContextCtor | null = null;

/** テスト用: AudioContext コンストラクタを差し替える。null でリセット。 */
export function _setAudioContextCtorForTest(ctor: AudioContextCtor | null): void {
  audioCtorOverride = ctor;
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
 * 完了時に呼ぶ。AudioContext が無い / 拒否された場合は無音で no-op。
 * 700ms 後に AudioContext を close してリソースを解放する。
 */
export async function playDoneSound(): Promise<void> {
  const Ctx = getAudioContextCtor();
  if (!Ctx) return;

  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return;
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    playChime(ctx);
  } catch {
    await closeQuiet(ctx);
    return;
  }

  // 鳴り切ったあとに AudioContext を close (700ms = チャイム長 450ms + 余裕)
  setTimeout(() => {
    void closeQuiet(ctx);
  }, 700);
}

async function closeQuiet(ctx: AudioContext): Promise<void> {
  try {
    await ctx.close();
  } catch {
    /* noop */
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
