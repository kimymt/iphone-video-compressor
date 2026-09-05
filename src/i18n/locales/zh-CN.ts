// V2.x: 简体中文 (zh-CN) 翻译。
// 适用区域: 中国大陆 / 新加坡 / 马来西亚 (zh-Hans 系)。
// `Messages` 型 (ja.ts) に対する satisfies で、キーの抜けや余りが TS エラーになる。
//
// 翻訳ポリシー:
// - 技術用語 (HEVC / H.264 / WebCodecs / Wake Lock / OPFS / PWA) は原文のまま
// - "iOS 26+" / "iPhone" / "Safari" もそのまま
// - 单位 (Mbps / kbps / px / MB / GB) は数字のまま

import type { Messages } from './ja';

export const zhCN: Messages = {
  app: {
    title: '视频压缩',
    subtitle: '仅限 iOS 26+',
    fullTitle: '视频压缩 — 仅限 iOS 26+',
    loadingAria: '正在检测环境',
    loading: '检测中…',
    queueRestoreFailed: '无法恢复队列。请重新启动应用。',
  },

  empty: {
    title: '暂无内容',
    hint: '点击下方"选择视频"开始',
  },

  filePicker: {
    cta: '选择视频',
    loading: '加载中…',
    aria: '选择视频',
  },

  status: {
    queued: '排队中',
    starting: '正在启动…',
    processing: '处理中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  },

  queueItem: {
    deleting: '正在删除…',
    deletionFailed: '未能删除视频数据，数据可能仍保留在此设备上。请点击删除按钮重试。',
    aria: '{fileName}、{status}、进度 {percent}%',
    cancelAria: '取消 {fileName} 的处理',
    retryAria: '重试 {fileName}',
    removeAria: '删除 {fileName}',
    retryDisabledTitle: '输入文件已删除,无法重试',
    sub: {
      queued: '{size} · {status}',
      queuedWithEstimate: '{size} → 约 {estimatedSize}',
      processing: '{size} · {status}',
      processingEta: '{size} · 剩余 {duration}',
      processingWithEstimate: '{size} → 约 {estimatedSize}',
      done: '{inputSize} → {outputSize} ({ratio}%)',
      doneNoOutput: '{size} · 已完成',
      failed: '此视频无法处理',
      cancelled: '{size} · {status}',
    },
  },

  queueList: {
    aria: '压缩队列',
    clearAllAria: '清除所有 {count} 个已完成项目',
    clearAllCta: '清除已完成 ({count})',
    saveAllAria: '保存所有 {count} 个已完成项目',
    saveAllCta: '保存全部 ({count})',
  },

  wakeLock: {
    activeAria: '正在压缩。保持 Wake Lock 以防止屏幕变暗',
    activeTitle: 'Wake Lock 已激活 (屏幕不会变暗)',
    activeLabel: '屏幕保持',
    failedAria: '无法获取 Wake Lock{errLabel}。屏幕可能会变暗',
    failedTitleWithError: 'Wake Lock 获取失败 ({errorName}): {errorMessage}',
    failedTitleNoError: 'Wake Lock 获取失败: 屏幕可能会变暗',
    failedLabel: '屏幕保持失败',
    errSuffix: ': {errorName}',
  },

  settings: {
    title: '设置',
    dialogAria: '设置',
    openAria: '打开设置',
    closeAria: '关闭',
    backdropAria: '关闭设置',
    section: {
      preset: '压缩预设',
      storage: '存储',
      camera: '推荐相机设置',
      pwa: '添加到主屏幕',
      version: '版本',
      language: '语言',
      hevcBench: 'HEVC 并行基准测试',
    },
    presetGroupAria: '压缩预设',
    h264Only: '* 此设备不支持 HEVC, 仅显示 H.264 预设。',
    storage: {
      barAria: '存储使用率',
      loading: '加载中…',
      unknown: '无法获取使用量',
      usage: '{used} / {total}',
      available: '可用: {size}',
    },
    cameraTipHtml:
      '将 iPhone 的<strong>设置 → 相机 → 格式 → 高效</strong>开启,拍摄的 HEVC 视频更易于压缩处理。',
    cameraDismiss: '不再显示',
    pwaGuideHtml:
      '在 Safari 底部点击分享按钮 (□↑) → <strong>"添加到主屏幕"</strong>,即可全屏启动并稳定处理。',
    appName: '视频压缩',
    versionLabel: 'v{version}',
    sourceLink: '源代码 (GitHub)',
    language: {
      auto: '自动 (当前: {current})',
      ja: '日本語',
      en: 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ko: '한국어',
    },
    hevcBench: {
      intro: '测量 2 路并行 HEVC 是否更快,并自动选择最佳并行度。',
      summary: '加速 ×{speedup} — 并行 {parallelism}',
      lastRun: '上次运行: {ago}',
      running: '测量中…',
      runButton: '运行基准测试',
      rerunButton: '重新运行',
      neverRun: '尚未运行',
      parallelism1: '1 (HEVC 串行)',
      parallelism2: '2 (完全并行)',
      failed: '基准测试失败: {error}',
      done: '基准测试完成: 加速 ×{speedup}',
    },
  },

  preset: {
    'best-hevc': {
      label: '最高画质 (HEVC)',
      description: '保持原始分辨率, 12 Mbps / 192 kbps',
    },
    'high-hevc': {
      label: '高画质 (HEVC)',
      description: '长边 1080px, 5 Mbps / 128 kbps',
    },
    'standard-hevc': {
      label: '标准 (HEVC)',
      description: '长边 1080px, 3 Mbps / 128 kbps (默认)',
    },
    'light-hevc': {
      label: '轻量 (HEVC)',
      description: '长边 720px, 1.5 Mbps / 96 kbps',
    },
    'compat-h264': {
      label: '兼容优先 (H.264)',
      description: '长边 1080px, 5 Mbps / 128 kbps, H.264 High',
    },
    'min-h264': {
      label: '最小 (H.264)',
      description: '长边 480px, 800 kbps / 64 kbps, H.264 Baseline',
    },
  },

  share: {
    aria: '分享 {fileName}',
    downloaded: '已开始下载',
    cancelled: '已取消分享',
    failed: '分享失败: {error}',
    readFailed: '读取输出文件失败: {error}',
    saveAllCancelled: '已取消保存',
    saveAllFailedMulti: '保存失败,请逐个保存',
    saveAllNoneAvailable: '没有可保存的视频',
  },

  toast: {
    closeAria: '关闭',
  },

  unsupported: {
    title: '请在 iOS 26 或更新版本的 Safari 中打开本应用',
    body:
      '视频压缩需要 WebCodecs API。当前浏览器不支持必需的功能。请将 iPhone 更新到 iOS 26 或更新版本,然后在 Safari 中重新打开。',
    coreHeading: '必需功能 (不支持)',
    detailsSummary: '显示详细信息',
    optionalHeading: '不可用的可选功能:',
    feature: {
      videoEncoder: 'VideoEncoder (WebCodecs)',
      audioEncoder: 'AudioEncoder (WebCodecs)',
      h264Encode: 'H.264 编码',
      hevcEncode: 'HEVC 编码',
      webShareFiles: '分享 (navigator.share with files)',
      wakeLock: 'Wake Lock',
      opfs: 'OPFS 存储',
      persistentStorage: 'Persistent Storage',
    },
  },

  error: {
    quotaExceeded: '存储空间不足。还需要约 {size}。',
    writeFailed: '写入失败: {error}',
  },

  pwa: {
    offlineReady: '现在可以离线使用',
  },
};
