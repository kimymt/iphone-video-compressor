import { describe, it, expect } from 'vitest';
import { isBt2020Primaries } from './color-space';

// lib.dom.d.ts に 'bt2020' / 'hlg' / 'pq' は無いので unknown 経由でキャストして渡す。
function bt2020(extra?: Record<string, unknown>): VideoColorSpaceInit {
  return { primaries: 'bt2020', ...(extra ?? {}) } as unknown as VideoColorSpaceInit;
}

describe('isBt2020Primaries', () => {
  it('primaries=bt2020 (HLG) は true', () => {
    expect(isBt2020Primaries(bt2020({ transfer: 'hlg' }))).toBe(true);
  });

  it('primaries=bt2020 (PQ) は true', () => {
    expect(isBt2020Primaries(bt2020({ transfer: 'pq' }))).toBe(true);
  });

  it('primaries=bt709 は false', () => {
    expect(isBt2020Primaries({ primaries: 'bt709' })).toBe(false);
  });

  it('primaries=smpte170m は false', () => {
    expect(isBt2020Primaries({ primaries: 'smpte170m' })).toBe(false);
  });

  it('primaries 未指定は false (デフォルトを HDR 扱いしない)', () => {
    expect(isBt2020Primaries({})).toBe(false);
  });

  it('null は false', () => {
    expect(isBt2020Primaries(null)).toBe(false);
  });

  it('undefined は false', () => {
    expect(isBt2020Primaries(undefined)).toBe(false);
  });

  it('primaries=null (明示的に null) は false', () => {
    expect(isBt2020Primaries({ primaries: null })).toBe(false);
  });
});
