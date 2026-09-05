// V2: 日本語 (ja) 翻訳。
// 本ファイルは型推論の元。他 locale ファイル (en.ts) は `Messages` 型に対する satisfies で
// キーの整合性が build 時に保証される。
//
// キー命名規則:
// - 階層は dot で表記する文字列キー (`t('app.title')`)
// - 興味の単位ごとにネスト (app, empty, filePicker, status, settings, error, ...)
// - インターポレーション変数は `{name}` 形式 (interpolate ヘルパが処理)

export const ja = {
  app: {
    title: '動画圧縮',
    /** V2.x: iOS 26+ 専用であることをヘッダで明示するためのサブタイトル。
     *  最小限の文言で OS 制約を伝える (iOS 27 が出ても表記変更不要)。 */
    subtitle: 'iOS 26+ 専用',
    /** document.title 用の完全形 (タブ・PWA タイトル両方で使用)。 */
    fullTitle: '動画圧縮 — iOS 26+ 専用',
    loadingAria: '環境を確認中',
    loading: '確認中…',
    queueRestoreFailed: 'キューの復元に失敗しました。アプリを再起動してください。',
  },

  empty: {
    title: 'まだ何もありません',
    hint: '下の「動画を選択」から始められます',
  },

  filePicker: {
    cta: '動画を選択',
    loading: '読み込み中…',
    aria: '動画を選択',
  },

  status: {
    queued: 'キュー待ち',
    starting: '開始中…',
    processing: '処理中',
    done: '完了',
    failed: 'エラー',
    cancelled: 'キャンセル済み',
  },

  queueItem: {
    deleting: '削除中…',
    deletionFailed: '動画データを削除できませんでした。端末内に残っている可能性があります。削除ボタンで再試行してください。',
    aria: '{fileName}、{status}、進捗 {percent}%',
    cancelAria: '{fileName} の処理を中止',
    retryAria: '{fileName} を再試行',
    removeAria: '{fileName} を削除',
    retryDisabledTitle: '入力ファイルが削除されているため再試行できません',
    sub: {
      queued: '{size} · {status}',
      /** V2.x (D2): peek (A2) で durationSec 取得済みの queued/starting で使用。 */
      queuedWithEstimate: '{size} → 約 {estimatedSize}',
      processing: '{size} · {status}',
      processingEta: '{size} · 残り {duration}',
      /** V2.x (D2): processing 中で ETA がまだ算出されていないが peek で予測サイズが
       *  分かっているとき。ETA が出るまでの空白期間にも予測値を見せる。 */
      processingWithEstimate: '{size} → 約 {estimatedSize}',
      done: '{inputSize} → {outputSize} ({ratio}%)',
      doneNoOutput: '{size} · 完了',
      failed: 'この動画は処理できませんでした',
      cancelled: '{size} · {status}',
    },
  },

  queueList: {
    aria: '圧縮キュー',
    clearAllAria: '完了したアイテム {count} 件をすべて削除',
    clearAllCta: '完了をすべて削除 ({count})',
    /** V2: バルク保存ボタン (完了動画を 1 タップで Share Sheet に渡す) */
    saveAllAria: '完了したアイテム {count} 件をすべて保存',
    saveAllCta: '完了をすべて保存 ({count})',
  },

  wakeLock: {
    activeAria: '圧縮中。画面が暗くならないよう Wake Lock を取得中',
    activeTitle: 'Wake Lock 取得中 (画面が暗くなりません)',
    activeLabel: '画面 ON',
    failedAria: 'Wake Lock 取得に失敗しました{errLabel}。画面が暗くなる可能性があります',
    failedTitleWithError: 'Wake Lock 取得失敗 ({errorName}): {errorMessage}',
    failedTitleNoError: 'Wake Lock 取得失敗: 画面が暗くなる可能性があります',
    failedLabel: '画面 ON 失敗',
    /** `: NotAllowedError` のようなエラー名サフィックス。errorName を引数に渡す。 */
    errSuffix: ': {errorName}',
  },

  settings: {
    title: '設定',
    dialogAria: '設定',
    openAria: '設定を開く',
    closeAria: '閉じる',
    backdropAria: '設定を閉じる',
    section: {
      preset: '圧縮プリセット',
      storage: 'ストレージ',
      camera: 'カメラ設定の推奨',
      pwa: 'ホーム画面に追加',
      version: 'バージョン',
      language: '言語',
      hevcBench: 'HEVC 並列ベンチマーク',
    },
    presetGroupAria: '圧縮プリセット',
    h264Only: '※ HEVC が利用できない端末のため H.264 プリセットのみ表示しています。',
    storage: {
      barAria: 'ストレージ使用率',
      loading: '読み込み中…',
      unknown: '使用量を取得できません',
      usage: '{used} / {total}',
      available: '空き: {size}',
    },
    cameraTipHtml: 'iPhone の <strong>設定 → カメラ → フォーマット → 高効率</strong> に設定すると、撮影された HEVC 動画を圧縮処理しやすくなります。',
    cameraDismiss: '今後表示しない',
    pwaGuideHtml: 'Safari 下部の共有ボタン (□↑) → <strong>「ホーム画面に追加」</strong> を選ぶと、フルスクリーンで起動できて処理が安定します。',
    appName: '動画圧縮',
    versionLabel: 'v{version}',
    sourceLink: 'ソースコード (GitHub)',
    language: {
      auto: '自動 (現在: {current})',
      ja: '日本語',
      en: 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      ko: '한국어',
    },
    hevcBench: {
      /** ベンチ未実行時の説明文 */
      intro: '2 並列 HEVC が高速化するかを計測して、最適な並列度を自動選択します。',
      /** 結果サマリ: speedup の数値を表示 (例: 「speedup ×1.8 — 並列 2」) */
      summary: 'speedup ×{speedup} — 並列 {parallelism}',
      /** 最終実行のサブテキスト (例: 「最終実行: 5 分前」「最終実行: 2 日前」) */
      lastRun: '最終実行: {ago}',
      /** 計測中のラベル */
      running: '計測中…',
      /** 実行ボタン (未実行時) */
      runButton: 'ベンチを実行',
      /** 実行ボタン (再実行時) */
      rerunButton: '再実行',
      /** 結果不在時の文言 */
      neverRun: '未計測',
      /** parallelism 1 を意味するインライン文言 */
      parallelism1: '1 (HEVC を直列化)',
      parallelism2: '2 (最大並列)',
      /** エラー時のトースト文言 (詳細は {error} に入る) */
      failed: 'ベンチに失敗しました: {error}',
      /** 計測完了トースト (speedup を表示) */
      done: 'ベンチ完了: speedup ×{speedup}',
    },
  },

  preset: {
    'best-hevc': {
      label: '最高画質 (HEVC)',
      description: 'オリジナル解像度を維持、12 Mbps / 192 kbps',
    },
    'high-hevc': {
      label: '高画質 (HEVC)',
      description: '長辺 1080px、5 Mbps / 128 kbps',
    },
    'standard-hevc': {
      label: '標準 (HEVC)',
      description: '長辺 1080px、3 Mbps / 128 kbps（既定）',
    },
    'light-hevc': {
      label: '軽量 (HEVC)',
      description: '長辺 720px、1.5 Mbps / 96 kbps',
    },
    'compat-h264': {
      label: '互換優先 (H.264)',
      description: '長辺 1080px、5 Mbps / 128 kbps、H.264 High',
    },
    'min-h264': {
      label: '最小 (H.264)',
      description: '長辺 480px、800 kbps / 64 kbps、H.264 Baseline',
    },
  },

  share: {
    aria: '{fileName} を共有',
    downloaded: 'ダウンロードを開始しました',
    cancelled: '共有がキャンセルされました',
    failed: '共有に失敗しました: {error}',
    readFailed: '出力ファイルの読み込みに失敗しました: {error}',
    /** V2: バルク保存トースト (ユーザ文言は「保存」で統一) */
    saveAllCancelled: '保存がキャンセルされました',
    saveAllFailedMulti: '保存に失敗しました、個別に保存してください',
    saveAllNoneAvailable: '保存できる動画がありません',
  },

  toast: {
    closeAria: '閉じる',
  },

  unsupported: {
    title: 'このアプリは iOS 26 以降の Safari でお使いください',
    body: '動画圧縮には WebCodecs API が必要です。お使いのブラウザでは必須の機能が利用できません。iPhone を iOS 26 以降にアップデートして、Safari で開き直してください。',
    coreHeading: '必須機能 (未サポート)',
    detailsSummary: '詳細を表示',
    optionalHeading: '利用できない補助機能:',
    feature: {
      videoEncoder: 'VideoEncoder (WebCodecs)',
      audioEncoder: 'AudioEncoder (WebCodecs)',
      h264Encode: 'H.264 エンコード',
      hevcEncode: 'HEVC エンコード',
      webShareFiles: '共有 (navigator.share with files)',
      wakeLock: 'Wake Lock',
      opfs: 'OPFS ストレージ',
      persistentStorage: 'Persistent Storage',
    },
  },

  error: {
    quotaExceeded: '容量が足りません。あと約 {size} 必要です。',
    writeFailed: '書き込みに失敗しました: {error}',
  },

  pwa: {
    offlineReady: 'オフラインで使えるようになりました',
  },
};

// `as const` を付けないことで各 leaf が `string` 型に広がる → en.ts でも別の英文字列を代入可能。
// ネスト構造 (キー) は typeof で保持されるので satisfies チェックが効く。
export type Messages = typeof ja;
