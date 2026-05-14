import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phase 0: 最小設定。PWA 設定は Phase 6 で追加。
export default defineConfig({
  base: '/',
  plugins: [react()],
  worker: { format: 'es' },
  server: { port: 5173, host: true },
});
