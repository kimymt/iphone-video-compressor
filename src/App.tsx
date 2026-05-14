// Phase 0: 「Hello」表示のみ。capability check と UI は Phase 1 以降。
export default function App() {
  return (
    <main className="app flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--label)]">
      <h1 className="title text-3xl font-bold">Hello, 動画圧縮</h1>
    </main>
  );
}
