// V2.x: 繁體中文 (zh-TW) 翻譯。
// 適用區域: 台灣 / 香港 / 澳門 (zh-Hant 系)。
// 用語は台湾華語ベース、香港用語との差異がある場合は中性的な台湾用語を採用。
//
// 翻訳ポリシー:
// - 技術用語 (HEVC / H.264 / WebCodecs / Wake Lock / OPFS / PWA) 原文のまま
// - "iOS 26+" / "iPhone" / "Safari" もそのまま
// - 單位 (Mbps / kbps / px / MB / GB) は数字のまま

import type { Messages } from './ja';

export const zhTW: Messages = {
  app: {
    title: '影片壓縮',
    subtitle: '僅限 iOS 26+',
    fullTitle: '影片壓縮 — 僅限 iOS 26+',
    loadingAria: '正在檢測環境',
    loading: '檢測中…',
    queueRestoreFailed: '無法恢復佇列。請重新啟動應用程式。',
  },

  empty: {
    title: '尚無內容',
    hint: '點擊下方「選擇影片」開始',
  },

  filePicker: {
    cta: '選擇影片',
    loading: '載入中…',
    aria: '選擇影片',
  },

  status: {
    queued: '排隊中',
    starting: '正在啟動…',
    processing: '處理中',
    done: '已完成',
    failed: '失敗',
    cancelled: '已取消',
  },

  queueItem: {
    aria: '{fileName}、{status}、進度 {percent}%',
    cancelAria: '取消 {fileName} 的處理',
    retryAria: '重試 {fileName}',
    removeAria: '刪除 {fileName}',
    retryDisabledTitle: '輸入檔案已刪除,無法重試',
    sub: {
      queued: '{size} · {status}',
      processing: '{size} · {status}',
      processingEta: '{size} · 剩餘 {duration}',
      done: '{inputSize} → {outputSize} ({ratio}%)',
      doneNoOutput: '{size} · 已完成',
      failed: '此影片無法處理',
      cancelled: '{size} · {status}',
    },
  },

  queueList: {
    aria: '壓縮佇列',
    clearAllAria: '清除所有 {count} 個已完成項目',
    clearAllCta: '清除已完成 ({count})',
    saveAllAria: '儲存所有 {count} 個已完成項目',
    saveAllCta: '全部儲存 ({count})',
  },

  wakeLock: {
    activeAria: '正在壓縮。保持 Wake Lock 以防止螢幕變暗',
    activeTitle: 'Wake Lock 已啟動 (螢幕不會變暗)',
    activeLabel: '螢幕保持',
    failedAria: '無法取得 Wake Lock{errLabel}。螢幕可能會變暗',
    failedTitleWithError: 'Wake Lock 取得失敗 ({errorName}): {errorMessage}',
    failedTitleNoError: 'Wake Lock 取得失敗: 螢幕可能會變暗',
    failedLabel: '螢幕保持失敗',
    errSuffix: ': {errorName}',
  },

  settings: {
    title: '設定',
    dialogAria: '設定',
    openAria: '開啟設定',
    closeAria: '關閉',
    backdropAria: '關閉設定',
    section: {
      preset: '壓縮預設',
      storage: '儲存空間',
      camera: '相機建議設定',
      pwa: '加到主畫面',
      version: '版本',
      language: '語言',
      hevcBench: 'HEVC 並行基準測試',
    },
    presetGroupAria: '壓縮預設',
    h264Only: '* 本裝置不支援 HEVC,僅顯示 H.264 預設。',
    storage: {
      barAria: '儲存空間使用率',
      loading: '載入中…',
      unknown: '無法取得使用量',
      usage: '{used} / {total}',
      available: '可用: {size}',
    },
    cameraTipHtml:
      '將 iPhone <strong>設定 → 相機 → 格式 → 高效率</strong>開啟,拍攝的 HEVC 影片更容易壓縮。',
    cameraDismiss: '不再顯示',
    pwaGuideHtml:
      '點擊 Safari 底部的分享按鈕 (□↑) → <strong>「加到主畫面」</strong>,即可全螢幕啟動並穩定處理。',
    appName: '影片壓縮',
    versionLabel: 'v{version}',
    sourceLink: '原始碼 (GitHub)',
    language: {
      auto: '自動 (目前: {current})',
      ja: '日本語',
      en: 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ko: '한국어',
    },
    hevcBench: {
      intro: '測量 2 路並行 HEVC 是否真的更快,並自動選擇最佳並行度。',
      summary: '加速 ×{speedup} — 並行 {parallelism}',
      lastRun: '上次執行: {ago}',
      running: '測量中…',
      runButton: '執行基準測試',
      rerunButton: '重新執行',
      neverRun: '尚未執行',
      parallelism1: '1 (HEVC 序列化)',
      parallelism2: '2 (完全並行)',
      failed: '基準測試失敗: {error}',
      done: '基準測試完成: 加速 ×{speedup}',
    },
  },

  preset: {
    'best-hevc': {
      label: '最高畫質 (HEVC)',
      description: '保持原始解析度, 12 Mbps / 192 kbps',
    },
    'high-hevc': {
      label: '高畫質 (HEVC)',
      description: '長邊 1080px, 5 Mbps / 128 kbps',
    },
    'standard-hevc': {
      label: '標準 (HEVC)',
      description: '長邊 1080px, 3 Mbps / 128 kbps (預設)',
    },
    'light-hevc': {
      label: '輕量 (HEVC)',
      description: '長邊 720px, 1.5 Mbps / 96 kbps',
    },
    'compat-h264': {
      label: '相容優先 (H.264)',
      description: '長邊 1080px, 5 Mbps / 128 kbps, H.264 High',
    },
    'min-h264': {
      label: '最小 (H.264)',
      description: '長邊 480px, 800 kbps / 64 kbps, H.264 Baseline',
    },
  },

  share: {
    aria: '分享 {fileName}',
    downloaded: '已開始下載',
    cancelled: '已取消分享',
    failed: '分享失敗: {error}',
    readFailed: '讀取輸出檔案失敗: {error}',
    saveAllCancelled: '已取消儲存',
    saveAllFailedMulti: '儲存失敗,請逐一儲存',
    saveAllNoneAvailable: '沒有可儲存的影片',
  },

  toast: {
    closeAria: '關閉',
  },

  unsupported: {
    title: '請在 iOS 26 或更新版本的 Safari 中開啟本應用程式',
    body:
      '影片壓縮需要 WebCodecs API。目前瀏覽器不支援必要功能。請將 iPhone 更新到 iOS 26 或更新版本,然後在 Safari 中重新開啟。',
    coreHeading: '必要功能 (不支援)',
    detailsSummary: '顯示詳細資訊',
    optionalHeading: '無法使用的選用功能:',
    feature: {
      videoEncoder: 'VideoEncoder (WebCodecs)',
      audioEncoder: 'AudioEncoder (WebCodecs)',
      h264Encode: 'H.264 編碼',
      hevcEncode: 'HEVC 編碼',
      webShareFiles: '分享 (navigator.share with files)',
      wakeLock: 'Wake Lock',
      opfs: 'OPFS 儲存空間',
      persistentStorage: 'Persistent Storage',
    },
  },

  error: {
    quotaExceeded: '儲存空間不足。還需要約 {size}。',
    writeFailed: '寫入失敗: {error}',
  },

  pwa: {
    offlineReady: '現在可以離線使用',
  },
};
