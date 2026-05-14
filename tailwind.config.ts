import type { Config } from 'tailwindcss';

// デザインシステムのトークンは index.css の CSS 変数で定義。
// Tailwind からは `bg-[var(--surface)]` のように `[]` 構文で参照する。
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        text: ['var(--font-text)'],
        mono: ['var(--font-mono)'],
      },
      backdropBlur: {
        glass: '24px',
      },
    },
  },
  plugins: [],
};

export default config;
