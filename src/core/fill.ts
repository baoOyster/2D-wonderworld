
import type { RGBA } from './color.ts';
import type { Vec2 } from './vec2.ts';
import type { RasterTarget } from './raster.ts';
import { Mask, maskOutline } from './mask.ts';
import {
  lineBresenham,
  thickLine
} from './raster.ts';
/**
 * Tô đa giác bằng thuật toán Scanline Even-Odd.
 *
 * - Hỗ trợ đa giác lồi, lõm và tự cắt.
 * - Bỏ qua cạnh ngang.
 * - Sử dụng khoảng half-open để xử lý đỉnh.
 * - Tự động cắt theo kích thước target.
 */
export function polygonFill(
  fb: RasterTarget,
  points: readonly Vec2[],
  color: RGBA
): void {
  if (points.length < 3) return;

  if (!points.every(p =>
    Number.isFinite(p.x) && Number.isFinite(p.y)
  )) return;

  const minY = Math.max(
    0,
    Math.ceil(Math.min(...points.map(p => p.y)) - 0.5)
  );

  const maxY = Math.min(
    fb.height - 1,
    Math.ceil(Math.max(...points.map(p => p.y)) - 0.5) - 1
  );

  const intersections: number[] = [];
  const opaque = (color & 0xff) === 255;

  for (let y = minY; y <= maxY; y++) {
    const scanY = y + 0.5;
    intersections.length = 0;

    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];

      // Bỏ qua cạnh ngang
      if (a.y === b.y) continue;

      const low = Math.min(a.y, b.y);
      const high = Math.max(a.y, b.y);

      // Half-open interval
      if (scanY < low || scanY >= high) continue;

      const x = a.x +
        ((scanY - a.y) * (b.x - a.x)) /
        (b.y - a.y);

      intersections.push(x);
    }

    intersections.sort((a, b) => a - b);

    // Tô các cặp giao điểm theo quy tắc Even-Odd
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = Math.max(
        0,
        Math.ceil(intersections[i] - 0.5)
      );

      const right = Math.min(
        fb.width - 1,
        Math.ceil(intersections[i + 1] - 0.5) - 1
      );

      for (let x = left; x <= right; x++) {
        if (opaque) {
          fb.setPixel(x, y, color);
        } else {
          fb.blendPixel(x, y, color);
        }
      }
    }
  }
}


/**
 * Vẽ viền đa giác khép kín bằng Bresenham.
 *
 * @param fb RasterTarget hoặc Framebuffer
 * @param points Danh sách các đỉnh đa giác
 * @param color Màu RGBA
 * @param width Độ dày đường viền, mặc định 1
 */
export function strokePolygon(
  fb: RasterTarget,
  points: readonly Vec2[],
  color: RGBA,
  width = 1
): void {
  if (points.length < 2) return;

  if (!Number.isFinite(width) || width <= 0) {
    return;
  }

  if (!points.every(p =>
    Number.isFinite(p.x) &&
    Number.isFinite(p.y)
  )) {
    return;
  }

  // Chống blend lặp tại các đỉnh chung
  // và các đoạn nét dày giao nhau.
  const seen = new Set<number>();

  const target: RasterTarget = {
    width: fb.width,
    height: fb.height,

    setPixel(x, y, c) {
      fb.setPixel(x, y, c);
    },

    blendPixel(x, y, c) {
      const key = y * fb.width + x;

      if (seen.has(key)) return;

      seen.add(key);
      fb.blendPixel(x, y, c);
    }
  };

  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];

    if (width <= 1.5) {
      lineBresenham(
        target,
        a.x, a.y,
        b.x, b.y,
        color
      );
    } else {
      thickLine(
        target,
        a.x, a.y,
        b.x, b.y,
        width,
        color
      );
    }
  }
}



/**
 * Target cho Flood Fill: cần đọc và ghi pixel.
 */
export type FloodTarget = RasterTarget & {
  getPixel(x: number, y: number): RGBA;
};

export interface FloodFillOptions {
  mode?: 'target' | 'boundary';
  boundary?: RGBA;
  maxPixels?: number;
}

