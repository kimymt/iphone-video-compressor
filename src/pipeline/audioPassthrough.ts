// V2.x (C1): 音声 re-encode の pass-through 判定。
//
// 入力動画の音声トラックが (1) iPhone 標準の AAC-LC で、(2) 既に target 以下の
// bitrate であれば、`AudioDecoder → AudioEncoder` の往復を完全にスキップして
// `EncodedPacket` を mediabunny の `EncodedAudioPacketSource` に直接渡す。
//
// メリット:
// - **時間**: 5min 動画で 1〜3 秒短縮 (decode + encode の両方を省略)
// - **品質**: 元音声を再量子化しないので generation loss なし (むしろ向上)
// - **CPU**: AudioEncoder の負荷ゼロで video 並列 encode の余地が増える
//
// 不利益とその緩和 (詳細は 2026-05-16 のディスカッション参照):
// - 「圧縮した」期待への裏切り → min-h264 プリセットでは無効化
// - bitrate 検出の精度問題 → 保守的閾値 (target × 0.85) で誤判定を防ぐ
// - AV 同期ドリフト → 入力 timestamp をそのまま使う (passthrough は再量子化なし、
//   re-encode より同期精度が高い)
// - コーデック / sample rate / チャンネル不一致 → 厳格な事前チェック、外れたら fallback
// - mediabunny の sample pass-through 対応 → `EncodedAudioPacketSource.add(packet, meta)`
//   で API レベル確認済 (2026-05-16 spike)
//
// CLAUDE.md ハマりどころ 15 (sample rate 44.1k/48k 混在) を踏襲。

import { EncodedPacketSink, type AudioCodec, type EncodedPacket } from 'mediabunny';
import type { AudioTrack, DemuxResult } from './demux';
import type { Preset } from '../lib/types';

/** passthrough を採用するかの判定結果。reason は ship 後の本番ログ調査用。 */
export type PassthroughDecision =
  | { passthrough: true; reason: 'compatible'; decoderConfig: AudioDecoderConfig; estimatedBitrate: number }
  | { passthrough: false; reason: string };

/** iPhone カメラで撮影される音声の典型値。これらを満たすケースのみ passthrough。 */
const ACCEPTED_SAMPLE_RATES = new Set<number>([44100, 48000]);
const ACCEPTED_AAC_CODEC = 'mp4a.40.2'; // AAC-LC (Low Complexity)
/** 入力 bitrate がこの倍率 × target を下回るときのみ passthrough。
 *  保守的に 0.85 (15% マージン)。VBR ピークがある場合の安全側。 */
const BITRATE_THRESHOLD_RATIO = 0.85;
/** bitrate 推定で読む packets 数。100 packets ≈ 2.3 秒 @ 44.1k AAC (1024 sample/frame)。 */
const BITRATE_ESTIMATE_PACKETS = 100;

/**
 * preset と入力音声から passthrough 可否を判定する。失敗時は理由付きで返す。
 *
 * 純粋関数に近いが I/O (mediabunny の demux API) を await するので async。
 * 副作用なし: 読み出した packets は返さない (audioPipeline 側で再度読み直す前提)。
 *
 * テストの観点:
 * - 各 fail 条件 (codec / sample rate / channels / bitrate / min-h264) を個別に検証
 * - 成功時に decoderConfig + estimatedBitrate を含むことを確認
 * - bitrate 推定の境界 (threshold ぴったり / 直前 / 直後) を検証
 */
