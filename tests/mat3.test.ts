import { describe, expect, it } from 'vitest';
import {
  ellipsePolygon,
  mat3Apply,
  mat3Identity,
  mat3Invert,
  mat3Multiply,
  mat3Rotate,
  mat3Scale,
  mat3Translate,
  transformPoints,
  type Mat3,
} from '../src/core/mat3.ts';
import { vec2 } from '../src/core/vec2.ts';

function expectVec(actual: { x: number; y: number }, x: number, y: number, eps = 1e-9) {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
  void eps;
}

function expectMat(actual: Mat3, expected: readonly number[], eps = 1e-9) {
  for (let i = 0; i < 9; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 9);
  }
  void eps;
}

describe('mat3 cơ bản', () => {
  it('identity giữ nguyên điểm', () => {
    expect(mat3Apply(mat3Identity, vec2(3, -4))).toEqual({ x: 3, y: -4 });
  });

  it('translate dịch điểm', () => {
    expectVec(mat3Apply(mat3Translate(10, 20), vec2(3, 4)), 13, 24);
  });

  it('scale co giãn điểm', () => {
    expectVec(mat3Apply(mat3Scale(2, -3), vec2(5, 7)), 10, -21);
  });

  it('rotate 90° quay đúng chiều (y hướng xuống)', () => {
    // (1,0) xoay 90° theo chiều kim đồng hồ trên hệ y-down → (0,1)
    expectVec(mat3Apply(mat3Rotate(Math.PI / 2), vec2(1, 0)), 0, 1);
    expectVec(mat3Apply(mat3Rotate(Math.PI), vec2(1, 0)), -1, 0);
  });

  it('rotate 0 rad là identity', () => {
    expectMat(mat3Rotate(0), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});

describe('mat3Multiply', () => {
  it('multiply(a, b) áp dụng b trước rồi a', () => {
    // b = scale 2, a = translate (10,0): điểm (1,0) → scale → (2,0) → dịch → (12,0)
    const m = mat3Multiply(mat3Translate(10, 0), mat3Scale(2, 2));
    expectVec(mat3Apply(m, vec2(1, 0)), 12, 0);
  });

  it('multiply với identity giữ nguyên', () => {
    const m = mat3Translate(5, -7);
    expectMat(mat3Multiply(mat3Identity, m), [...m]);
    expectMat(mat3Multiply(m, mat3Identity), [...m]);
  });

  it('nhân không giao hoán', () => {
    const t = mat3Translate(10, 0);
    const s = mat3Scale(2, 2);
    expectVec(mat3Apply(mat3Multiply(t, s), vec2(1, 0)), 12, 0);
    expectVec(mat3Apply(mat3Multiply(s, t), vec2(1, 0)), 22, 0);
  });
});

describe('mat3Invert', () => {
  const cases: Array<[string, Mat3]> = [
    ['translate', mat3Translate(12, -5)],
    ['rotate', mat3Rotate(0.7)],
    ['scale đồng nhất', mat3Scale(2, 2)],
    ['scale không đồng nhất', mat3Scale(2, 0.5)],
    ['ghép T*R*S', mat3Multiply(mat3Multiply(mat3Translate(3, 4), mat3Rotate(1.1)), mat3Scale(2, 0.5))],
  ];

  for (const [name, m] of cases) {
    it(`invert(m) * m ≈ identity — ${name}`, () => {
      expectMat(mat3Multiply(mat3Invert(m), m), [...mat3Identity]);
      expectMat(mat3Multiply(m, mat3Invert(m)), [...mat3Identity]);
    });
  }

  it('điểm round-trip: invert đưa điểm về chỗ cũ', () => {
    const m = mat3Multiply(mat3Multiply(mat3Translate(7, -3), mat3Rotate(-0.4)), mat3Scale(1.5, 1.5));
    const p = vec2(11, 13);
    const back = mat3Apply(mat3Invert(m), mat3Apply(m, p));
    expectVec(back, p.x, p.y);
  });

  it('ném lỗi với ma trận suy biến', () => {
    expect(() => mat3Invert(mat3Scale(0, 1))).toThrow();
  });
});

describe('transformPoints & ellipsePolygon', () => {
  it('transformPoints trả về mảng mới, không đổi mảng gốc', () => {
    const pts = [vec2(1, 0), vec2(0, 1)];
    const out = transformPoints(mat3Translate(1, 1), pts);
    expect(out).not.toBe(pts);
    expect(out[0]).toEqual({ x: 2, y: 1 });
    expect(pts[0]).toEqual({ x: 1, y: 0 });
  });

  it('ellipsePolygon trả đủ điểm trên biên elip', () => {
    const pts = ellipsePolygon(10, 20, 5, 3, 8);
    expect(pts).toHaveLength(8);
    for (const p of pts) {
      const dx = (p.x - 10) / 5;
      const dy = (p.y - 20) / 3;
      expect(dx * dx + dy * dy).toBeCloseTo(1, 9);
    }
  });

  it('ellipsePolygon có ít nhất 3 điểm dù segments nhỏ', () => {
    expect(ellipsePolygon(0, 0, 1, 1, 1)).toHaveLength(3);
  });

  it('elip xoay = transformPoints + polygon (điểm vẫn trên elip đã xoay)', () => {
    const cxs = 100;
    const cys = 50;
    const base = ellipsePolygon(0, 0, 20, 10, 64);
    const m = mat3Multiply(mat3Translate(cxs, cys), mat3Rotate(Math.PI / 3));
    const rotated = transformPoints(m, base);
    // Kiểm tra khoảng cách tâm → điểm khớp với công thức elip đã xoay
    const inv = mat3Invert(m);
    for (const p of rotated) {
      const local = mat3Apply(inv, p);
      const v = (local.x / 20) ** 2 + (local.y / 10) ** 2;
      expect(v).toBeCloseTo(1, 9);
    }
    expect(rotated[0].x).toBeCloseTo(cxs + 20 * Math.cos(Math.PI / 3), 9);
    expect(rotated[0].y).toBeCloseTo(cys + 20 * Math.sin(Math.PI / 3), 9);
  });
});
