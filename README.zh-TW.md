# 影片壓縮 — iPhone Video Compressor

[日本語](./README.md) | [English](./README.en.md) | [简体中文](./README.zh-CN.md) | **繁體中文** | [한국어](./README.ko.md)

將 iPhone 拍攝的影片在 iPhone 內部完成壓縮、不上傳到伺服器的應用程式。

🔗 **https://ivc.mymt.casa**

---

## 支援的裝置

- **iOS 26 或更新版本的 iPhone** (Safari)
- iOS 25 及更早版本技術上無法執行 (啟動時會顯示專用畫面提示)

> 為什麼僅限 iOS 26?
> 在 iPhone 上重新編碼影片音訊所需的 `AudioEncoder` API 從 iOS 26 才開始可用。

## 支援的語言

- 日本語 / English / 简体中文 / 繁體中文 / 한국어 5 種語言
- 依照 iPhone 語言設定自動切換 (設定 → 一般 → 語言與地區)
- 也可在應用程式設定 (右上方齒輪) 中手動選擇語言

---

## 使用方法

### 1. 加到主畫面 (僅首次)

1. 在 iPhone 的 **Safari** 中開啟 https://ivc.mymt.casa
2. 點擊下方分享按鈕 (□↑)
3. 從選單中選擇 **「加到主畫面」**
4. 從主畫面圖示啟動

> 也可直接從 Safari 分頁使用,但從主畫面啟動會以全螢幕模式執行,處理過程更穩定。

### 2. 壓縮影片

1. 點擊 **「選擇影片」** 按鈕從照片圖庫選擇影片
   - 支援多選。所有影片會進入佇列依序處理。
2. 自動開始壓縮
   - 顯示進度列與預估剩餘時間。
3. 完成後點擊 **「分享」**
   - 可選擇儲存到照片圖庫、AirDrop、訊息 / 郵件傳送、儲存到檔案 App 等。

### 3. 預設 (畫質與壓縮率平衡)

透過標題列右上方的 **齒輪圖示** 開啟設定面板切換預設。預設值為 **「標準 (HEVC)」**。

| 預設 | 適用場景 |
|---|---|
| 最高畫質 (HEVC) | 作為編輯原始素材保存 |
| 高畫質 (HEVC) | 在電視或 PC 上完整觀看 |
| **標準 (HEVC)** ★ 預設 | 日常使用,節省儲存空間 |
| 輕量 (HEVC) | 貼到 LINE / Slack |
| 相容優先 (H.264) | 傳送給 Android 或舊版 PC |
| 最小 (H.264) | 附加到郵件 |

> 不支援 HEVC 編碼的裝置僅顯示 H.264 系列預設。

---

## 常見問題

### 完成提示音不響

請檢查 iPhone 本體側面開關與音量。

1. **將 Ring/Silent 開關撥向 「Ring」** (橘色不可見的狀態)
2. 調高音量
3. **開始處理前先點擊一次 「選擇影片」 按鈕**

> 受 iOS 規範限制,靜音模式下網頁應用程式無法播放聲音 (應用程式端無法繞過)。此外,播放音訊需要使用者至少點擊一次螢幕 (首次點擊作為「允許播放聲音」的授權)。

### 處理過程中螢幕變暗

請檢查標題列右上方的徽章。

- **「螢幕開啟」** (太陽圖示,橘色) → 防止螢幕鎖定已啟用。無問題。
- **「螢幕開啟失敗」** (警告圖示,紅色) → 取得防止螢幕鎖定失敗。會顯示錯誤名稱,傳送截圖有助於改進。

> 即使是 3~5 分鐘的長影片,只要 「螢幕開啟」 徽章不消失就能處理到最後。

### 顯示 「儲存空間不足」

壓縮處理需要 **至少輸入影片大小的 2.5 倍** 的可用儲存空間。

- 透過 **設定 → 一般 → iPhone 儲存空間** 刪除不需要的應用程式、照片、影片。
- 應用程式內已完成的影片可透過 「分享」 儲存到照片圖庫後使用 「刪除」 按鈕從內部儲存空間清除。

