/** Điểm/vectơ 2 chiều trong hệ toạ độ world. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Tạo một `Vec2` mới. */
export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

/** Kẹp `v` vào khoảng [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Nội suy tuyến tính giữa `a` và `b` theo `t` (không kẹp `t`). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
