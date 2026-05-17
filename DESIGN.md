# Design System — 動画圧縮

> このデザインシステムは [PicsCompresser](https://github.com/kimymt/PicsCompresser) (画像圧縮 PWA) から流用。「Apple純正かと思った」を軸に同じデザイン言語を共有する。Product Context は本書には含めず、CLAUDE.md と機能要件で定義する。

## Aesthetic Direction
- **Direction:** iOS Native × Apple社内ツール風(Apple-internal-tool aesthetic)
- **Decoration level:** Intentional — `backdrop-filter: blur` は限定的に。主役は数値と余白
- **Mood:** 静かな実用性、磨かれたアルミの薄板のような質感。「Appleが社内で動画圧縮ツールを作ったらこうなる」というポジション
- **Memorable thing:** 「Apple純正かと思った」
- **Reference:** Apple HIG, Apple Compressor.app, Apple Configurator

## Typography

### スタック
| 用途 | スタック |
|------|---------|
| UI全般(Display/Body/Label) | `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif` |
| 数値・単位・パーセント・寸法 | `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` |

**重要:**
- `-apple-system` はiOS PWAでSF Proを正規取得する唯一のルート。一般的なWebではアンチパターンだが、iOS PWAでは正解。
- 数値フォントは **`ui-monospace` を採用**(iOS/macOS では SF Mono、その他 OS はシステム標準等幅)。外部フォントを読み込まないことで「Apple純正かと思った」軸と一致 + 初回ロード 30-80KB 削減。
- `font-feature-settings: "tnum"` を必ず有効化。

### スケール
- Display Hero: 64px / weight 700 / letter-spacing -0.03em
- Title: 28px / weight 600 / letter-spacing -0.02em
- Title 2: 20px / weight 600
- Body: 16px / weight 400
- Body Emphasized: 16px / weight 500
- Label: 13-15px / weight 500
- Meta / Caption: 12-13px / weight 400
- Numeric (mono): 13-14px / weight 500

## Color

### Approach
Restrained — iOSシステムカラーを基盤に、アクセントだけ独自に。

### Light Mode
| Token | Value | 用途 |
|-------|-------|------|
| `--bg` | `#F2F2F7` | iOS systemGroupedBackground、画面全体の地 |
| `--surface` | `#FFFFFF` | カード、行、シート |
| `--surface-2` | `#F9F9FB` | 二次的なサーフェス |
| `--text` | `#1C1C1E` | 本文(iOS label) |
| `--muted` | `#8E8E93` | 補足、キャプション(iOS secondaryLabel) |
| `--accent` | `#30694B` | アクセント、保存ボタン、削減バッジ |
| `--accent-soft` | `rgba(48, 105, 75, 0.08)` | バッジ背景、ホバー |
| `--divider` | `rgba(60, 60, 67, 0.12)` | 区切り線 |

### Dark Mode
| Token | Value |
|-------|-------|
| `--bg` | `#000000` |
| `--surface` | `#1C1C1E` |
| `--surface-2` | `#2C2C2E` |
| `--text` | `#FFFFFF` |
| `--muted` | `#8E8E93` |
| `--accent` | `#4A9472`(彩度を下げた苔緑) |
| `--accent-soft` | `rgba(74, 148, 114, 0.16)` |
| `--divider` | `rgba(84, 84, 88, 0.34)` |

### Semantic
- **Success(圧縮成功)**: `--accent` を流用
- **Warning(サイズ増・スキップ候補)**: `--muted` + ⚠️アイコン
- **Error**: 必要時のみ `#FF3B30` (iOS systemRed)

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — iOS HIG準拠の余裕

| Token | Value |
|-------|-------|
| 2xs | 4px |
| xs | 8px |
| sm | 12px |
| md | 16px |
| lg | 20px |
| xl | 24px |
| 2xl | 32px |
| 3xl | 40px |
| 4xl | 48px |

## Layout

### Approach
Grid-disciplined、1画面スクロール、画面遷移なし。

### Structure(メイン画面)
- **上部固定**: タイトル("動画圧縮" SF Pro Display 28pt) + Settings gear(右上、44pt tap target)
- **中央スクロール**: EmptyState(キュー空時、`Video` アイコン + 「まだ何もありません」) or QueueList(キューあり時、QueueItem の縦並び)
- **下部固定**: FilePicker(`Plus` アイコン + 「動画を選択」、sticky bottom、`--accent` 地、44pt 最小高さ、Safe area margin)

### Container
- Max content width: 480px(iPhone想定、PWA縦持ち)
- iPad/横向き: 将来検討(TODOS.md V2)

### Border Radius
| Token | Value | 用途 |
|-------|-------|------|
| sm | 6px | 削減バッジ、小型ピル |
| md | 10px | サムネイル、入力 |
| lg | 12px | ファイル行、小カード、ボタン |
| xl | 14px | 大カード、シート |
| full | 9999px | キャプセル、トグル |

## Motion

### Approach
Intentional, iOS流、控えめ。

### Easing
- enter: `ease-out`
- exit: `ease-in`
- move (default): `ease-in-out`

### Duration
- micro: 100ms(ホバー、状態変化)
- short: 150-250ms(基準 `0.25s ease-out`)
- medium: 300ms(キュー追加、バッジ表示)

### Indicators
- **進捗表示**: 円形スピナー(2pxボーダー、`border-top-color`回転、0.8s linear infinite)
- **完了表示**: 数値がフェードインで置換、左ストライプ(4px `--accent`)が即時表示

### 禁止
- **線形プログレスバー** — Webアプリ感を出す最大の戦犯
- バウンス過剰なスプリング(必要箇所のみ控えめに)

## Anti-Patterns(絶対に使わない)
- **iOS Blue `#007AFF` をアクセントに** — パクリ感の源
- **紫/バイオレットのグラデーション** — AIスロップの代表
- **3カラムアイコングリッド**
- **全部中央寄せのレイアウト**
- **装飾的なblob/blur shape**
- **ジェネリックなstock-photo風ヒーロー**
- **Inter / Roboto / Space Grotesk**(収束フォント)
- **Before/After比較プレビュー** — TODOS.md V2 スコープ除外と整合。圧縮前後の比較は既存動画プレイヤー(Photos.app PiP / QuickTime / VLC)で十分
- **線形プログレスバー**

## Implementation Template (CSS Variables)

```css
:root {
  --bg: #F2F2F7;
  --surface: #FFFFFF;
  --surface-2: #F9F9FB;
  --text: #1C1C1E;
  --muted: #8E8E93;
  --accent: #30694B;
  --accent-soft: rgba(48, 105, 75, 0.08);
  --divider: rgba(60, 60, 67, 0.12);
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.06);

  --font-ui: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 14px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000;
    --surface: #1C1C1E;
    --surface-2: #2C2C2E;
    --text: #FFFFFF;
    --muted: #8E8E93;
    --accent: #4A9472;
    --accent-soft: rgba(74, 148, 114, 0.16);
    --divider: rgba(84, 84, 88, 0.34);
    --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-elevated: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
}

body {
  font-family: var(--font-ui);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

.mono {
  font-family: var(--font-mono);
  font-feature-settings: "tnum";
}
```

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-12 | Initial design system created (PicsCompresser で確立) | `/design-consultation` で実施。Memorable thing「Apple純正かと思った」を軸に決定 |
| 2026-05-12 | アクセント色を `#30694B` 苔緑に | iOS Blue回避、Apple構造文法を借りつつ語彙で独自性 |
| 2026-05-12 | 数値専用に等幅フォント | SF Proの隣に等幅で「エンジニアリングツール」感 |
| 2026-05-13 | 数値フォントを `ui-monospace` (SF Mono) に変更 | 外部フォント読み込みコスト(30-80KB)と「Apple純正かと思った」軸の整合性のため、`ui-monospace` 経由で iOS は SF Mono を取得 |
| 2026-05-12 | 線形プログレスバーを使用禁止 | Webアプリ感の源を排除、iOS風円形スピナーに統一 |
| 2026-05-12 | `-apple-system` を正規ルートとして採用 | iOS PWAでSF Proを得る唯一のルート、gstack skillのblacklistから意図的逸脱 |
| 2026-05-13 | 保存失敗の通知はインライン(`--danger` 文字 + `rgba(255,59,48,0.1)` 地) | JS の `alert()` を排除。ブロッキングしない、iOS の inline error 流 |
| 2026-05-17 | 動画圧縮プロジェクトに本デザインシステムを移植 (本書作成) | PicsCompresser (画像圧縮 PWA) と同じデザイン言語に統一。CLAUDE.md の既存 v1 トークン(`--accent: #0a84ff` / 4px 線形 ProgressBar / Liquid Glass dark 背景)から本書のトークンへ移行。Liquid Glass の使用範囲(SettingsSheet と完了シェアシートの 2 箇所限定)は維持 |
| 2026-05-17 | 動画圧縮の Anti-Patterns に「Before/After比較プレビュー」を継続維持 | TODOS.md V2 スコープ除外決定と整合。iPhoneユーザーは画質より容量を気にする(画像圧縮と同じ哲学) |
