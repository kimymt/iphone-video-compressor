// V2.x: 한국어 (ko) 번역.
// `Messages` 型 (ja.ts) に対する satisfies で、キーの抜けや余りが TS エラーになる。
//
// 翻訳ポリシー:
// - 技術用語 (HEVC / H.264 / WebCodecs / Wake Lock / OPFS / PWA) は原文のまま
// - "iOS 26+" / "iPhone" / "Safari" もそのまま
// - 단위 (Mbps / kbps / px / MB / GB) は数字のまま

import type { Messages } from './ja';

export const ko: Messages = {
  app: {
    title: '동영상 압축',
    subtitle: 'iOS 26+ 전용',
    fullTitle: '동영상 압축 — iOS 26+ 전용',
    loadingAria: '환경 확인 중',
    loading: '확인 중…',
    queueRestoreFailed: '대기열을 복원하지 못했습니다. 앱을 다시 시작해 주세요.',
  },

  empty: {
    title: '아직 항목이 없습니다',
    hint: '아래의 「동영상 선택」으로 시작하세요',
  },

  filePicker: {
    cta: '동영상 선택',
    loading: '불러오는 중…',
    aria: '동영상 선택',
  },

  status: {
    queued: '대기 중',
    starting: '시작 중…',
    processing: '처리 중',
    done: '완료',
    failed: '실패',
    cancelled: '취소됨',
  },

  queueItem: {
    deleting: '삭제 중…',
    deletionFailed: '동영상 데이터를 삭제하지 못했습니다. 기기에 남아 있을 수 있습니다. 삭제 버튼으로 다시 시도해 주세요.',
    aria: '{fileName}, {status}, 진행률 {percent}%',
    cancelAria: '{fileName} 처리 취소',
    retryAria: '{fileName} 재시도',
    removeAria: '{fileName} 삭제',
    retryDisabledTitle: '입력 파일이 삭제되어 재시도할 수 없습니다',
    sub: {
      queued: '{size} · {status}',
      queuedWithEstimate: '{size} → 약 {estimatedSize}',
      processing: '{size} · {status}',
      processingEta: '{size} · 남은 시간 {duration}',
      processingWithEstimate: '{size} → 약 {estimatedSize}',
      done: '{inputSize} → {outputSize} ({ratio}%)',
      doneNoOutput: '{size} · 완료',
      failed: '이 동영상은 처리할 수 없습니다',
      cancelled: '{size} · {status}',
    },
  },

  queueList: {
    aria: '압축 대기열',
    clearAllAria: '완료된 항목 {count}개 모두 삭제',
    clearAllCta: '완료 항목 모두 삭제 ({count})',
    saveAllAria: '완료된 항목 {count}개 모두 저장',
    saveAllCta: '완료 항목 모두 저장 ({count})',
  },

  wakeLock: {
    activeAria: '압축 중입니다. 화면이 꺼지지 않도록 Wake Lock 유지 중',
    activeTitle: 'Wake Lock 활성 (화면이 꺼지지 않음)',
    activeLabel: '화면 켜짐',
    failedAria: 'Wake Lock 획득 실패{errLabel}. 화면이 꺼질 수 있습니다',
    failedTitleWithError: 'Wake Lock 획득 실패 ({errorName}): {errorMessage}',
    failedTitleNoError: 'Wake Lock 획득 실패: 화면이 꺼질 수 있습니다',
    failedLabel: '화면 켜짐 실패',
    errSuffix: ': {errorName}',
  },

  settings: {
    title: '설정',
    dialogAria: '설정',
    openAria: '설정 열기',
    closeAria: '닫기',
    backdropAria: '설정 닫기',
    section: {
      preset: '압축 프리셋',
      storage: '저장 공간',
      camera: '권장 카메라 설정',
      pwa: '홈 화면에 추가',
      version: '버전',
      language: '언어',
      hevcBench: 'HEVC 병렬 벤치마크',
    },
    presetGroupAria: '압축 프리셋',
    h264Only: '* 이 기기에서는 HEVC를 사용할 수 없어 H.264 프리셋만 표시됩니다.',
    storage: {
      barAria: '저장 공간 사용률',
      loading: '불러오는 중…',
      unknown: '사용량을 가져올 수 없습니다',
      usage: '{used} / {total}',
      available: '여유 공간: {size}',
    },
    cameraTipHtml:
      'iPhone <strong>설정 → 카메라 → 포맷 → 고효율</strong>로 설정하면 촬영한 HEVC 동영상을 더 쉽게 압축할 수 있습니다.',
    cameraDismiss: '다시 표시하지 않기',
    pwaGuideHtml:
      'Safari 하단의 공유 버튼 (□↑) → <strong>「홈 화면에 추가」</strong>를 선택하면 전체 화면으로 실행되어 처리가 안정됩니다.',
    appName: '동영상 압축',
    versionLabel: 'v{version}',
    sourceLink: '소스 코드 (GitHub)',
    language: {
      auto: '자동 (현재: {current})',
      ja: '日本語',
      en: 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ko: '한국어',
    },
    hevcBench: {
      intro: '2 병렬 HEVC가 실제로 더 빠른지 측정하여 최적의 병렬도를 자동 선택합니다.',
      summary: '속도 향상 ×{speedup} — 병렬도 {parallelism}',
      lastRun: '마지막 실행: {ago}',
      running: '측정 중…',
      runButton: '벤치마크 실행',
      rerunButton: '다시 실행',
      neverRun: '아직 실행 안 함',
      parallelism1: '1 (HEVC 직렬화)',
      parallelism2: '2 (완전 병렬)',
      failed: '벤치마크 실패: {error}',
      done: '벤치마크 완료: 속도 향상 ×{speedup}',
    },
  },

  preset: {
    'best-hevc': {
      label: '최고 화질 (HEVC)',
      description: '원본 해상도 유지, 12 Mbps / 192 kbps',
    },
    'high-hevc': {
      label: '고화질 (HEVC)',
      description: '긴 변 1080px, 5 Mbps / 128 kbps',
    },
    'standard-hevc': {
      label: '표준 (HEVC)',
      description: '긴 변 1080px, 3 Mbps / 128 kbps (기본)',
    },
    'light-hevc': {
      label: '경량 (HEVC)',
      description: '긴 변 720px, 1.5 Mbps / 96 kbps',
    },
    'compat-h264': {
      label: '호환 우선 (H.264)',
      description: '긴 변 1080px, 5 Mbps / 128 kbps, H.264 High',
    },
    'min-h264': {
      label: '최소 (H.264)',
      description: '긴 변 480px, 800 kbps / 64 kbps, H.264 Baseline',
    },
  },

  share: {
    aria: '{fileName} 공유',
    downloaded: '다운로드를 시작했습니다',
    cancelled: '공유가 취소되었습니다',
    failed: '공유 실패: {error}',
    readFailed: '출력 파일을 읽지 못했습니다: {error}',
    saveAllCancelled: '저장이 취소되었습니다',
    saveAllFailedMulti: '저장에 실패했습니다, 개별로 저장해 주세요',
    saveAllNoneAvailable: '저장할 동영상이 없습니다',
  },

  toast: {
    closeAria: '닫기',
  },

  unsupported: {
    title: 'iOS 26 이상의 Safari에서 이 앱을 열어 주세요',
    body:
      '동영상 압축에는 WebCodecs API가 필요합니다. 현재 브라우저에서는 필수 기능을 사용할 수 없습니다. iPhone을 iOS 26 이상으로 업데이트한 뒤 Safari에서 다시 열어 주세요.',
    coreHeading: '필수 기능 (지원되지 않음)',
    detailsSummary: '자세히 보기',
    optionalHeading: '사용할 수 없는 부가 기능:',
    feature: {
      videoEncoder: 'VideoEncoder (WebCodecs)',
      audioEncoder: 'AudioEncoder (WebCodecs)',
      h264Encode: 'H.264 인코딩',
      hevcEncode: 'HEVC 인코딩',
      webShareFiles: '공유 (navigator.share with files)',
      wakeLock: 'Wake Lock',
      opfs: 'OPFS 저장 공간',
      persistentStorage: 'Persistent Storage',
    },
  },

  error: {
    quotaExceeded: '저장 공간이 부족합니다. 약 {size}이(가) 더 필요합니다.',
    writeFailed: '쓰기 실패: {error}',
  },

  pwa: {
    offlineReady: '이제 오프라인에서도 사용할 수 있습니다',
  },
};
