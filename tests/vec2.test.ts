import { describe, expect, it } from 'vitest';
import { clamp, lerp, vec2 } from '../src/core/vec2.ts';

describe('vec2 helpers', () => {
  it('vec2 có giá trị mặc định 0,0', () => {
    expect(vec2()).toEqual({ x: 0, y: 0 });
    expect(vec2(3, -4)).toEqual({ x: 3, y: -4 });
  });

  it('clamp kẹp vào khoảng', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('lerp nội suy tuyến tính', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(10, 0, 0.25)).toBe(7.5);
  });
});
