// V2: 英語 (en) 翻訳。
// `Messages` 型 (ja.ts) に対する satisfies で、キーの抜けや余りが TS エラーになる。
//
// 翻訳ポリシー:
// - 技術用語 (HEVC, H.264, WebCodecs, Wake Lock, AudioEncoder, OPFS, PWA) はそのまま
// - プリセット名は素直な英語化 (Best Quality / Standard / Light / etc.)
// - エラー文言は短く、原因と対処を分けて書く
// - ARIA ラベルは screen reader 向けの自然な英語

import type { Messages } from './ja';

export const en: Messages = {
  app: {
    title: 'Video Compressor',
    subtitle: 'iOS 26+ only',
    fullTitle: 'Video Compressor — iOS 26+ only',
    loadingAria: 'Checking environment',
    loading: 'Checking…',
    queueRestoreFailed: 'Failed to restore the queue. Please restart the app.',
  },

  empty: {
    title: 'Nothing here yet',
    hint: 'Tap "Select Video" below to get started',
  },

  filePicker: {
    cta: 'Select Video',
    loading: 'Loading…',
    aria: 'Select video',
  },

  status: {
    queued: 'Queued',
    starting: 'Starting…',
    processing: 'Processing',
    done: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
  },

  queueItem: {
    aria: '{fileName}, {status}, {percent}% complete',
    cancelAria: 'Cancel processing for {fileName}',
    retryAria: 'Retry {fileName}',
    removeAria: 'Remove {fileName}',
    retryDisabledTitle: 'Cannot retry — the input file has been deleted',
    sub: {
      queued: '{size} · {status}',
      processing: '{size} · {status}',
      processingEta: '{size} · {duration} remaining',
      done: '{inputSize} → {outputSize} ({ratio}%)',
      doneNoOutput: '{size} · Done',
      failed: 'This video could not be processed',
      cancelled: '{size} · {status}',
    },
  },

  queueList: {
    aria: 'Compression queue',
    clearAllAria: 'Clear all {count} completed items',
    clearAllCta: 'Clear completed ({count})',
  },

  wakeLock: {
    activeAria: 'Compressing. Holding Wake Lock to keep the screen on',
    activeTitle: 'Wake Lock active (screen will not dim)',
    activeLabel: 'Screen on',
    failedAria: 'Failed to acquire Wake Lock{errLabel}. The screen may dim',
    failedTitleWithError: 'Wake Lock acquisition failed ({errorName}): {errorMessage}',
    failedTitleNoError: 'Wake Lock acquisition failed: the screen may dim',
    failedLabel: 'Screen on failed',
    errSuffix: ': {errorName}',
  },

  settings: {
    title: 'Settings',
    dialogAria: 'Settings',
    openAria: 'Open settings',
    closeAria: 'Close',
    backdropAria: 'Close settings',
    section: {
      preset: 'Compression preset',
      storage: 'Storage',
      camera: 'Recommended camera setting',
      pwa: 'Add to Home Screen',
      version: 'Version',
      language: 'Language',
    },
    presetGroupAria: 'Compression preset',
    h264Only: '* HEVC is not available on this device, so only H.264 presets are shown.',
    storage: {
      barAria: 'Storage usage',
      loading: 'Loading…',
      unknown: 'Storage usage unavailable',
      usage: '{used} / {total}',
      available: 'Free: {size}',
    },
    cameraTipHtml: 'Set iPhone <strong>Settings → Camera → Formats → High Efficiency</strong> to make HEVC recordings easier to compress.',
    cameraDismiss: 'Do not show again',
    pwaGuideHtml: 'Tap the share button (□↑) in Safari, then <strong>"Add to Home Screen"</strong>, to launch the app in full-screen mode for stable processing.',
    appName: 'Video Compressor',
    versionLabel: 'v{version}',
    sourceLink: 'Source code (GitHub)',
    language: {
      auto: 'Automatic (follow device setting)',
      ja: '日本語',
      en: 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ko: '한국어',
    },
  },

  preset: {
    'best-hevc': {
      label: 'Best Quality (HEVC)',
      description: 'Keep original resolution, 12 Mbps / 192 kbps',
    },
    'high-hevc': {
      label: 'High Quality (HEVC)',
      description: 'Long edge 1080px, 5 Mbps / 128 kbps',
    },
    'standard-hevc': {
      label: 'Standard (HEVC)',
      description: 'Long edge 1080px, 3 Mbps / 128 kbps (default)',
    },
    'light-hevc': {
      label: 'Light (HEVC)',
      description: 'Long edge 720px, 1.5 Mbps / 96 kbps',
    },
    'compat-h264': {
      label: 'Compatible (H.264)',
      description: 'Long edge 1080px, 5 Mbps / 128 kbps, H.264 High',
    },
    'min-h264': {
      label: 'Smallest (H.264)',
      description: 'Long edge 480px, 800 kbps / 64 kbps, H.264 Baseline',
    },
  },

  share: {
    aria: 'Share {fileName}',
    downloaded: 'Download started',
    cancelled: 'Share cancelled',
    failed: 'Share failed: {error}',
    readFailed: 'Failed to read output file: {error}',
  },

  toast: {
    closeAria: 'Close',
  },

  unsupported: {
    title: 'Please open this app in Safari on iOS 26 or later',
    body: 'Video compression requires the WebCodecs API. Your current browser does not support the required features. Please update your iPhone to iOS 26 or later and re-open this page in Safari.',
    coreHeading: 'Required features (unsupported)',
    detailsSummary: 'Show details',
    optionalHeading: 'Unavailable optional features:',
    feature: {
      videoEncoder: 'VideoEncoder (WebCodecs)',
      audioEncoder: 'AudioEncoder (WebCodecs)',
      h264Encode: 'H.264 encoding',
      hevcEncode: 'HEVC encoding',
      webShareFiles: 'Share (navigator.share with files)',
      wakeLock: 'Wake Lock',
      opfs: 'OPFS storage',
      persistentStorage: 'Persistent Storage',
    },
  },

  error: {
    quotaExceeded: 'Not enough storage. About {size} more is needed.',
    writeFailed: 'Write failed: {error}',
  },

  pwa: {
    offlineReady: 'Now available offline',
  },
};
