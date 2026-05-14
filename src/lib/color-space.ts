// WebCodecs の colorSpace 関連は TypeScript の lib.dom.d.ts (5.x) が
// 実ブラウザの実装より古い値しか持たないため、'bt2020' / 'pq' / 'hlg' /
// 'bt2020-ncl' などが型に含まれない。実ランタイムでは正しく返るので、
// HDR 判定は文字列比較に下げて評価する。

/**
 * VideoColorSpaceInit が HDR (BT.2020 PQ もしくは HLG) かを判定する。
 * primaries だけ見れば十分 (iPhone 12+ の HDR 録画は必ず primaries=bt2020)。
 *
 * lib.dom.d.ts: `VideoColorPrimaries = "bt470bg" | "bt709" | "smpte170m"` (古い)
 * 実ブラウザ:    上記に加えて 'bt2020' / 'smpte240m' / 'srgb' / 'linear' も返る
 */
export function isBt2020Primaries(
  colorSpace: VideoColorSpaceInit | null | undefined,
): boolean {
  return (colorSpace?.primaries as string | null | undefined) === 'bt2020';
}
