import { clamp, lerp } from './vec2.ts';

/**
 * Màu packed dạng `0xRRGGBBAA`.
 *
 * Dùng số nguyên 32 bit không dấu để không phụ thuộc endian của máy.
 * Alpha nằm ở byte thấp: `0xff0000ff` là đỏ đục, `0xff000080` là đỏ alpha 50%.
 */
export type RGBA = number;

/** Các kênh màu rời (0…255). */
export interface RGBAChannels {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function parseHex(hex: string): number {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) {
    throw new Error(`Màu hex không hợp lệ: "${hex}" (cần #rgb, #rrggbb hoặc #rrggbbaa)`);
  }

  let digits = match[1];
  if (digits.length === 3) {
    digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
  }
  if (digits.length === 6) {
    digits += 'ff';
  }

  return Number.parseInt(digits, 16) >>> 0;
}

function toByte(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

/** Đóng gói 4 kênh 0…255 thành `0xRRGGBBAA`. */
export function pack(r: number, g: number, b: number, a: number): RGBA {
  return (
    ((toByte(r) << 24) | (toByte(g) << 16) | (toByte(b) << 8) | toByte(a)) >>> 0
  );
}

/** Tách `0xRRGGBBAA` thành 4 kênh 0…255. */
export function unpack(color: RGBA): RGBAChannels {
  const value = color >>> 0;
  return {
    r: (value >>> 24) & 0xff,
    g: (value >>> 16) & 0xff,
    b: (value >>> 8) & 0xff,
    a: value & 0xff,
  };
}

/**
 * Tạo màu đục từ chuỗi hex.
 * Chấp nhận `#rgb`, `#rrggbb`, `#rrggbbaa`; alpha (nếu có) bị bỏ qua.
 */
export function rgb(hex: string): RGBA {
  return (((parseHex(hex) & 0xffffff00) >>> 0) | 0xff) >>> 0;
}

/**
 * Tạo màu từ chuỗi hex với alpha 0…1.
 * `alpha = 0.5` → byte alpha 128.
 */
export function rgba(hex: string, alpha: number): RGBA {
  return withAlpha(rgb(hex), alpha);
}

/** Thay alpha của màu, giữ nguyên RGB. `alpha` nằm trong 0…1 và được kẹp lại. */
export function withAlpha(color: RGBA, alpha: number): RGBA {
  const byte = toByte(clamp(alpha, 0, 1) * 255);
  return ((((color & 0xffffff00) >>> 0) | byte) >>> 0);
}

/** Nội suy từng kênh (kể cả alpha) giữa `a` và `b`; `t` được kẹp vào 0…1. */
export function lerpColor(a: RGBA, b: RGBA, t: number): RGBA {
  const k = clamp(t, 0, 1);
  if (k === 0) return a >>> 0;
  if (k === 1) return b >>> 0;

  const ca = unpack(a);
  const cb = unpack(b);
  return pack(
    lerp(ca.r, cb.r, k),
    lerp(ca.g, cb.g, k),
    lerp(ca.b, cb.b, k),
    lerp(ca.a, cb.a, k),
  );
}