export async function decideAudioPassthrough(
  dem: Pick<DemuxResult, 'audioTrack' | 'durationSec'>,
  preset: Preset,
): Promise<PassthroughDecision> {
  // [1] preset 側のオプトアウト: 「最小」プリセットは音声も再圧縮 (ユーザ期待を尊重)
  // CLAUDE.md 不利益議論 #2 「圧縮した期待への裏切り」への対策。
  if (preset.key === 'min-h264') {
    return { passthrough: false, reason: 'min-h264 preset re-encodes audio (size priority)' };
  }

  if (!dem.audioTrack) {
    return { passthrough: false, reason: 'no audio track' };
  }

  // [2] コーデック厳密チェック (mediabunny の 'aac' は AAC ファミリ全般を含む可能性、
  //     decoder config の `codec` フィールド (FourCC + profile) で AAC-LC のみに絞る)
  const codec: AudioCodec | null = await dem.audioTrack.getCodec();
  if (codec !== 'aac') {
    return { passthrough: false, reason: `unsupported codec: ${codec ?? 'unknown'}` };
  }

  const decoderConfig = await dem.audioTrack.getDecoderConfig();
  if (!decoderConfig) {
    return { passthrough: false, reason: 'no decoder config available' };
  }
  if (decoderConfig.codec !== ACCEPTED_AAC_CODEC) {
    return { passthrough: false, reason: `not AAC-LC: ${decoderConfig.codec}` };
  }
  // decoderConfig.description (codec private data = AudioSpecificConfig) が無いと
  // mediabunny が muxer で AAC ESDS box を組めない。Apple iPhone は常に含むが防御。
  if (!decoderConfig.description) {
    return { passthrough: false, reason: 'no AudioSpecificConfig (description) in decoder config' };
  }

  // [3] sample rate / channels
  const [sampleRate, channels] = await Promise.all([
    dem.audioTrack.getSampleRate(),
    dem.audioTrack.getNumberOfChannels(),
  ]);
  if (!ACCEPTED_SAMPLE_RATES.has(sampleRate)) {
    return { passthrough: false, reason: `unusual sample rate: ${sampleRate}` };
  }
  if (channels > 2) {
    return { passthrough: false, reason: `multi-channel (${channels}): downmix needed` };
  }

  // [4] bitrate 推定 + 閾値判定
  const estimatedBitrate = await estimateAudioBitrate(dem.audioTrack, dem.durationSec);
  if (estimatedBitrate <= 0) {
    return { passthrough: false, reason: 'could not estimate bitrate' };
  }
  const threshold = preset.audioBitrate * BITRATE_THRESHOLD_RATIO;
  if (estimatedBitrate > threshold) {
    return {
      passthrough: false,
      reason: `input ${Math.round(estimatedBitrate)}bps > threshold ${Math.round(threshold)}bps`,
    };
  }

  return {
    passthrough: true,
    reason: 'compatible',
    decoderConfig,
    estimatedBitrate,
  };
}

/**
 * 先頭 N packets を読んで合計バイト数を時間で割り、平均ビットレートを bps で返す。
 *
 * 失敗時 (packets 不在 / timestamp ≤ 0) は 0 を返し、呼び出し側で「推定不能」扱い。
 *
 * 注: VBR で先頭が low-activity (無音前奏) の場合は実値より低く推定される可能性がある。
 * これは passthrough を「採用しがち」に傾けるが、preset.audioBitrate × 0.85 の保守的
 * 閾値があるので、本来 fallback すべきケースで passthrough に倒れるリスクは限定的。
 */
export async function estimateAudioBitrate(
  track: AudioTrack,
  totalDurationSec: number,
): Promise<number> {
  // mediabunny の公開 API: `EncodedPacketSink` 経由で packets にアクセス。
  // `InputAudioTrack` 自体には packet 取得メソッドが公開されていない (backing API のみ)。
  const sink = new EncodedPacketSink(track);
  // metadataOnly: true で実 byte data を取得しないオプション。
  // byteLength は metadata-only でも保証されているので OK (mediabunny 仕様)。
  let packet: EncodedPacket | null = await sink.getFirstPacket({ metadataOnly: true });
  if (!packet) return 0;

  let totalBytes = 0;
  let lastPacketEndSec = 0;
  let count = 0;

  while (packet && count < BITRATE_ESTIMATE_PACKETS) {
    totalBytes += packet.byteLength;
    lastPacketEndSec = packet.timestamp + packet.duration;
    count++;
    packet = await sink.getNextPacket(packet, { metadataOnly: true });
  }

  // 全 track が BITRATE_ESTIMATE_PACKETS より短い場合は totalDurationSec を上限に
  const measuredSec = Math.min(lastPacketEndSec, totalDurationSec || lastPacketEndSec);
  if (measuredSec <= 0) return 0;
  return (totalBytes * 8) / measuredSec;
}
