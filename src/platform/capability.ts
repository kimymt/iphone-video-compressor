import type { EnvCheck } from '../lib/types';
import { buildHevcCodecString, h264HighCodecString } from '../lib/presets';

export const DEV_OVERRIDE_QUERY_PARAM = 'dev';
export const DEV_OVERRIDE_VALUE = '1';

// テスト用: import.meta.env の差し替え (vitest では DEV が常に true で
// vi.stubEnv でも上書きできないため、本番ビルド相当の検証に使う)。
let envOverrideForTest: Record<string, unknown> | null = null;

/** テスト用: ビルド環境フラグを差し替える。null でリセット (実際の import.meta.env)。 */
export function _setEnvForTest(env: Record<string, unknown> | null): void {
  envOverrideForTest = env;
}

/**
 * dev override をビルドとして許可するか。
 * - dev サーバー (`npm run dev` / vitest): import.meta.env.DEV === true
 * - E2E preview ビルド: `VITE_ALLOW_DEV_OVERRIDE=1 npm run build` で明示オプトイン
 *   (playwright.preview.config.ts が使用)
 * 本番ビルド (Cloudflare Pages の素の `npm run build`) ではどちらも満たさないため、
 * `?dev=1` を付けても capability 強制や E2E 用 store 露出は発動しない。
 */
function devOverrideAllowedInBuild(): boolean {
  const env =
    envOverrideForTest ?? (import.meta as { env?: Record<string, unknown> }).env;
  if (!env) return false;
  return env.DEV === true || env.VITE_ALLOW_DEV_OVERRIDE === '1';
}

/**
 * `?dev=1` クエリで全 capability を true に強制。
 * macOS Safari や Chrome での開発確認用。
 * dev override は capability の値だけを変更し、Service Worker や OPFS の
 * 実際の API 呼び出しはそのまま挙動する。
 * 本番ビルドでは devOverrideAllowedInBuild() が false のため常に無効
 * (旧実装はクエリのみで判定しており、本番 URL に ?dev=1 を付けると
 * 非対応ブラウザでも canRun=true になり未定義 API 呼び出しでクラッシュし得た)。
 */
export function isDevOverrideActive(): boolean {
  if (!devOverrideAllowedInBuild()) return false;
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(DEV_OVERRIDE_QUERY_PARAM) === DEV_OVERRIDE_VALUE;
  } catch {
    return false;
  }
}

/**
 * VideoEncoder.isConfigSupported を例外安全に呼び出す。
 * 引数: codec string、 1920x1080 @ 30fps、 5Mbps。
 */
async function probeVideoEncoder(codec: string): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const result = await VideoEncoder.isConfigSupported({
      codec,
      width: 1920,
      height: 1080,
      bitrate: 5_000_000,
      framerate: 30,
    });
    return result.supported === true;
  } catch {
    // 不正な codec string や、ブラウザの内部例外をすべて false に倒す。
    return false;
  }
}

/**
 * 起動時の capability check。
 * iOS 26 Safari の必須 API 一覧と、HEVC / H.264 エンコード可否を検査する。
 *
 * `canRun = videoEncoder && audioEncoder && h264Encode`
 * （HEVC は必須ではない、利用不可なら getAvailablePresets で H.264 のみに絞る）
 */
export async function verifyEnvironment(): Promise<EnvCheck> {
  if (isDevOverrideActive()) {
    return {
      videoEncoder: true,
      audioEncoder: true,
      webShareFiles: true,
      wakeLock: true,
      opfs: true,
      persistentStorage: true,
      hevcEncode: true,
      h264Encode: true,
      canRun: true,
    };
  }

  // TypeScript 5.6 の DOM lib には AudioEncoder の宣言が無い場合があるため
  // globalThis 経由でランタイム存在チェックする（any を避ける）。
  const videoEncoder = typeof VideoEncoder !== 'undefined';
  const audioEncoder = 'AudioEncoder' in globalThis;

  const webShareFiles =
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  const wakeLock = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const opfs =
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function';

  const persistentStorage =
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.persist === 'function';

  const hevcEncode = videoEncoder
    ? await probeVideoEncoder(buildHevcCodecString(1920, 30))
    : false;
  const h264Encode = videoEncoder ? await probeVideoEncoder(h264HighCodecString()) : false;

  const canRun = videoEncoder && audioEncoder && h264Encode;

  return {
    videoEncoder,
    audioEncoder,
    webShareFiles,
    wakeLock,
    opfs,
    persistentStorage,
    hevcEncode,
    h264Encode,
    canRun,
  };
}
