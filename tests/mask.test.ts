
import { describe, it, expect } from 'vitest';

import {
  Mask,
  maskUnion,
  maskIntersect,
  maskSubtract,
  maskShift,
  maskPolygon,
  maskEllipse,
  maskOutline
} from '../src/core/mask.ts';

describe('Mask', () => {
  it('sets and reads pixels', () => {
    const m = new Mask(10, 10);
    m.set(3, 4);

    expect(m.get(3, 4)).toBe(true);
    expect(m.get(0, 0)).toBe(false);
  });

  it('clears all pixels', () => {
    const m = new Mask(10, 10);
    m.set(3, 4);
    m.clear();

    expect(m.get(3, 4)).toBe(false);
    expect(m.bounds()).toBeNull();
  });

  it('calculates bounds', () => {
    const m = new Mask(10, 10);

    m.set(2, 3);
    m.set(7, 8);

    expect(m.bounds()).toEqual({
      x0: 2, y0: 3, x1: 7, y1: 8
    });
  });

  it('computes union', () => {
    const a = new Mask(10, 10);
    const b = new Mask(10, 10);

    a.set(2, 2);
    b.set(5, 5);

    const result = maskUnion(a, b);

    expect(result.get(2, 2)).toBe(true);
    expect(result.get(5, 5)).toBe(true);
  });

  it('computes intersection', () => {
    const a = new Mask(10, 10);
    const b = new Mask(10, 10);

    a.set(2, 2);
    a.set(4, 4);
    b.set(2, 2);

    const result = maskIntersect(a, b);

    expect(result.get(2, 2)).toBe(true);
    expect(result.get(4, 4)).toBe(false);
  });

  it('computes subtraction', () => {
    const a = new Mask(10, 10);
    const b = new Mask(10, 10);

    a.set(2, 2);
    a.set(4, 4);
    b.set(2, 2);

    const result = maskSubtract(a, b);

    expect(result.get(2, 2)).toBe(false);
    expect(result.get(4, 4)).toBe(true);
  });

  it('shifts pixels', () => {
    const m = new Mask(10, 10);
    m.set(3, 3);

    const result = maskShift(m, 2, 1);

    expect(result.get(5, 4)).toBe(true);
    expect(result.get(3, 3)).toBe(false);
  });

  it('fills a square polygon', () => {
    const m = new Mask(20, 20);

    maskPolygon(m, [
      { x: 2, y: 2 },
      { x: 12, y: 2 },
      { x: 12, y: 12 },
      { x: 2, y: 12 }
    ]);

    expect(m.get(5, 5)).toBe(true);
    expect(m.get(15, 15)).toBe(false);
  });
});


describe('maskOutline', () => {
  it('creates a 1-pixel square outline', () => {
    const m = new Mask(10, 10);

    // Hình vuông 5 x 5
    for (let y = 2; y <= 6; y++) {
      for (let x = 2; x <= 6; x++) {
        m.set(x, y);
      }
    }

    const outline = maskOutline(m, 1);

    let count = 0;

    for (const pixel of outline.data) {
      if (pixel !== 0) count++;
    }

    expect(count).toBe(16);
    expect(outline.get(2, 2)).toBe(true);
    expect(outline.get(4, 4)).toBe(false);
  });

  it('does not modify the original mask', () => {
    const m = new Mask(10, 10);
    m.set(5, 5);

    maskOutline(m);

    expect(m.get(5, 5)).toBe(true);
  });

  it('returns an empty outline for an empty mask', () => {
    const m = new Mask(10, 10);
    const outline = maskOutline(m);

    expect(outline.bounds()).toBeNull();
  });
});



describe('Overlapping ellipse masks', () => {
  it('should merge two overlapping ellipses', () => {
    const a = new Mask(100, 100);
    const b = new Mask(100, 100);

    maskEllipse(a, 40, 50, 20, 15);
    maskEllipse(b, 60, 50, 20, 15);

    const merged = maskUnion(a, b);
    const outline = maskOutline(merged);

    expect(merged.get(40, 50)).toBe(true);
    expect(merged.get(50, 50)).toBe(true);
    expect(merged.get(60, 50)).toBe(true);

    // Pixel trong vùng chồng nhau không là viền
    expect(outline.get(50, 50)).toBe(false);
  });
});


describe('Mask shift edge cases', () => {
  it('should not create unwanted edge stripes', () => {
    const m = new Mask(20, 20);

    m.set(10, 10);

    const shifted = maskShift(m, 5, 0);

    expect(shifted.get(15, 10)).toBe(true);
    expect(shifted.get(10, 10)).toBe(false);
    expect(shifted.get(0, 10)).toBe(false);
  });
});
