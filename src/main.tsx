import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { I18nProvider } from './i18n';
import { tForLocale, resolveLocale } from './i18n';
import { registerAppServiceWorker } from './pwa/register-sw';
import { useToastStore } from './stores/toastStore';
import { useSettingsStore } from './stores/settingsStore';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

// Phase 6: PWA Service Worker 登録 (registerType=autoUpdate)。
// 失敗は console.warn のみで UI は止めない。
// onOfflineReady は初回 install + activate 完了時に発火し、Phase 7 で toast に流す。
// V2: i18n の tForLocale で翻訳 (React 外なので useT は使えない)。
registerAppServiceWorker(registerSW, {
  onOfflineReady: () => {
    // settingsStore.language は localStorage から既に同期で読まれている (init() より前でも raw 値が読める)
    const lang = useSettingsStore.getState().language;
    const locale = resolveLocale(lang);
    useToastStore.getState().show(tForLocale(locale, 'pwa.offlineReady'), {
      kind: 'success',
    });
  },
});
