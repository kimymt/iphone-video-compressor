// V1.1: 設定 bottom sheet。
// V2: i18n 化 + 言語ピッカー UI を追加。
//
// CLAUDE.md「UI 仕様 > SettingsSheet」を参照。
// 歯車タップで下から sheet として登場、glass-panel 背景、drag-to-dismiss。
//
// 構成セクション:
// 1. プリセット選択 (getAvailablePresets ベース)
// 2. ストレージ使用量バー (getStorageInfo)
// 3. カメラ設定案内 (高効率推奨、dismiss 可)
// 4. PWA インストールガイド (standalone でなければ表示)
// 5. 言語選択 (V2、auto / ja / en の radio)
// 6. バージョン情報 (__APP_VERSION__ + GitHub リンク)
//
// Drag-to-dismiss:
// - touchstart で startY を記録
// - touchmove で下方向の delta を計算、panel に translateY を適用 (上方向は無視)
// - touchend で delta > 100px もしくは velocity > 0.5 px/ms なら onClose
// - それ以外は spring back (0 に戻す)
// - Reduced Motion: drag は動作するがアニメは即時切替

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings, X, HardDrive, Camera, Home, Github, Languages } from 'lucide-react';
import type { EnvCheck, PresetKey } from '../lib/types';
import { getAvailablePresets } from '../lib/presets';
import { getStorageInfo, type StorageInfo } from '../platform/storage';
import { useSettingsStore } from '../stores/settingsStore';
import { useT } from '../i18n';
import type { LocalePreference } from '../i18n';
import { formatBytes } from '../lib/format';

const DRAG_DISMISS_PX = 100;
const DRAG_DISMISS_VELOCITY_PX_MS = 0.5;
/** velocity-based dismiss を発火させるための最低 delta (px)。
 * これより小さいドラッグは、たとえ velocity が高くても無視する。
 * jsdom のテストで touch event 間の時間差が 0 になるケースで誤発火を防ぐ目的もある。 */
