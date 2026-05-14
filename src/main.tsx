import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { registerAppServiceWorker } from './pwa/register-sw';
import { useToastStore } from './stores/toastStore';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Phase 6: PWA Service Worker 登録 (registerType=autoUpdate)。
// 失敗は console.warn のみで UI は止めない。
// onOfflineReady は初回 install + activate 完了時に発火し、Phase 7 で toast に流す。
registerAppServiceWorker(registerSW, {
  onOfflineReady: () => {
    useToastStore.getState().show('オフラインで使えるようになりました', {
      kind: 'success',
    });
  },
});
