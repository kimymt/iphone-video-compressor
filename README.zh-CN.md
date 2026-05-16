# 视频压缩 — iPhone Video Compressor

[日本語](./README.md) | [English](./README.en.md) | **简体中文** | [繁體中文](./README.zh-TW.md) | [한국어](./README.ko.md)

将 iPhone 拍摄的视频在 iPhone 内部完成压缩、不上传到服务器的应用。

🔗 **https://ivc.mymt.casa**

---

## 支持的设备

- **iOS 26 或更新版本的 iPhone** (Safari)
- iOS 25 及更早版本技术上无法运行 (启动时会显示专用画面提示)

> 为什么仅限 iOS 26？
> 在 iPhone 上重新编码视频音频所需的 `AudioEncoder` API 从 iOS 26 才开始可用。

## 支持的语言

- 日本語 / English / 简体中文 / 繁體中文 / 한국어 5 种语言
- 根据 iPhone 语言设置自动切换 (设置 → 通用 → 语言与地区)
- 也可在应用内设置 (右上角齿轮) 中手动选择语言

---

## 使用方法

### 1. 添加到主屏幕 (仅首次)

1. 在 iPhone 的 **Safari** 中打开 https://ivc.mymt.casa
2. 点击底部共享按钮 (□↑)
3. 从菜单中选择 **"添加到主屏幕"**
4. 从主屏幕图标启动

> 也可直接从 Safari 标签页使用,但从主屏幕启动会以全屏模式运行,处理过程更稳定。

### 2. 压缩视频

1. 点击 **"选择视频"** 按钮从照片库选择视频
   - 支持多选。所有视频会进入队列依次处理。
2. 自动开始压缩
   - 显示进度条与预计剩余时间。
3. 完成后点击 **"分享"**
   - 可选择保存到照片库、AirDrop、信息 / 邮件发送、保存到文件 App 等。

### 3. 预设 (画质与压缩率平衡)

通过标题栏右上方的 **齿轮图标** 打开设置面板切换预设。默认为 **"标准 (HEVC)"**。

| 预设 | 适用场景 |
|---|---|
| 最高画质 (HEVC) | 作为编辑原始素材保存 |
| 高画质 (HEVC) | 在电视或 PC 上完整观看 |
| **标准 (HEVC)** ★ 默认 | 日常使用,节省存储 |
| 轻量 (HEVC) | 粘贴到 LINE / Slack |
| 兼容优先 (H.264) | 发送给 Android 或旧版 PC |
| 最小 (H.264) | 附加到邮件 |

> 不支持 HEVC 编码的设备仅显示 H.264 系列预设。

---

## 常见问题

### 完成提示音不响

请检查 iPhone 本体侧面开关与音量。

1. **将 Ring/Silent 开关拨向 "Ring"** (橙色不可见的状态)
2. 调高音量
3. **开始处理前先点击一次 "选择视频" 按钮**

> 受 iOS 规范限制,静音模式下网页应用无法播放声音 (应用侧无法绕过)。此外,播放音频需要用户至少点击一次屏幕 (首次点击作为"允许播放声音"的授权)。

### 处理过程中屏幕变暗

请检查标题栏右上方的徽章。

- **"屏幕开启"** (太阳图标,橙色) → 防止屏幕锁定已激活。无问题。
- **"屏幕开启失败"** (警告图标,红色) → 获取防止屏幕锁定失败。会显示错误名称,发送截图有助于改进。

> 即使是 3~5 分钟的长视频,只要"屏幕开启"徽章不消失就能处理到最后。

### 显示"存储空间不足"

压缩处理需要 **至少输入视频大小的 2.5 倍** 的可用存储空间。

- 通过 **设置 → 通用 → iPhone 存储空间** 删除不需要的应用、照片、视频。
- 应用内已完成的视频可通过"分享"保存到照片库后用"删除"按钮从内部存储中清除。

### 显示"无法处理此视频"

视频文件可能已损坏,或使用了不支持的编解码器。

- **iPhone 设置 → 相机 → 格式设为"高效率"** 拍摄的视频处理最顺畅。
- "兼容性最佳"设置拍摄的视频也可处理,但文件大小较大。

---

## 隐私

- **您的视频不会离开您的 iPhone。**
- 所有处理都在 iPhone 的 Safari 内完成。
- 不存在服务器上传、日志记录、认证、用户追踪。
- 输出视频不包含 EXIF 或 **位置信息** (为保护隐私自动删除)。

服务本身仅由静态文件 (HTML / JavaScript) 从 Cloudflare Pages 分发,不存在接收视频数据的 API。

---

## 更新

从主屏幕启动时,如有新版本会自动更新。

如果新功能未生效,长按主屏幕图标 → "删除" → 在 Safari 中重新打开并重新添加到主屏幕 (旧缓存遗留情况的可靠解决方法)。

---

## 已知限制

- **iPad 横屏 / 大屏幕布局**: 暂不支持
- **超过 1GB 的输出**: iOS 共享菜单容易失败,自动切换为下载格式
- **编辑功能 / ComparePreview**: 无 (专注于压缩)
- **从中断点恢复**: 处理过程中应用被终止则会从头开始

---

## 反馈

bug 报告与功能请求请到 GitHub Issues:

🐛 https://github.com/kimymt/iphone-video-compressor/issues

实机问题报告时附上错误画面截图与 iOS 版本 (设置 → 通用 → 关于本机) 将有助于改进。

---

<details>
<summary>开发者信息</summary>

源代码: https://github.com/kimymt/iphone-video-compressor

技术规格与实现阶段详情请参考 [CLAUDE.md](./CLAUDE.md),未完成项目请参考 [TODOS.md](./TODOS.md)。

### 技术栈

Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS + Zustand + WebCodecs API + mediabunny + OPFS + IndexedDB + vite-plugin-pwa。

### 本地开发

```bash
npm install
npm run dev           # http://localhost:5173 (dev 下 Service Worker 也启用)
npm run build         # tsc -b + vite build
npm run preview       # vite preview → http://localhost:4173
```

### 测试

```bash
npm test                    # Vitest (unit)
npm run test:e2e            # Playwright (使用 dev 服务器)
npm run test:e2e:offline    # build + preview 离线验证
```

### iPhone 实机测试

通过 Cloudflare Tunnel 发布 HTTPS URL 在 iPhone Safari 中打开。

```bash
# Terminal A
npm run dev
# Terminal B
cloudflared tunnel --url http://localhost:5173
# → 在 iPhone Safari 中打开输出的 xxx.trycloudflare.com
```

Vite 5.4.12+ 的主机限制要求 `vite.config.ts` 的 `server.allowedHosts` 包含 `.trycloudflare.com`。

### 部署

push 到 `main` 后 Cloudflare Pages 自动构建并部署。

- 生产: https://ivc.mymt.casa
- 备用 URL (相同构建): https://iphone-video-compressor.pages.dev
- Build command: `npm run build` / Build output: `dist` / Framework preset: None
- 每个 Pull Request 自动生成 Preview Deployment

### 重新生成测试 fixture

`tests/fixtures/` 的视频已 commit。需要重新生成时使用 ffmpeg 与素材通过以下命令创建 (详情见 `tests/fixtures/README.md`)。

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

### 图标

`public/icons/` 下的 4 个 PNG (192 / 512 / maskable / apple-touch-icon 180) 当前是使用 ffmpeg 生成的占位图 (`#0a0a0a` 背景 + `#0a84ff` 中央方块)。发布前请替换为设计师制作的资源。

</details>

---

## 许可证

[MIT License](./LICENSE) — Copyright (c) 2026 kimymt