const DRAG_VELOCITY_MIN_DELTA_PX = 40;
/** open=false でも DOM を残してアニメ完了させるための余韻 (ms)。 */
const CLOSE_ANIMATION_MS = 350;

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  envCheck: EnvCheck;
  /** テスト用: standalone 判定をオーバーライド。未指定なら matchMedia から取得。 */
  isStandaloneOverride?: boolean;
  /** テスト用: ストレージ情報の取得を差し替え可能。 */
  fetchStorageInfo?: () => Promise<StorageInfo>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return false;
  try {
    if (matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    // matchMedia 未実装 (jsdom デフォルト) はスキップ
  }
  // iOS Safari 専用 API
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export default function SettingsSheet({
  open,
  onClose,
  envCheck,
  isStandaloneOverride,
  fetchStorageInfo,
}: SettingsSheetProps) {
  const preset = useSettingsStore((s) => s.preset);
  const setPreset = useSettingsStore((s) => s.setPreset);
  const cameraTipDismissed = useSettingsStore((s) => s.cameraTipDismissed);
  const dismissCameraTip = useSettingsStore((s) => s.dismissCameraTip);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const t = useT();
  const presets = useMemo(() => getAvailablePresets(envCheck), [envCheck]);

  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  /** 閉じアニメ中も DOM を残すために、open を遅延させて反映する mounted フラグ。 */
  const [mounted, setMounted] = useState(open);

  const dragStartRef = useRef<{ y: number; t: number } | null>(null);
  const dragLastRef = useRef<{ y: number; t: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // open=true で即マウント、open=false で CLOSE_ANIMATION_MS 後にアンマウント。
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // open=true になったらストレージ情報をロード (前回の値はキャッシュとして残す)。
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const fn = fetchStorageInfo ?? getStorageInfo;
    fn()
      .then((info) => {
        if (!cancelled) setStorage(info);
      })
      .catch(() => {
        if (!cancelled) setStorage({ usage: 0, quota: 0, available: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchStorageInfo]);

  // open=false 後にドラッグ状態をリセット (再開時に前回のドラッグが残らないように)。
  useEffect(() => {
    if (!open) {
      setDragDeltaY(0);
      setIsDragging(false);
      dragStartRef.current = null;
      dragLastRef.current = null;
    }
  }, [open]);

  // ESC キーで閉じる。
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const handlePresetSelect = useCallback(
    (key: PresetKey) => {
      setPreset(key);
    },
    [setPreset],
  );

  // ---- Drag-to-dismiss ----

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const now = performance.now();
    dragStartRef.current = { y: touch.clientY, t: now };
    dragLastRef.current = { y: touch.clientY, t: now };
    setIsDragging(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const now = performance.now();
    const delta = touch.clientY - dragStartRef.current.y;
    // 下方向のみ反映 (上方向は無視、上に引っ張られても 0 から動かない)
    setDragDeltaY(Math.max(0, delta));
    dragLastRef.current = { y: touch.clientY, t: now };
  }, []);

  const onTouchEnd = useCallback(() => {
    const start = dragStartRef.current;
    const last = dragLastRef.current;
    setIsDragging(false);
    dragStartRef.current = null;
    dragLastRef.current = null;
    if (start === null || last === null) {
      setDragDeltaY(0);
      return;
    }
    const delta = Math.max(0, last.y - start.y);
    const elapsed = Math.max(1, last.t - start.t);
    const velocity = delta / elapsed; // px/ms
    const fastFlick =
      delta >= DRAG_VELOCITY_MIN_DELTA_PX && velocity >= DRAG_DISMISS_VELOCITY_PX_MS;
    if (delta >= DRAG_DISMISS_PX || fastFlick) {
      // 閉じる: panel を画面外まで滑らせるアニメは onClose 後の open=false → translateY(100%) で表現
      setDragDeltaY(0);
      onClose();
    } else {
      // spring back to 0 — transition が有効になることでアニメする
      setDragDeltaY(0);
    }
  }, [onClose]);

  // ---- 表示 ----

  if (!mounted && !open) return null;

  const isStandalone = isStandaloneOverride ?? detectStandalone();

  // open=true & ドラッグ中: translateY(dragDeltaY)
  // open=true & 非ドラッグ: translateY(0)
  // open=false: translateY(100%) (sheet を画面外に滑らせる)
  const translateY = open ? `${dragDeltaY}px` : '100%';
  const panelStyle: React.CSSProperties = {
    transform: `translateY(${translateY})`,
    transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
  };

  const storagePct =
    storage && storage.quota > 0 ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  // 言語ピッカーのオプション (auto は表記を併記、ja/en は当該言語表記)
  const languageOptions: ReadonlyArray<{ value: LocalePreference; label: string }> = [
    { value: 'auto', label: t('settings.language.auto') },
    { value: 'ja', label: t('settings.language.ja') },
    { value: 'en', label: t('settings.language.en') },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.dialogAria')}
      data-testid="settings-sheet"
      data-state={open ? 'open' : 'closed'}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t('settings.backdropAria')}
        onClick={onClose}
        className="absolute inset-0 bg-black/40 transition-opacity"
        style={{
          opacity: open ? 1 : 0,
          transition: 'opacity 0.25s ease-out',
        }}
        tabIndex={-1}
      />

      {/* Sheet panel */}
      <div
        ref={panelRef}
        data-testid="settings-sheet-panel"
        className="glass-panel relative mx-auto flex max-h-[85vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl pb-[max(env(safe-area-inset-bottom),16px)] text-[var(--label)] shadow-2xl"
        style={panelStyle}
      >
        {/* Drag handle area (タッチイベントを受ける) */}
        <div
          data-testid="settings-sheet-handle"
          className="flex flex-col items-center pb-2 pt-3"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <span
            aria-hidden="true"
            className="block h-1.5 w-10 rounded-full bg-[var(--label-tertiary)]"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h2 className="title flex items-center gap-2 text-xl font-bold">
            <Settings aria-hidden="true" size={20} />
            {t('settings.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('settings.closeAria')}
            data-testid="settings-sheet-close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--label-secondary)] transition-opacity active:opacity-60"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* ---- プリセット ---- */}
          <section aria-labelledby="settings-preset-heading" className="pb-4">
            <h3
              id="settings-preset-heading"
              className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--label-secondary)]"
            >
              {t('settings.section.preset')}
            </h3>
            <div
              role="radiogroup"
              aria-label={t('settings.presetGroupAria')}
              className="overflow-hidden rounded-2xl bg-[var(--surface)]"
            >
              {presets.map((p, idx) => {
                const checked = preset === p.key;
                return (
                  <button
                    type="button"
                    key={p.key}
                    role="radio"
                    aria-checked={checked}
                    data-testid={`settings-preset-${p.key}`}
                    onClick={() => handlePresetSelect(p.key)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-elevated)] ${
                      idx !== presets.length - 1
                        ? 'border-b border-[var(--separator)]'
                        : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                        checked
                          ? 'border-[var(--accent)] bg-[var(--accent)]'
                          : 'border-[var(--label-tertiary)]'
                      }`}
                    >
                      {checked && (
                        <span className="block h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {t(`preset.${p.key}.label`)}
                      </span>
                      <span className="block pt-0.5 text-xs text-[var(--label-secondary)]">
                        {t(`preset.${p.key}.description`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {!envCheck.hevcEncode && (
              <p className="pt-2 text-xs text-[var(--label-secondary)]">
                {t('settings.h264Only')}
              </p>
            )}
          </section>

          {/* ---- ストレージ ---- */}
          <section aria-labelledby="settings-storage-heading" className="pb-4">
            <h3
              id="settings-storage-heading"
              className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--label-secondary)]"
            >
              {t('settings.section.storage')}
            </h3>
            <div className="rounded-2xl bg-[var(--surface)] px-4 py-3">
              <div className="flex items-center gap-2 pb-2">
                <HardDrive
                  aria-hidden="true"
                  size={16}
                  className="text-[var(--label-secondary)]"
                />
                <span className="tabular text-sm">
                  {storage === null ? (
                    <span className="text-[var(--label-secondary)]">
                      {t('settings.storage.loading')}
                    </span>
                  ) : storage.quota === 0 ? (
                    <span className="text-[var(--label-secondary)]">
                      {t('settings.storage.unknown')}
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">{formatBytes(storage.usage)}</span>
                      <span className="text-[var(--label-secondary)]">
                        {' / '}
                        {formatBytes(storage.quota)}
                      </span>
                    </>
                  )}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={t('settings.storage.barAria')}
                aria-valuenow={Math.round(storagePct)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--separator)]"
                data-testid="settings-storage-bar"
              >
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{ width: `${storagePct}%` }}
                />
              </div>
              {storage !== null && storage.quota > 0 && (
                <p className="tabular pt-2 text-xs text-[var(--label-secondary)]">
                  {t('settings.storage.available', { size: formatBytes(storage.available) })}
                </p>
              )}
            </div>
          </section>

          {/* ---- カメラ設定案内 ---- */}
          {!cameraTipDismissed && (
            <section aria-labelledby="settings-camera-heading" className="pb-4">
              <h3
                id="settings-camera-heading"
                className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--label-secondary)]"
              >
                {t('settings.section.camera')}
              </h3>
              <div className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm">
                <div className="flex items-start gap-3 pb-2">
                  <Camera
                    aria-hidden="true"
                    size={18}
                    className="mt-0.5 flex-shrink-0 text-[var(--accent)]"
                  />
                  <p
                    className="leading-snug text-[var(--label)]"
                    // 翻訳ファイル内のみで管理する静的 HTML (ユーザ入力なし)。XSS リスクなし。
                    dangerouslySetInnerHTML={{ __html: t('settings.cameraTipHtml') }}
                  />
                </div>
                <button
                  type="button"
                  onClick={dismissCameraTip}
                  data-testid="settings-camera-dismiss"
                  className="text-xs text-[var(--accent)] active:opacity-60"
                >
                  {t('settings.cameraDismiss')}
                </button>
              </div>
            </section>
          )}

          {/* ---- PWA インストールガイド ---- */}
          {!isStandalone && (
            <section aria-labelledby="settings-pwa-heading" className="pb-4">
              <h3
                id="settings-pwa-heading"
                className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--label-secondary)]"
              >
                {t('settings.section.pwa')}
              </h3>
              <div className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm">
                <div className="flex items-start gap-3">
                  <Home
                    aria-hidden="true"
                    size={18}
                    className="mt-0.5 flex-shrink-0 text-[var(--accent)]"
                  />
                  <p
                    className="leading-snug text-[var(--label)]"
                    dangerouslySetInnerHTML={{ __html: t('settings.pwaGuideHtml') }}
                  />
                </div>
              </div>
            </section>
          )}

          {/* ---- V2: 言語選択 ---- */}
          <section aria-labelledby="settings-language-heading" className="pb-4">
            <h3
              id="settings-language-heading"
              className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--label-secondary)]"
            >
              <Languages aria-hidden="true" size={12} className="-mt-0.5 mr-1 inline-block" />
              {t('settings.section.language')}
            </h3>
            <div
              role="radiogroup"
              aria-label={t('settings.section.language')}
              className="overflow-hidden rounded-2xl bg-[var(--surface)]"
            >
              {languageOptions.map((opt, idx) => {
                const checked = language === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    role="radio"
                    aria-checked={checked}
                    data-testid={`settings-language-${opt.value}`}
                    onClick={() => setLanguage(opt.value)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-elevated)] ${
                      idx !== languageOptions.length - 1
                        ? 'border-b border-[var(--separator)]'
                        : ''
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                        checked
                          ? 'border-[var(--accent)] bg-[var(--accent)]'
                          : 'border-[var(--label-tertiary)]'
                      }`}
                    >
                      {checked && (
                        <span className="block h-2 w-2 rounded-full bg-white" />
                      )}
                    </span>
                    <span className="flex-1 text-sm font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ---- バージョン情報 ---- */}
          <section aria-labelledby="settings-version-heading" className="pb-2">
            <h3
              id="settings-version-heading"
              className="pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--label-secondary)]"
            >
              {t('settings.section.version')}
            </h3>
            <div className="rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--label)]">{t('settings.appName')}</span>
                <span
                  className="tabular text-[var(--label-secondary)]"
                  data-testid="settings-version"
                >
                  {t('settings.versionLabel', { version: __APP_VERSION__ })}
                </span>
              </div>
              <a
                href="https://github.com/kimymt/iphone-video-compressor"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--accent)] active:opacity-60"
              >
                <Github aria-hidden="true" size={12} />
                {t('settings.sourceLink')}
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