### 顯示 「無法處理此影片」

影片檔案可能已損毀,或使用了不支援的編解碼器。

- **iPhone 設定 → 相機 → 格式設為 「高效率」** 拍攝的影片處理最順暢。
- 「相容性最佳」 設定拍攝的影片也可處理,但檔案大小較大。

---

## 隱私

- **您的影片不會離開您的 iPhone。**
- 所有處理都在 iPhone 的 Safari 內完成。
- 不存在伺服器上傳、記錄、認證、使用者追蹤。
- 輸出影片不包含 EXIF 或 **位置資訊** (為保護隱私自動刪除)。

服務本身僅由靜態檔案 (HTML / JavaScript) 從 Cloudflare Pages 分發,不存在接收影片資料的 API。

---

## 更新

從主畫面啟動時,如有新版本會自動更新。

如果新功能未生效,長按主畫面圖示 → 「刪除」 → 在 Safari 中重新開啟並重新加到主畫面 (舊快取殘留情況的可靠解決方法)。

---

## 已知限制

- **iPad 橫向 / 大螢幕版面配置**: 目前不支援
- **超過 1GB 的輸出**: iOS 分享選單容易失敗,自動切換為下載格式
- **編輯功能 / ComparePreview**: 無 (專注於壓縮)
- **從中斷點復原**: 處理過程中應用程式被終止則會從頭開始

---

## 意見回饋

bug 回報與功能請求請到 GitHub Issues:

🐛 https://github.com/kimymt/iphone-video-compressor/issues

實機問題回報時附上錯誤畫面截圖與 iOS 版本 (設定 → 一般 → 關於本機) 將有助於改進。

---

<details>
<summary>開發者資訊</summary>

原始碼: https://github.com/kimymt/iphone-video-compressor

技術規格與實作階段詳情請參考 [CLAUDE.md](./CLAUDE.md),未完成項目請參考 [TODOS.md](./TODOS.md)。

### 技術堆疊

Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS + Zustand + WebCodecs API + mediabunny + OPFS + IndexedDB + vite-plugin-pwa。

### 本地開發

```bash
npm install
npm run dev           # http://localhost:5173 (dev 下 Service Worker 也啟用)
npm run build         # tsc -b + vite build
npm run preview       # vite preview → http://localhost:4173
```

### 測試

```bash
npm test                    # Vitest (unit)
npm run test:e2e            # Playwright (使用 dev 伺服器)
npm run test:e2e:offline    # build + preview 離線驗證
```

### iPhone 實機測試

透過 Cloudflare Tunnel 發布 HTTPS URL 在 iPhone Safari 中開啟。

```bash
# Terminal A
npm run dev
# Terminal B
cloudflared tunnel --url http://localhost:5173
# → 在 iPhone Safari 中開啟輸出的 xxx.trycloudflare.com
```

Vite 5.4.12+ 的主機限制要求 `vite.config.ts` 的 `server.allowedHosts` 包含 `.trycloudflare.com`。

### 部署

push 到 `main` 後 Cloudflare Pages 自動建置並部署。

- 正式: https://ivc.mymt.casa
- 備用 URL (相同建置): https://iphone-video-compressor.pages.dev
- Build command: `npm run build` / Build output: `dist` / Framework preset: None
- 每個 Pull Request 自動產生 Preview Deployment

### 重新產生測試 fixture

`tests/fixtures/` 的影片已 commit。需要重新產生時使用 ffmpeg 與素材透過以下指令建立 (詳情見 `tests/fixtures/README.md`)。

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

### 圖示

`public/icons/` 下的 4 個 PNG (192 / 512 / maskable / apple-touch-icon 180) 目前是使用 ffmpeg 產生的佔位圖 (`#0a0a0a` 背景 + `#0a84ff` 中央方塊)。發佈前請替換為設計師製作的資源。

</details>

---

## 授權

本儲存庫為個人專案,目前尚未設定授權。
