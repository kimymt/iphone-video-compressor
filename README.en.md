# Video Compressor — iPhone Video Compressor

[日本語](./README.md) | **English** | [简体中文](./README.zh-CN.md) | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md)

A web app that compresses videos shot on iPhone — all processing happens on your iPhone, nothing is uploaded to a server.

🔗 **https://ivc.mymt.casa**

---

## Supported devices

- **iPhone with iOS 26 or later** (Safari)
- iOS 25 or earlier is technically not supported (a dedicated screen will notify you at launch)

> Why iOS 26 only?
> The `AudioEncoder` API needed to re-encode video audio on iPhone first became available in iOS 26.

## Supported languages

- Japanese / English / Simplified Chinese / Traditional Chinese / Korean (5 languages)
- Auto-switches based on iPhone language settings (Settings → General → Language & Region)
- Can also be manually selected from the in-app Settings sheet (gear icon at top right)

---

## How to use

### 1. Add to Home Screen (one-time setup)

1. Open https://ivc.mymt.casa in **Safari** on your iPhone
2. Tap the share button (□↑) at the bottom
3. Select **"Add to Home Screen"** from the menu
4. Launch from the home screen icon

> You can also use the app directly from a Safari tab, but launching from the home screen runs it in full-screen mode and provides more stable processing behaviour.

### 2. Compress videos

1. Tap **"Select Video"** to pick a video from your Photo Library
   - Multiple selection is supported — videos are added to the queue and processed sequentially.
2. Compression starts automatically
   - A progress bar and estimated time remaining are displayed.
3. When done, tap **"Share"**
   - You can save to the Photos library, send via AirDrop / Messages / Mail, save to the Files app, and more.

### 3. Presets (balancing quality and compression)

Open the settings sheet via the **gear icon** at the top right to switch presets. The default is **"Standard (HEVC)"**.

| Preset | Use case |
|---|---|
| Best Quality (HEVC) | Archive as editing source material |
| High Quality (HEVC) | Show on TVs or PCs at high quality |
| **Standard (HEVC)** ★ Default | Everyday use, save storage |
| Light (HEVC) | Paste into LINE / Slack |
| Compatible (H.264) | Send to Android or older PCs |
| Smallest (H.264) | Attach to email |

> On devices without HEVC encoding support, only H.264 presets are shown.

---

## Common troubleshooting

### The completion chime doesn't play

Check the physical switch and volume on the side of your iPhone.

1. **Flip the Ring/Silent switch to "Ring"** (the orange indicator should not be visible)
2. Turn up the volume
3. **Tap the "Select Video" button at least once** before starting to process

> Due to iOS behaviour, web apps cannot play sound while in Silent mode (no workaround possible from the app side). Audio playback also requires at least one user tap on the screen (the first tap acts as permission to play sound).

### The screen dims during processing

Check the badge at the top-right of the header.

- **"Screen On"** (sun icon, orange) → Screen lock prevention is active. No issue.
- **"Screen On Failed"** (warning icon, red) → Screen lock prevention could not be acquired. The error name is displayed; a screenshot would help us improve.

> Even for 3–5 minute long videos, processing will complete as long as the "Screen On" badge remains.

### "Not enough storage" appears

Compression requires **at least 2.5× the input video size** of free storage.

- Free up space via **Settings → General → iPhone Storage**.
- Inside the app, completed videos can be removed via the trash icon after saving them to the Photos library.

### "This video cannot be processed" appears

The video file may be corrupted, or use an unsupported codec.

- Videos recorded with **iPhone Settings → Camera → Formats set to "High Efficiency"** process most smoothly.
- Videos recorded with "Most Compatible" can also be processed, but file sizes are larger.

---

## Privacy

- **Your videos never leave your iPhone.**
- All processing is completed within Safari on your iPhone.
- No server uploads, logs, authentication, or user tracking exist.
- Output videos do not contain EXIF or **location data** (automatically stripped for privacy).

The service itself consists of static files (HTML / JavaScript) served from Cloudflare Pages — no API exists that accepts video data.

---

## Updates

When launched from the home screen, the app updates automatically if a new version is available.

If a new feature does not appear, long-press the home screen icon → "Remove" → open in Safari again → re-add to home screen (a reliable workaround for stale caches).

---

## Known limitations

- **iPad landscape / large-screen layout**: Not supported
- **Output over 1GB**: Switches automatically to download format (iOS share menu often fails at this size)
- **Editing / ComparePreview**: Not provided (focused on compression)
- **Mid-stream resume**: If the app is killed during processing, it restarts from the beginning

---

## Feedback

Report bugs and feature requests on GitHub Issues:

🐛 https://github.com/kimymt/iphone-video-compressor/issues

For device-specific issues, including the iOS version (Settings → General → About) and a screenshot of any error helps a lot.

---

<details>
<summary>Developer info</summary>

Source: https://github.com/kimymt/iphone-video-compressor

For technical specifications and implementation phases, see [CLAUDE.md](./CLAUDE.md); for pending items, see [TODOS.md](./TODOS.md).

### Tech stack

Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS + Zustand + WebCodecs API + mediabunny + OPFS + IndexedDB + vite-plugin-pwa.

### Local development

```bash
npm install
npm run dev           # http://localhost:5173 (Service Worker is also active in dev)
npm run build         # tsc -b + vite build
npm run preview       # vite preview → http://localhost:4173
```

### Testing

```bash
npm test                    # Vitest (unit)
npm run test:e2e            # Playwright (against dev server)
npm run test:e2e:offline    # build + preview for offline verification
```

### Real-device testing on iPhone

Use Cloudflare Tunnel to get an HTTPS URL, then open it on iPhone Safari.

```bash
# Terminal A
npm run dev
# Terminal B
cloudflared tunnel --url http://localhost:5173
# → open the printed xxx.trycloudflare.com on iPhone Safari
```

Vite 5.4.12+ requires `server.allowedHosts` in `vite.config.ts` to include `.trycloudflare.com`.

### Deployment

Pushing to `main` triggers an automatic build & deploy on Cloudflare Pages.

- Production: https://ivc.mymt.casa
- Alternate URL (same build): https://iphone-video-compressor.pages.dev
- Build command: `npm run build` / Build output: `dist` / Framework preset: None
- Preview Deployments are auto-generated for each Pull Request

### Test fixture regeneration

The videos in `tests/fixtures/` are committed. If regeneration is needed, use ffmpeg with your own source material (see `tests/fixtures/README.md`).

```bash
ffmpeg -i source-portrait.mov -t 1 -b:v 500k -c:v hevc_videotoolbox -tag:v hvc1 \
  tests/fixtures/portrait-rotation-1s.mov

ffmpeg -i source.mov -t 1 -vf scale=1920:1080 -c:v libx264 -profile:v baseline \
  -b:v 800k tests/fixtures/landscape-1080p-baseline-h264-1s.mp4

ffmpeg -i source-hdr.mov -t 1 -c:v hevc_videotoolbox -tag:v hvc1 \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc \
  tests/fixtures/landscape-hevc-hdr-1s.mov

head -c 30000 tests/fixtures/landscape-1080p-baseline-h264-1s.mp4 \
  > tests/fixtures/corrupt-truncated.mp4
```

### Icons

The 4 PNGs in `public/icons/` (192 / 512 / maskable / apple-touch-icon 180) are currently placeholders generated with ffmpeg (`#0a0a0a` background + `#0a84ff` centre block). Replace with designer-made assets before release.

</details>

---

## License

[MIT License](./LICENSE) — Copyright (c) 2026 kimymt
