import type { Vec2 } from './vec2.ts';
import { vec2 } from './vec2.ts';

/**
 * Ma trận 3×3 column-major, 9 phần tử:
 *
 * ```
 * | m0 m3 m6 |   x' = m0*x + m3*y + m6
 * | m1 m4 m7 |   y' = m1*x + m4*y + m7
 * | m2 m5 m8 |   w' = m2*x + m5*y + m8  (affine: m2=m5=0, m8=1)
 * ```
 */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Ma trận đơn vị. */
export const mat3Identity: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Ma trận tịnh tiến `(x, y)`. */
export function mat3Translate(x: number, y: number): Mat3 {
  return [1, 0, 0, 0, 1, 0, x, y, 1];
}

/** Ma trận xoay `rad` rad theo chiều kim đồng hồ (trục +y hướng xuống như world). */
export function mat3Rotate(rad: number): Mat3 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

/** Ma trận tỉ lệ theo `sx`, `sy`. */
export function mat3Scale(sx: number, sy: number): Mat3 {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1];
}

/**
 * Nhân ma trận `a * b`: áp dụng `b` trước rồi tới `a`.
 * Ví dụ `mat3Multiply(mat3Translate(x, y), mat3Rotate(r))` = dịch rồi xoay.
 */
export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9);
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) {
      out[col * 3 + row] =
        a[row] * b[col * 3] +
        a[3 + row] * b[col * 3 + 1] +
        a[6 + row] * b[col * 3 + 2];
    }
  }
  return out as unknown as Mat3;
}

/** Áp dụng ma trận lên điểm (bỏ qua hàng w với affine). */
export function mat3Apply(m: Mat3, p: Vec2): Vec2 {
  return vec2(m[0] * p.x + m[3] * p.y + m[6], m[1] * p.x + m[4] * p.y + m[7]);
}

/** Nghịch đảo ma trận 3×3 (adjugate / định thức). Ném lỗi nếu không khả nghịch. */
export function mat3Invert(m: Mat3): Mat3 {
  // Ma trận theo hàng để tiện tính: row0 = (a b c), row1 = (d e f), row2 = (g h i).
  const a = m[0];
  const d = m[1];
  const g = m[2];
  const b = m[3];
  const e = m[4];
  const h = m[5];
  const c = m[6];
  const f = m[7];
  const i = m[8];

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) {
    throw new Error('mat3Invert: ma trận không khả nghịch (det ≈ 0)');
  }
  const k = 1 / det;

  // Kết quả nghịch đảo lưu column-major: out[col*3 + row] = inv[row][col].
  return [
    (e * i - f * h) * k,
    (f * g - d * i) * k,
    (d * h - e * g) * k,
    (c * h - b * i) * k,
    (a * i - c * g) * k,
    (b * g - a * h) * k,
    (b * f - c * e) * k,
    (c * d - a * f) * k,
    (a * e - b * d) * k,
  ];
}

/** Áp dụng ma trận cho danh sách điểm, trả về mảng mới. */
export function transformPoints(m: Mat3, pts: readonly Vec2[]): Vec2[] {
  return pts.map((p) => mat3Apply(m, p));
}

/**
 * Aproximation elip bằng đa giác đều `segments` điểm (mặc định 32).
 * Dùng cho elip bị xoay: `transformPoints` rồi `polygonFill`.
 */
export function ellipsePolygon(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 32,
): Vec2[] {
  const n = Math.max(3, Math.floor(segments));
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(vec2(cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
  }
  return pts;
}
