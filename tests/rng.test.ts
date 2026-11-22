import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng.ts';

describe('createRng', () => {
  it('cùng seed cho cùng dãy số', () => {
    const a = createRng(12345);
    const b = createRng(12345);

    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('seed khác cho dãy khác', () => {
    const a = createRng(1);
    const b = createRng(2);

    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());

    expect(seqA).not.toEqual(seqB);
  });

  it('mọi giá trị nằm trong [0, 1)', () => {
    const rng = createRng(0xdeadbeef);

    for (let i = 0; i < 10_000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('ổn định theo seed (snapshot mulberry32)', () => {
    const rng = createRng(42);
    expect(rng()).toBeCloseTo(0.6011037519201636, 15);
    expect(rng()).toBeCloseTo(0.44829055899754167, 15);
    expect(rng()).toBeCloseTo(0.8524657934904099, 15);
  });
});
