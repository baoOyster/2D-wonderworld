import type { Vec2 } from './vec2.ts';

/**
 * Hộp bao trục song song (AABB) theo toạ độ world.
 * `x1`/`y1` là biên **bao gồm** (đỉnh cực đại nằm trên biên).
 */
export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const EPSILON = 1e-9;

/**
 * `true` nếu `p` nằm trên đoạn `a–b` (kể cả hai đầu).
 *
 * Dùng tích chéo có chuẩn hoá theo độ dài đoạn để sai số tương đối ổn định với
 * toạ độ world cỡ 1280.
 */
function pointOnSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cross = dx * (p.y - a.y) - dy * (p.x - a.x);
  const scale = Math.abs(dx) + Math.abs(dy) + 1;
  if (Math.abs(cross) > EPSILON * scale) return false;

  return (
    p.x >= Math.min(a.x, b.x) - EPSILON &&
    p.x <= Math.max(a.x, b.x) + EPSILON &&
    p.y >= Math.min(a.y, b.y) - EPSILON &&
    p.y <= Math.max(a.y, b.y) + EPSILON
  );
}

/**
 * Point-in-polygon bằng ray casting (even-odd), coi **điểm trên biên là trong**.
 *
 * Polygon là danh sách đỉnh world-space, không cần lặp lại đỉnh đầu. Đa giác
 * suy biến (<3 đỉnh) chỉ trả `true` khi điểm nằm đúng trên các cạnh.
 */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  if (poly.length === 0) return false;

  // Kiểm tra biên trước để mép/đỉnh luôn được tính là trong, tránh sai số
  // của ray casting khi tia đi đúng qua đỉnh.
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (pointOnSegment(p, poly[j], poly[i])) return true;
  }

  if (poly.length < 3) return false;

  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** `true` nếu điểm nằm trong **bất kỳ** polygon nào (dùng cho vật nhiều mảnh). */
export function pointInPolygons(p: Vec2, polygons: readonly (readonly Vec2[])[]): boolean {
  for (const poly of polygons) {
    if (pointInPolygon(p, poly)) return true;
  }
  return false;
}

/**
 * Hộp bao của một tập polygon world-space, hoặc `null` nếu không có đỉnh nào.
 * Dùng làm broad phase trước khi ray cast.
 */
export function boundsOf(polygons: readonly (readonly Vec2[])[]): Bounds | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let any = false;

  for (const poly of polygons) {
    for (const p of poly) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      any = true;
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
  }

  return any ? { x0, y0, x1, y1 } : null;
}

/** `true` nếu điểm nằm trong (hoặc trên biên) hộp bao. */
export function boundsContain(b: Bounds, p: Vec2): boolean {
  return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
}
