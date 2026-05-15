import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Phase 6: PWA 化。VitePWA + Workbox を有効化、autoUpdate 戦略。
// COOP/COEP は mediabunny が SharedArrayBuffer を要求しない構成なので _headers 不要。
// (将来 mediabunny の SAB 経路を有効にするなら public/_headers を追加する)
//
// V1.1: SettingsSheet のバージョン情報表示用に __APP_VERSION__ を define で注入。
export default defineConfig({
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: '動画圧縮',
        short_name: '動画圧縮',
        description: 'iPhone の動画をローカルで圧縮',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        lang: 'ja',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        // OPFS 上の動画やテストフィクスチャは precache させない。
        // mediabunny の wasm は配信されない (純 TS 実装) ため `wasm` も除外。
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallback: '/index.html',
      },
      devOptions: {
        // dev サーバーでも SW を有効化して E2E / 手動検証で挙動を確認できる
        enabled: true,
        type: 'module',
      },
    }),
  ],
  worker: { format: 'es' },
  server: {
    port: 5173,
    host: true,
    // Cloudflare Tunnel (cloudflared --url http://localhost:5173) で iPhone 実機確認するため。
    // Vite 5.4.12+ のセキュリティ強化で外部ホストはホワイトリスト化が必要。
    allowedHosts: ['.trycloudflare.com'],
  },
});
