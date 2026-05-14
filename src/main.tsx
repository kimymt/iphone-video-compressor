import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { registerAppServiceWorker } from './pwa/register-sw';
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
// onOfflineReady は初回 install + activate 完了時に発火。
registerAppServiceWorker(registerSW, {
  onOfflineReady: () => {
    // eslint-disable-next-line no-console
    console.info('動画圧縮: オフラインで使えるようになりました');
  },
});
