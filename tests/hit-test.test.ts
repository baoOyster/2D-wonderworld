import { describe, expect, it } from 'vitest';
import {
  boundsContain,
  boundsOf,
  pointInPolygon,
  pointInPolygons,
} from '../src/core/hit-test.ts';
import { vec2, type Vec2 } from '../src/core/vec2.ts';

const SQUARE: Vec2[] = [vec2(0, 0), vec2(100, 0), vec2(100, 100), vec2(0, 100)];
const TRIANGLE: Vec2[] = [vec2(0, 0), vec2(100, 0), vec2(50, 100)];
// Chữ L: băng ngang trên + cột trái; khuyết góc dưới-phải.
const CONCAVE: Vec2[] = [
  vec2(0, 0),
  vec2(100, 0),
  vec2(100, 20),
  vec2(20, 20),
  vec2(20, 100),
  vec2(0, 100),
];

describe('pointInPolygon', () => {
  it('nhận điểm trong tam giác', () => {
    expect(pointInPolygon(vec2(50, 25), TRIANGLE)).toBe(true);
    expect(pointInPolygon(vec2(10, 90), TRIANGLE)).toBe(false);
    expect(pointInPolygon(vec2(90, 90), TRIANGLE)).toBe(false);
  });

  it('nhận điểm trong hình vuông, loại điểm ngoài', () => {
    expect(pointInPolygon(vec2(50, 50), SQUARE)).toBe(true);
    expect(pointInPolygon(vec2(-1, 50), SQUARE)).toBe(false);
    expect(pointInPolygon(vec2(101, 50), SQUARE)).toBe(false);
    expect(pointInPolygon(vec2(50, 101), SQUARE)).toBe(false);
  });

  it('điểm trên cạnh và trên đỉnh được coi là trong', () => {
    expect(pointInPolygon(vec2(0, 50), SQUARE)).toBe(true);
    expect(pointInPolygon(vec2(100, 100), SQUARE)).toBe(true);
    expect(pointInPolygon(vec2(0, 0), SQUARE)).toBe(true);
    expect(pointInPolygon(vec2(50, 0), SQUARE)).toBe(true);
    expect(pointInPolygon(vec2(50, 100), SQUARE)).toBe(true);
  });

  it('xử lý polygon lõm: trong nhánh nhưng ngoài phần khuyết', () => {
    expect(pointInPolygon(vec2(10, 50), CONCAVE)).toBe(true);
    expect(pointInPolygon(vec2(50, 10), CONCAVE)).toBe(true);
    expect(pointInPolygon(vec2(50, 50), CONCAVE)).toBe(false);
    expect(pointInPolygon(vec2(80, 90), CONCAVE)).toBe(false);
  });

  it('polygon suy biến: chỉ đúng trên đoạn', () => {
    const segment = [vec2(0, 0), vec2(100, 100)];
    expect(pointInPolygon(vec2(50, 50), segment)).toBe(true);
    expect(pointInPolygon(vec2(50, 51), segment)).toBe(false);
    expect(pointInPolygon(vec2(0, 0), [])).toBe(false);
  });
});

describe('pointInPolygons', () => {
  it('đúng nếu thuộc bất kỳ mảnh nào', () => {
    const pieces = [SQUARE, [vec2(200, 200), vec2(300, 200), vec2(250, 300)]];
    expect(pointInPolygons(vec2(50, 50), pieces)).toBe(true);
    expect(pointInPolygons(vec2(250, 250), pieces)).toBe(true);
    expect(pointInPolygons(vec2(150, 150), pieces)).toBe(false);
    expect(pointInPolygons(vec2(0, 0), [])).toBe(false);
  });
});

describe('boundsOf', () => {
  it('AABB bao mọi đỉnh của mọi polygon', () => {
    const bounds = boundsOf([SQUARE, [vec2(-10, 20), vec2(40, 150)]]);
    expect(bounds).toEqual({ x0: -10, y0: 0, x1: 100, y1: 150 });
  });

  it('trả null khi không có đỉnh', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([[], []])).toBeNull();
  });

  it('bỏ qua toạ độ không hữu hạn', () => {
    const bounds = boundsOf([[vec2(Number.NaN, 5), vec2(10, 20)]]);
    expect(bounds).toEqual({ x0: 10, y0: 20, x1: 10, y1: 20 });
  });
});

describe('boundsContain', () => {
  it('tính cả biên', () => {
    const bounds = { x0: 0, y0: 0, x1: 100, y1: 50 };
    expect(boundsContain(bounds, vec2(50, 25))).toBe(true);
    expect(boundsContain(bounds, vec2(0, 0))).toBe(true);
    expect(boundsContain(bounds, vec2(100, 50))).toBe(true);
    expect(boundsContain(bounds, vec2(101, 25))).toBe(false);
    expect(boundsContain(bounds, vec2(50, -1))).toBe(false);
  });
});
