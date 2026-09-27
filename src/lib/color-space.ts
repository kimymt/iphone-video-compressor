/** 色域と伝達特性は独立。BT.2020 の SDR 素材も存在する。 */
export function isBt2020Primaries(colorSpace: VideoColorSpaceInit | null | undefined): boolean {
  return (colorSpace?.primaries as string | null | undefined) === 'bt2020';
}

export function isHdrTransfer(colorSpace: VideoColorSpaceInit | null | undefined): boolean {
  const transfer = colorSpace?.transfer as string | null | undefined;
  return transfer === 'pq' || transfer === 'hlg';
}

/** HDRのトーンマッピングと広色域SDRの色域変換は同じCanvas経路を使う。 */
export function needsSdrConversion(colorSpace: VideoColorSpaceInit | null | undefined): boolean {
  return isHdrTransfer(colorSpace) || isBt2020Primaries(colorSpace)
    || (colorSpace?.primaries as string | undefined) === 'smpte432';
}
