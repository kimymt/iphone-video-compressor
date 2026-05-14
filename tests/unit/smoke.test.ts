import { describe, it, expect } from 'vitest';

// Phase 0 smoke test: Vitest が動くことの最低限の確認。
// 各 Phase でこの test ファイルに段階的に追加していく予定。
describe('smoke', () => {
  it('1 + 1 === 2', () => {
    expect(1 + 1).toBe(2);
  });

  it('Vitest globals are available', () => {
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
  });
});
