# Synthetic iOS 27 regression fixtures

Generate with `python3 scripts/generate-ios27-fixtures.py` (local ffmpeg; no runtime dependency).

All sources are procedurally generated neutral ramps with visible frame numbers 00–59 and a 1 kHz audio track. No personal media is included.

| File | Expected decoded frames | Meaning |
|---|---:|---|
| sdr-bframes.mp4 | 60 | H.264, B-frames, BT.709 |
| sdr-hevc.mp4 | 60 | HEVC SDR |
| hlg.mp4 | 60 | 10-bit HEVC, BT.2020/HLG scene-linear ramp |
| pq.mp4 | 60 | 10-bit HEVC, BT.2020/PQ, 0–1000 nit ramp |
| vfr.mp4 | 45 | First second 30 fps, second second 15 fps |
| portrait.mp4 | 60 | SDR with a 90-degree rotation tag |

HDR samples apply the transfer function to the generated linear ramp before encoding; they are not SDR bytes relabeled as HDR. Neutral ramps test luminance, not full-gamut hue accuracy. Additional real iPhone HLG/PQ clips with skin tones and saturated colors are required for device acceptance. The continuous tone permits listening checks but is not a precise lip-sync reference; use a real clap/lip-sync clip for that check.