/**
 * Flood Fill sử dụng Stack, kết nối 4 hướng.
 *
 * mode = 'target':
 *   Chỉ tô các pixel có màu giống pixel bắt đầu.
 *
 * mode = 'boundary':
 *   Tô vùng cho đến khi gặp màu boundary.
 *
 * Trả về số pixel đã tô.
 */
export function floodFill(
  fb: FloodTarget,
  startX: number,
  startY: number,
  color: RGBA,
  options: FloodFillOptions = {}
): number {
  const w = fb.width;
  const h = fb.height;

  if (!Number.isInteger(startX) ||
      !Number.isInteger(startY) ||
      startX < 0 || startY < 0 ||
      startX >= w || startY >= h) {
    return 0;
  }

  const mode = options.mode ?? 'target';
  const maxPixels = Math.min(
    w * h,
    Math.max(0, Math.floor(options.maxPixels ?? w * h))
  );

  if (!Number.isFinite(maxPixels) || maxPixels === 0) {
    return 0;
  }

  if (mode !== 'target' && mode !== 'boundary') {
    throw new Error('Invalid flood fill mode');
  }

  if (mode === 'boundary' &&
      options.boundary === undefined) {
    throw new Error('Boundary color is required');
  }

  const targetColor = fb.getPixel(startX, startY) >>> 0;
  const replacement = color >>> 0;
  const boundary = options.boundary;

  if (mode === 'target' &&
      targetColor === replacement) {
    return 0;
  }

  if (mode === 'boundary' &&
      targetColor === boundary) {
    return 0;
  }

  // Đánh dấu khi đưa vào stack để tránh lặp.
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  function push(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      return;
    }

    const index = y * w + x;
    if (visited[index]) return;

    const current = fb.getPixel(x, y) >>> 0;

    const valid = mode === 'target'
      ? current === targetColor
      : current !== boundary;

    if (!valid) return;

    visited[index] = 1;
    stack.push(index);
  }

  push(startX, startY);

  let painted = 0;

  while (stack.length > 0 && painted < maxPixels) {
    const index = stack.pop()!;
    const x = index % w;
    const y = Math.floor(index / w);

    // Opaque: ghi trực tiếp
    // Alpha < 255: sử dụng source-over
    if ((replacement & 0xff) === 255) {
      fb.setPixel(x, y, replacement);
    } else {
      fb.blendPixel(x, y, replacement);
    }

    painted++;

    // Bốn hướng: trái, phải, trên, dưới
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return painted;
}


/**
 * Tô các pixel thuộc Mask lên Framebuffer.
 *
 * clip là Mask tùy chọn để giới hạn vùng tô.
 * Mask và Framebuffer dùng chung hệ tọa độ.
 */
export function fillMask(
  fb: RasterTarget,
  m: Mask,
  color: RGBA,
  clip?: Mask
): void {
  if (clip &&
      (clip.width !== m.width ||
       clip.height !== m.height)) {
    throw new RangeError(
      'Mask and clip dimensions must match'
    );
  }

  const bounds = m.bounds();
  if (!bounds) return;

  const left = Math.max(0, bounds.x0);
  const top = Math.max(0, bounds.y0);
  const right = Math.min(fb.width - 1, bounds.x1);
  const bottom = Math.min(fb.height - 1, bounds.y1);

  const opaque = (color & 0xff) === 255;

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (!m.get(x, y)) continue;

      // Nếu có Mask cha, chỉ tô vùng giao nhau
      if (clip && !clip.get(x, y)) continue;

      if (opaque) {
        fb.setPixel(x, y, color);
      } else {
        fb.blendPixel(x, y, color);
      }
    }
  }
}


/**
 * Vẽ viền bên trong Mask.
 *
 * width = 1: lấy lớp biên đầu tiên.
 * width > 1: lấy thêm các lớp biên bên trong.
 *
 * Sử dụng lại maskOutline từ Phần A.
 */
export function outlineMask(
  fb: RasterTarget,
  m: Mask,
  color: RGBA,
  width = 1
): void {
  const outline = maskOutline(m, width);
  fillMask(fb, outline, color);
}
